// SAMPLE DATA for local rendering only (`node scripts/build.mjs --sample`).
// It mirrors the shape of the real GraphQL response so normalize() is exercised,
// but the counts, languages and calendar are made up. CI always uses live data.

const lang = (name, color) => ({ name, color });
const TS = lang('TypeScript', '#3178c6'), PY = lang('Python', '#3572A5'), JS = lang('JavaScript', '#f1e05a');
const daysAgo = (now, n) => new Date(now - n * 86400000).toISOString();

export function sampleResponse(now = new Date()) {
  const repo = (name, description, primaryLanguage, homepageUrl, pushed) => ({
    name, description, url: `https://github.com/Naveen-Boddepalli/${name}`, homepageUrl,
    stargazerCount: 0, pushedAt: daysAgo(now, pushed), primaryLanguage,
  });
  const pinned = [
    repo('shadow-network', 'Decentralized Academic File Sharing for Campuses', JS, 'https://shadow-network-kappa.vercel.app', 1),
    repo('claude-desktop-mcp', 'MCP server tools for Claude-Desktop app', PY, null, 219),
    repo('flowinger', "A small, dependency-free React Flow alternative", TS, 'https://naveen-boddepalli.github.io/flowinger/', 0),
    repo('time-series-autoML', 'Automated ML and forecasting on time-series data', TS, 'https://time-series-auto-ml.vercel.app', 81),
    repo('heurix', 'Offline-capable codebase scanner and infrastructure YAML synthesizer', PY, 'https://naveen-boddepalli.github.io/heurix/', 1),
    repo('query-lens', 'In-browser toy relational database engine', TS, 'https://query-lens.1234naveenboddepalli.workers.dev', 5),
  ];
  const edges = (pairs) => ({ edges: pairs.map(([n, size]) => ({ size, node: n })) });
  const others = Array.from({ length: 18 }, (_, i) => ({
    name: `sample-${i}`, homepageUrl: i % 6 === 0 ? 'https://example.com' : null, stargazerCount: 0,
    pushedAt: daysAgo(now, 20 + i * 9), primaryLanguage: { name: [PY, JS, TS][i % 3].name },
    languages: edges([[[PY, JS, TS][i % 3], 20000 + i * 1500], [lang('CSS', '#663399'), 4000]]),
  }));
  const repositories = {
    nodes: [
      { name: 'Naveen-Boddepalli', homepageUrl: null, stargazerCount: 0, pushedAt: daysAgo(now, 0), primaryLanguage: null, languages: edges([]) },
      ...pinned.map((p, i) => ({
        name: p.name, homepageUrl: p.homepageUrl, stargazerCount: 0, pushedAt: p.pushedAt, primaryLanguage: { name: p.primaryLanguage.name },
        languages: edges([[p.primaryLanguage, 180000 - i * 15000], [lang('HTML', '#e34c26'), 9000], [lang('Rust', '#dea584'), i === 4 ? 30000 : 0]]),
      })),
      ...others,
      { name: 'real-estate-price-prediction', homepageUrl: null, stargazerCount: 0, pushedAt: daysAgo(now, 170), primaryLanguage: { name: 'Jupyter Notebook' }, languages: edges([[lang('Jupyter Notebook', '#DA5B0B'), 900000]]) },
    ],
  };
  const contributionDays = Array.from({ length: 365 }, (_, i) => {
    const n = 364 - i;
    const count = n < 9 ? 3 + (n % 4) : (n * 7) % 5 === 0 ? 0 : (n * 13) % 9;
    return { date: daysAgo(now, n).slice(0, 10), contributionCount: count };
  });
  return {
    data: {
      user: {
        pinnedItems: { nodes: pinned },
        repositories,
        thisYear: { totalCommitContributions: 640, contributionCalendar: { totalContributions: 812 } },
        lastYear: { contributionCalendar: { weeks: [{ contributionDays }] } },
      },
      upstream: {
        issueCount: 9,
        nodes: [
          { title: 'Add custom validator registration', mergedAt: daysAgo(now, 55), repository: { nameWithOwner: 'im-anishraj/arnio' } },
          { title: 'Fix IPv6 SSRF bypass', mergedAt: daysAgo(now, 80), repository: { nameWithOwner: 'Priyanshu-byte-coder/devtrack' } },
          { title: 'Fix service worker lifecycle', mergedAt: daysAgo(now, 105), repository: { nameWithOwner: 'SandeepVashishtha/Eventra' } },
          { title: 'Add xattr completion spec', mergedAt: daysAgo(now, 130), repository: { nameWithOwner: 'withfig/autocomplete' } },
          { title: 'Add redaction-aware HTML export', mergedAt: daysAgo(now, 155), repository: { nameWithOwner: 'im-anishraj/arnio' } },
        ],
      },
    },
  };
}
