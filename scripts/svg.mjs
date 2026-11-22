// SVG renderers for the "EXPLAIN naveen" profile. Every image is plain SVG with
// CSS / SMIL animation only, so it survives GitHub's image proxy.

export const THEMES = {
  dark: {
    bg: '#0d1117', panel: '#161b22', border: '#30363d', faint: '#21262d',
    fg: '#e6edf3', dim: '#8b949e', accent: '#3fd0ff', keyword: '#ff7b72',
    green: '#7ee787', amber: '#f2cc60',
  },
  light: {
    bg: '#ffffff', panel: '#f6f8fa', border: '#d0d7de', faint: '#eaeef2',
    fg: '#1f2328', dim: '#59636e', accent: '#0a7ea4', keyword: '#cf222e',
    green: '#1a7f37', amber: '#9a6700',
  },
};

const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const W = 1000;
const CH = 0.6; // monospace advance per px of font-size

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function ago(iso, now = new Date()) {
  const d = Math.floor((now - new Date(iso)) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function frame({ w = W, h, t, title, body, css = '', defs = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
text { font-family: ${MONO}; font-size: 14px; fill: ${t.fg}; }
.dim { fill: ${t.dim}; } .acc { fill: ${t.accent}; } .kw { fill: ${t.keyword}; }
.grn { fill: ${t.green}; } .amb { fill: ${t.amber}; } .b { font-weight: 700; }
.sans { font-family: ${SANS}; }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
@keyframes slide { from { opacity: 0; transform: translateX(-10px); } }
@keyframes blink { 50% { opacity: 0; } }
@keyframes pulse { 50% { opacity: .35; } }
.cursor { animation: blink 1.1s steps(1) infinite; }
.pulse { animation: pulse 2s ease-in-out infinite; }
${css}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${defs ? `<defs>${defs}</defs>` : ''}
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
${body}
</svg>
`;
}

const prompt = (sql, x, y) => {
  // Highlight SQL keywords inside a psql prompt line.
  const parts = sql.split(/(\b(?:EXPLAIN|ANALYZE|SELECT|FROM|WHERE|LIMIT|ORDER BY|DESC)\b)/);
  const spans = parts
    .map((p, i) => (i % 2 ? `<tspan class="kw">${esc(p)}</tspan>` : esc(p)))
    .join('');
  return `<text x="${x}" y="${y}"><tspan class="acc b">naveen=#</tspan> ${spans}</text>`;
};

// ── hero ────────────────────────────────────────────────────────────────────
export function hero(d, t) {
  const X = 40, IND = 48, RIGHT = W - 40;
  const nodes = [
    { lvl: 0, label: 'Limit', detail: '(pinned)', rows: d.pinned.length },
    { lvl: 1, label: 'Hash Join', detail: `on author = '${d.login.toLowerCase()}'`, rows: d.ownRepos + d.upstream.prs },
    { lvl: 2, label: 'Seq Scan on github.repos', detail: '(own, public)', rows: d.ownRepos, sub: `Filter: shipped  (live demos: ${d.liveDemos})`, parent: 1 },
    { lvl: 2, label: 'Index Scan on upstream.pull_requests', detail: '', rows: d.upstream.prs, sub: `Index Cond: merged = true  (${d.upstream.repos} repos)`, parent: 1 },
  ];
  nodes[1].parent = 0;

  let y = 236;
  for (const n of nodes) {
    n.y = y;
    n.x = X + n.lvl * IND;
    y += n.sub ? 48 : 28;
  }
  const footY = y + 18;
  const h = footY + 30;

  const count = nodes.length;
  const lines = nodes.map((n, i) => {
    const delay = (0.25 + (count - 1 - i) * 0.18).toFixed(2); // bottom-up, like rows flowing up
    const sub = n.sub ? `<text x="${n.x + 36}" y="${n.y + 22}" class="dim" style="font-size:13px">${esc(n.sub)}</text>` : '';
    return `<g style="animation: in .5s ease-out ${delay}s backwards">
  <text x="${n.x}" y="${n.y}"><tspan class="grn b">-&gt;</tspan>  <tspan class="b">${esc(n.label)}</tspan>  <tspan class="dim">${esc(n.detail)}</tspan></text>
  <text x="${RIGHT}" y="${n.y}" text-anchor="end" class="dim">rows=<tspan class="acc b">${n.rows}</tspan></text>
  ${sub}
</g>`;
  });

  // Tree connectors from each child up to its parent, with a packet riding each one.
  const links = nodes.filter((n) => n.parent !== undefined).map((n, i) => {
    const p = nodes[n.parent];
    const vx = p.x + 9;
    const path = `M ${n.x - 4} ${n.y - 5} H ${vx} V ${p.y + 7}`;
    const dur = 2.4, begin = (1.2 + i * 0.7).toFixed(2);
    return `<path d="${path}" fill="none" stroke="${t.border}" stroke-width="1.5"/>
<circle r="3.2" fill="${t.green}" opacity="0">
  <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${path}"/>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
</circle>`;
  });

  const body = `
<text x="${X}" y="30" class="dim" style="font-size:12px">psql · ${esc(d.login.toLowerCase())}@github.com</text>
<circle cx="${RIGHT - 8 - esc(d.status).length * 12 * CH - 12}" cy="26" r="4" fill="${t.green}" class="pulse"/>
<text x="${RIGHT}" y="30" text-anchor="end" class="grn" style="font-size:12px">${esc(d.status)}</text>
<line x1="0" x2="${W}" y1="46" y2="46" stroke="${t.border}"/>
${prompt('EXPLAIN ANALYZE SELECT * FROM naveen;', X, 84)}
<text x="${X}" y="140" class="sans b" style="font-size:42px; letter-spacing:-.5px; animation: in .6s ease-out backwards">${esc(d.name)}</text>
<text x="${X}" y="172" class="dim" style="font-size:15px">${esc(d.role)}</text>
<text x="${X}" y="212" class="dim" style="font-size:12px; letter-spacing:1px">QUERY PLAN</text>
<line x1="${X}" x2="${RIGHT}" y1="220" y2="220" stroke="${t.faint}"/>
${links.join('\n')}
${lines.join('\n')}
<text x="${X}" y="${footY}" class="dim">Execution: <tspan class="fg">${d.contributions}</tspan> contributions in ${d.year} · current streak <tspan class="fg">${d.streak.current}</tspan> d<tspan class="acc"> </tspan></text>
<rect x="${X + ('Execution: ' + d.contributions + ' contributions in ' + d.year + ' · current streak ' + d.streak.current + ' d ').length * 14 * CH + 2}" y="${footY - 13}" width="8" height="16" fill="${t.accent}" class="cursor"/>`;

  return frame({ h, t, title: `${d.name}: ${d.role}`, body, css: `.fg { fill: ${t.fg}; }` });
}

// ── result set: one clickable row per pinned repo ───────────────────────────
export function resultHeader(d, t) {
  const body = `${prompt('SELECT name, about, lang, pushed, demo FROM pinned;', 24, 35)}`;
  return frame({ h: 56, t, title: 'Pinned projects', body });
}

export function resultRow(r, i, t, now = new Date()) {
  const h = 66, delay = (0.1 + i * 0.12).toFixed(2);
  const langX = 712;
  const lang = r.lang
    ? `<circle cx="${langX + 5}" cy="23" r="5" fill="${r.lang.color || t.dim}"/><text x="${langX + 16}" y="28" style="font-size:13px">${esc(r.lang.name)}</text>`
    : '';
  const stars = r.stars > 0 ? ` · ★ ${r.stars}` : '';
  const pill = r.demo
    ? `<rect x="878" y="21" width="96" height="24" rx="12" fill="none" stroke="${t.green}"/><text x="926" y="37" text-anchor="middle" class="grn" style="font-size:12px">live demo ↗</text>`
    : `<rect x="878" y="21" width="96" height="24" rx="12" fill="none" stroke="${t.border}"/><text x="926" y="37" text-anchor="middle" class="dim" style="font-size:12px">source ↗</text>`;
  const body = `
<g style="animation: slide .45s ease-out ${delay}s backwards">
  <text x="24" y="39" class="dim" style="font-size:13px">${String(i + 1).padStart(2, '0')}</text>
  <text x="64" y="28" class="acc b" style="font-size:16px">${esc(clip(r.name, 40))}</text>
  <text x="64" y="50" class="dim" style="font-size:13px">${esc(clip(r.about, 80))}</text>
  ${lang}
  <text x="${langX}" y="50" class="dim" style="font-size:12px">pushed ${ago(r.pushedAt, now)}${stars}</text>
  ${pill}
</g>
<rect x="-160" y="1" width="160" height="${h - 2}" fill="url(#sweep)" style="animation: sweep 1.1s ease-in-out ${delay}s 1 both"/>`;
  const defs = `<linearGradient id="sweep" x1="0" x2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="0"/><stop offset=".5" stop-color="${t.accent}" stop-opacity=".12"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient>`;
  const css = `@keyframes sweep { from { transform: translateX(0); } to { transform: translateX(${W + 160}px); } }`;
  return frame({ h, t, title: `${r.name}: ${r.about}`, body, defs, css });
}

export function resultFooter(d, t) {
  const n = d.pinned.length;
  const body = `<text x="24" y="27" class="dim">(${n} row${n === 1 ? '' : 's'})  ·  ${d.ownRepos} public repos, ${d.liveDemos} with live demos</text>`;
  return frame({ h: 42, t, title: `${n} pinned projects`, body });
}

// ── pg_stat panel ───────────────────────────────────────────────────────────
export function stats(d, t) {
  const X = 32, FS = 14, cw = FS * CH;
  const cols = [
    [`contributions_${d.year}`, d.contributions],
    ['commits', d.commits],
    ['prs_merged_upstream', d.upstream.prs],
    ['upstream_repos', d.upstream.repos],
    ['streak', `${d.streak.current} d`],
    ['best_streak', `${d.streak.best} d`],
    ['leetcode', d.leetcodeSolved],
  ];
  let x = X;
  const head = [], vals = [], seps = [];
  cols.forEach(([k, v], i) => {
    const width = (Math.max(k.length, String(v).length) + 2) * cw;
    head.push(`<text x="${x + cw}" y="88" class="dim">${esc(k)}</text>`);
    vals.push(`<text x="${x + width - cw}" y="118" text-anchor="end" class="${i === 0 ? 'acc b' : 'b'}" style="animation: in .4s ease-out ${(0.2 + i * 0.08).toFixed(2)}s backwards">${esc(v)}</text>`);
    x += width;
    if (i < cols.length - 1) seps.push(`<line x1="${x}" x2="${x}" y1="72" y2="126" stroke="${t.faint}"/>`);
  });
  const tableRight = x;

  const langTop = 214, rowH = 28, barX = 210, barW = W - 32 - 80 - barX;
  const max = Math.max(...d.languages.map((l) => l.share), 0.0001);
  const langs = d.languages.map((l, i) => {
    const y = langTop + i * rowH;
    const w = Math.max(2, (l.share / max) * barW);
    const delay = (0.5 + i * 0.09).toFixed(2);
    return `<circle cx="${X + 6}" cy="${y - 5}" r="5" fill="${l.color}"/>
<text x="${X + 20}" y="${y}">${esc(l.name)}</text>
<rect x="${barX}" y="${y - 11}" width="${barW}" height="10" rx="3" fill="${t.faint}"/>
<rect x="${barX}" y="${y - 11}" width="${w.toFixed(1)}" height="10" rx="3" fill="${l.color}" class="bar" style="animation-delay:${delay}s"/>
<text x="${W - 32}" y="${y}" text-anchor="end" class="dim">${(l.share * 100).toFixed(1)}%</text>`;
  });
  const h = langTop + d.languages.length * rowH + 8;

  const body = `
${prompt('SELECT * FROM pg_stat_naveen;', X, 44)}
${head.join('\n')}
<line x1="${X}" x2="${tableRight}" y1="98" y2="98" stroke="${t.border}"/>
${seps.join('\n')}
${vals.join('\n')}
<text x="${X}" y="150" class="dim" style="font-size:13px">(1 row)</text>
${prompt(`SELECT lang, share FROM pg_stat_languages LIMIT ${d.languages.length};`, X, 186)}
${langs.join('\n')}`;
  const css = `.bar { transform-box: fill-box; transform-origin: left center; animation: grow .9s cubic-bezier(.2,.7,.2,1) backwards; }
@keyframes grow { from { transform: scaleX(0); } }`;
  return frame({ h, t, title: `GitHub stats for ${d.name}`, body, css });
}

// ── links styled as psql meta-commands ──────────────────────────────────────
export function linkButton(label, t) {
  const text = `\\${label}`;
  const w = Math.ceil(text.length * 14 * CH + 36), h = 38;
  const body = `<text x="18" y="24"><tspan class="dim">\\</tspan><tspan class="acc">${esc(label)}</tspan></text>`;
  return frame({ w, h, t, title: label, body });
}

// ── footer ──────────────────────────────────────────────────────────────────
export function footer(d, t, buildMs, files) {
  const stamp = d.generatedAt.slice(0, 16).replace('T', ' ');
  const body = `
<text x="24" y="30" class="dim">-- regenerated ${esc(stamp)} UTC · ${files} images · built in ${buildMs} ms</text>
<text x="24" y="54" class="dim">-- thanks for stopping by. probably debugging a segfault right now.</text>
${prompt('\\q', 24, 84)}
<rect x="${24 + 'naveen=# \\q '.length * 14 * CH + 2}" y="71" width="8" height="16" fill="${t.accent}" class="cursor"/>`;
  return frame({ h: 104, t, title: `Regenerated ${stamp} UTC`, body });
}

// ── query my profile ────────────────────────────────────────────────────────
const cell = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

/** The last visitor query and its result, psql style. `q` comes from scripts/query.mjs. */
export function queryResult(q, t) {
  const X = 32, FS = 14, cw = FS * CH, maxChars = Math.floor((W - 2 * X) / cw) - 9;
  // Wrap the SQL onto at most two lines at word boundaries.
  const words = q.sql.split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > maxChars && cur) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  if (lines.length > 2) lines.splice(2, lines.length - 2, '…');
  let y = 44;
  const sqlLines = lines.map((l, i) => {
    const out = i === 0 ? prompt(l, X, y) : `<text x="${X}" y="${y}"><tspan class="dim">naveen-#</tspan> ${esc(l)}</text>`;
    y += 22;
    return out;
  });
  const who = q.author ? `asked by @${q.author}` : 'seeded by the owner';
  const meta = `<text x="${X}" y="${y}" class="dim" style="font-size:12px">-- ${esc(who)} · ${esc(q.at.slice(0, 16).replace('T', ' '))} UTC</text>`;
  y += 34;

  let body = '';
  if (q.error) {
    body += `<text x="${X}" y="${y}" class="amb">ERROR:  ${esc(clip(q.error.message, 104))}</text>`;
    y += 22;
    if (q.error.hint) {
      body += `<text x="${X}" y="${y}" class="dim">HINT:  ${esc(clip(q.error.hint, 105))}</text>`;
      y += 22;
    }
  } else {
    const cols = (q.columns ?? []).slice(0, 6);
    const shown = q.rows.slice(0, 8);
    // Fewer columns get more room each: one column can use the full width.
    const avail = Math.floor((W - 2 * X) / cw);
    const cap = cols.length <= 2 ? Math.floor(avail / Math.max(1, cols.length)) - 3 : 40;
    const widths = cols.map((c) => Math.min(cap, Math.max(c.length, ...shown.map((r) => cell(r[c]).length))));
    const scale = Math.min(1, (W - 2 * X) / cw / widths.reduce((s, w) => s + w + 3, 0));
    const cws = widths.map((w) => Math.max(4, Math.floor(w * scale)));
    const xs = [];
    let x = X;
    for (const w of cws) { xs.push(x); x += (w + 3) * cw; }
    const right = x - 2 * cw;
    const isNum = cols.map((c) => shown.length > 0 && shown.every((r) => typeof r[c] === 'number' || r[c] === null));
    body += cols.map((c, i) => `<text x="${isNum[i] ? xs[i] + cws[i] * cw : xs[i]}" y="${y}" ${isNum[i] ? 'text-anchor="end"' : ''} class="dim">${esc(clip(c, cws[i]))}</text>`).join('');
    body += `<line x1="${X}" x2="${right}" y1="${y + 9}" y2="${y + 9}" stroke="${t.border}"/>`;
    y += 32;
    shown.forEach((r, ri) => {
      const delay = (0.15 + ri * 0.07).toFixed(2);
      body += `<g style="animation: in .35s ease-out ${delay}s backwards">` + cols.map((c, i) => {
        const v = esc(clip(cell(r[c]), cws[i]));
        return `<text x="${isNum[i] ? xs[i] + cws[i] * cw : xs[i]}" y="${y}" ${isNum[i] ? 'text-anchor="end"' : ''}${r[c] === null ? ' class="dim"' : ''}>${v}</text>`;
      }).join('') + '</g>';
      y += 22;
    });
    const more = q.rows.length > shown.length ? ` (${q.rows.length - shown.length} more not shown)` : '';
    body += `<text x="${X}" y="${y + 4}" class="dim" style="font-size:13px">(${q.rows.length} row${q.rows.length === 1 ? '' : 's'})${esc(more)}</text>`;
    y += 26;
  }
  const trace = `<text x="${X}" y="${y + 6}" class="dim" style="font-size:12px">ran on QueryLens: ${esc(q.stages.join(' → '))} in ${q.ms.toFixed(1)} ms</text>`;
  const h = y + 28;
  return frame({ h, t, title: `Last visitor query: ${q.sql}`, body: sqlLines.join('\n') + meta + body + trace });
}

export function queryButton(label, t) {
  const text = `▸ ${label}`;
  const w = Math.ceil(text.length * 13 * CH + 34), h = 36;
  const body = `<text x="17" y="23" style="font-size:13px"><tspan class="grn">▸</tspan> <tspan class="acc">${esc(label)}</tspan></text>`;
  return frame({ w, h, t, title: `Run: ${label}`, body });
}

// ── upstream: merged PRs to other people's repos, git-log style ─────────────
export function upstreamLog(d, t, limit = 8) {
  const X = 32, list = d.upstream.list.slice(0, limit);
  const rows = list.map((p, i) => {
    const y = 84 + i * 26;
    const delay = (0.1 + i * 0.07).toFixed(2);
    return `<g style="animation: slide .4s ease-out ${delay}s backwards">
  <text x="${X}" y="${y}" class="amb">${esc(`#${p.number}`)}</text>
  <text x="${X + 70}" y="${y}" class="dim">${esc(p.merged)}</text>
  <text x="${X + 180}" y="${y}" class="acc">${esc(clip(p.repo, 30))}</text>
  <text x="${X + 450}" y="${y}">${esc(clip(p.title, 52))}</text>
</g>`;
  });
  const empty = list.length ? '' : `<text x="${X}" y="84" class="dim">(no merged upstream PRs yet)</text>`;
  const footY = 84 + Math.max(1, list.length) * 26 + 8;
  const more = d.upstream.prs > list.length ? `, latest ${list.length} shown` : '';
  const body = `
<text x="${X}" y="40"><tspan class="acc b">naveen=#</tspan> <tspan class="dim">\\!</tspan> git log --merged --author=${esc(d.login.toLowerCase())} upstream</text>
<line x1="${X}" x2="${W - X}" y1="56" y2="56" stroke="${t.faint}"/>
${rows.join('\n')}${empty}
<text x="${X}" y="${footY}" class="dim" style="font-size:13px">(${d.upstream.prs} merged PR${d.upstream.prs === 1 ? '' : 's'} across ${d.upstream.repos} repo${d.upstream.repos === 1 ? '' : 's'}${more})</text>`;
  return frame({ h: footY + 22, t, title: `${d.upstream.prs} merged pull requests to other projects`, body });
}
