// Decides whether a visitor's SQL may run and be shown on the profile.
//
// A query may only be built from SQL keywords, the profile's table and column
// names, numbers, two-letter aliases, and string literals that match values
// already in the data. So whatever a visitor types, nothing new can appear on
// the profile: every word in the result image already exists in the data.

const KEYWORDS = new Set(
  `SELECT FROM WHERE AND OR NOT NULL IS IN LIKE BETWEEN ORDER BY ASC DESC LIMIT OFFSET GROUP HAVING
   COUNT SUM AVG MIN MAX DISTINCT JOIN INNER LEFT RIGHT FULL OUTER CROSS ON USING EXPLAIN ANALYZE
   UNION INTERSECT EXCEPT ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE AS`.split(/\s+/),
);

const TOKEN = /\s+|'(?:[^']|'')*'|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|<=|>=|<>|!=|[(),.*=<>+\-/%;]/y;

export const MAX_LENGTH = 300;

/** The tables visitors can query, with fixed columns so an empty table still has a shape. */
export const SCHEMA = {
  projects: ['name', 'lang', 'stars', 'demo', 'pushed_days', 'pinned'],
  languages: ['lang', 'bytes', 'share_pct'],
  upstream_prs: ['repo', 'title', 'merged'],
};

export function tokenize(sql) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < sql.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(sql);
    if (!m) return { ok: false, reason: `"${sql[at]}" isn't allowed here.` };
    if (!/^\s+$/.test(m[0])) tokens.push(m[0]);
  }
  return { ok: true, tokens };
}

/** Builds the allowed vocabulary from the queryable tables. */
export function vocabulary(tables) {
  const names = new Set();
  const values = [];
  for (const [table, cols] of Object.entries(SCHEMA)) {
    names.add(table);
    for (const c of cols) names.add(c);
    for (const row of tables[table] ?? []) {
      for (const v of Object.values(row)) if (typeof v === 'string') values.push(v.toLowerCase());
    }
  }
  return { names, values };
}

export function check(raw, tables) {
  const sql = raw.trim().replace(/;\s*$/, '');
  if (!sql) return { ok: false, reason: 'The query is empty. Put it after `sql:` in the issue title.' };
  if (sql.length > MAX_LENGTH) return { ok: false, reason: `Keep the query under ${MAX_LENGTH} characters.` };
  if (sql.includes('--') || sql.includes('/*')) return { ok: false, reason: 'Comments aren\'t allowed.' };

  const t = tokenize(sql);
  if (!t.ok) return t;
  const { tokens } = t;
  const first = tokens[0]?.toUpperCase();
  if (first !== 'SELECT' && first !== 'EXPLAIN') {
    return { ok: false, reason: 'Only `SELECT` and `EXPLAIN` queries run here: the profile is read-only.' };
  }
  if (tokens.includes(';')) return { ok: false, reason: 'One statement at a time, please.' };

  const { names, values } = vocabulary(tables);
  for (const tok of tokens) {
    if (/^[A-Za-z_]/.test(tok)) {
      const up = tok.toUpperCase();
      if (up === 'INSERT' || up === 'UPDATE' || up === 'DELETE' || up === 'DROP' || up === 'CREATE' || up === 'ALTER') {
        return { ok: false, reason: 'Only `SELECT` and `EXPLAIN` queries run here: the profile is read-only.' };
      }
      if (KEYWORDS.has(up) || names.has(tok.toLowerCase()) || /^[a-z]{1,2}$/i.test(tok)) continue;
      return {
        ok: false,
        reason: `\`${tok}\` isn't a table, a column or a SQL keyword this profile knows.`,
      };
    }
    if (tok.startsWith("'")) {
      const inner = tok.slice(1, -1).replace(/''/g, "'").toLowerCase();
      const core = inner.replace(/[%_]/g, '');
      if (core.length > 40) return { ok: false, reason: 'String values must be 40 characters or fewer.' };
      if (core && !values.some((v) => v.includes(core))) {
        return { ok: false, reason: `No value in the data contains '${core.slice(0, 40)}', so it can't be used.` };
      }
    }
    if (/^\d/.test(tok) && tok.length > 12) return { ok: false, reason: 'That number is too long.' };
  }
  return { ok: true, sql };
}
