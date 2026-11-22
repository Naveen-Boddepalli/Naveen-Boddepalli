// Player ratings for the Matchday theme, computed from the normalized profile
// data (data.mjs). Pure functions, no I/O.
//
// Each attribute is 40–99: 40 + 59 × a 0..1 score. Scores use a square root
// against an "elite" value, so early progress counts but the top is hard to
// reach. The elite values are deliberately high for a student profile, so the
// card can keep growing.

const FLOOR = 40, SPAN = 59;
const DAY = 86400000;

const clamp01 = (x) => (Number.isNaN(x) ? 0 : Math.min(1, Math.max(0, x)));
const root = (x, elite) => clamp01(Math.sqrt(Math.max(0, x) / elite));
const toRating = (score) => Math.round(FLOOR + SPAN * clamp01(score));

function median(xs) {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Order matters: it is the order on the card.
export const ATTRIBUTES = [
  { key: 'PAC', label: 'Pace', means: 'shipping cadence', weight: 0.15,
    how: 'median days since the last push across pinned repos (0 d = 99, 120 d or more = 40)' },
  { key: 'FIN', label: 'Finishing', means: 'ships usable things', weight: 0.2,
    how: 'share of public repos with a live demo (elite 50%), plus stars (elite 300)' },
  { key: 'VIS', label: 'Vision', means: 'range across languages', weight: 0.15,
    how: 'languages with at least 3% of code (elite 8)' },
  { key: 'TEA', label: 'Teamwork', means: 'open-source play', weight: 0.2,
    how: 'merged PRs to other people\'s repos (elite 50) and how many repos (elite 15)' },
  { key: 'STA', label: 'Stamina', means: 'volume this season', weight: 0.15,
    how: 'contributions this calendar year (elite 3000)' },
  { key: 'COM', label: 'Composure', means: 'consistency', weight: 0.15,
    how: 'best daily contribution streak in the last year (elite 100 days)' },
];

export function scores(d, now = new Date(d.generatedAt ?? Date.now())) {
  const pushedDays = (d.pinned ?? []).map((r) => Math.max(0, (now - new Date(r.pushedAt)) / DAY));
  const langs = d.tables?.languages?.map((l) => l.share_pct / 100) ?? (d.languages ?? []).map((l) => l.share);
  const demoShare = d.ownRepos > 0 ? d.liveDemos / d.ownRepos : 0;
  return {
    PAC: 1 - root(median(pushedDays), 120),
    FIN: 0.75 * root(demoShare, 0.5) + 0.25 * root(d.stars ?? 0, 300),
    VIS: clamp01(langs.filter((s) => s >= 0.03).length / 8),
    TEA: 0.6 * root(d.upstream?.prs ?? 0, 50) + 0.4 * root(d.upstream?.repos ?? 0, 15),
    STA: root(d.contributions ?? 0, 3000),
    COM: root(d.streak?.best ?? 0, 100),
  };
}

/** { overall, attrs: [{ key, label, means, how, value }] } */
export function ratings(d, now) {
  const s = scores(d, now);
  const attrs = ATTRIBUTES.map((a) => ({ ...a, value: toRating(s[a.key]) }));
  const overall = Math.round(attrs.reduce((sum, a) => sum + a.value * a.weight, 0));
  return { overall, attrs };
}

/** "2026/27" from August on, "2025/26" before, like a football season. */
export function season(now = new Date()) {
  const y = now.getUTCFullYear(), start = now.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}
