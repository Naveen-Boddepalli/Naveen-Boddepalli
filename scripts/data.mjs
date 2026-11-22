// Fetches profile data from the GitHub GraphQL API and normalizes it into
// the small model the SVG renderers use.

export const QUERY = `
query ($login: String!, $from: DateTime!, $prs: String!) {
  user(login: $login) {
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes {
        ... on Repository {
          name description url homepageUrl stargazerCount pushedAt
          primaryLanguage { name color }
        }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        name homepageUrl stargazerCount pushedAt
        primaryLanguage { name }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    thisYear: contributionsCollection(from: $from) {
      totalCommitContributions
      contributionCalendar { totalContributions }
    }
    lastYear: contributionsCollection {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
  upstream: search(query: $prs, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest { title number url mergedAt repository { nameWithOwner } } }
  }
}`;

export async function fetchProfile(login, token, now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-builder' },
    body: JSON.stringify({
      query: QUERY,
      variables: { login, from, prs: `author:${login} is:pr is:merged -user:${login}` },
    }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL request failed: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json;
}

const DAY = 86400000;

export function streaks(days, now = new Date()) {
  const counts = new Map(days.map((d) => [d.date, d.contributionCount]));
  const sorted = [...counts.keys()].sort();
  let best = 0, run = 0, prev = null;
  for (const date of sorted) {
    const t = Date.parse(date);
    run = counts.get(date) > 0 ? (prev !== null && t - prev === DAY && run > 0 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = t;
  }
  // Current streak: count back from today; an empty today doesn't break it yet.
  let cur = 0;
  let t = Date.parse(now.toISOString().slice(0, 10));
  if (!(counts.get(new Date(t).toISOString().slice(0, 10)) > 0)) t -= DAY;
  while (counts.get(new Date(t).toISOString().slice(0, 10)) > 0) { cur++; t -= DAY; }
  return { current: cur, best };
}

export function languageShares(repos, exclude = [], limit = Infinity) {
  const totals = new Map();
  for (const r of repos) {
    for (const e of r.languages?.edges ?? []) {
      if (exclude.includes(e.node.name)) continue;
      const cur = totals.get(e.node.name) ?? { name: e.node.name, color: e.node.color || '#8b949e', bytes: 0 };
      cur.bytes += e.size;
      totals.set(e.node.name, cur);
    }
  }
  const all = [...totals.values()].sort((a, b) => b.bytes - a.bytes);
  const sum = all.reduce((s, l) => s + l.bytes, 0) || 1;
  return all.slice(0, limit).map((l) => ({ ...l, share: l.bytes / sum }));
}

export function normalize(resp, cfg, now = new Date()) {
  const u = resp.data.user;
  const own = u.repositories.nodes.filter((r) => r.name.toLowerCase() !== cfg.login.toLowerCase());
  const days = u.lastYear.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const upstreamRepos = new Set(
    resp.data.upstream.nodes.map((n) => n?.repository?.nameWithOwner).filter(Boolean),
  );
  const pinnedNames = new Set(u.pinnedItems.nodes.filter(Boolean).map((r) => r.name));
  return {
    login: cfg.login,
    name: cfg.name,
    role: cfg.role,
    status: cfg.status,
    leetcodeSolved: cfg.leetcodeSolved,
    year: now.getUTCFullYear(),
    generatedAt: now.toISOString(),
    pinned: u.pinnedItems.nodes.filter(Boolean).map((r) => ({
      name: r.name,
      about: cfg.about?.[r.name] ?? r.description ?? '',
      url: r.url,
      demo: r.homepageUrl || null,
      stars: r.stargazerCount,
      pushedAt: r.pushedAt,
      lang: r.primaryLanguage ?? null,
    })),
    ownRepos: own.length,
    liveDemos: own.filter((r) => r.homepageUrl).length,
    stars: own.reduce((s, r) => s + r.stargazerCount, 0),
    contributions: u.thisYear.contributionCalendar.totalContributions,
    commits: u.thisYear.totalCommitContributions,
    upstream: {
      prs: resp.data.upstream.issueCount,
      repos: upstreamRepos.size,
      list: resp.data.upstream.nodes
        .filter((n) => n?.repository && n.mergedAt)
        .map((n) => ({ repo: n.repository.nameWithOwner, title: n.title, number: n.number, url: n.url, merged: n.mergedAt.slice(0, 10) }))
        .sort((a, b) => b.merged.localeCompare(a.merged)),
    },
    streak: streaks(days, now),
    languages: languageShares(own, cfg.excludeLanguages, 6),
    // Tables visitors can query with "query my profile" (scripts/query.mjs).
    tables: {
      projects: own.map((r) => ({
        name: r.name,
        lang: r.primaryLanguage?.name ?? null,
        stars: r.stargazerCount,
        demo: r.homepageUrl ? 'live' : null,
        pushed_days: Math.max(0, Math.floor((now - new Date(r.pushedAt)) / DAY)),
        pinned: pinnedNames.has(r.name) ? 1 : 0,
      })),
      languages: languageShares(own, cfg.excludeLanguages).map((l) => ({
        lang: l.name,
        bytes: l.bytes,
        share_pct: Math.round(l.share * 1000) / 10,
      })),
      upstream_prs: resp.data.upstream.nodes.filter((n) => n?.repository).map((n) => ({
        repo: n.repository.nameWithOwner,
        title: n.title,
        merged: (n.mergedAt ?? '').slice(0, 10),
      })),
    },
  };
}
