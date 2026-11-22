// "matchday" theme: the profile as a football matchday programme. Dark mode is
// a floodlit night pitch, light mode a printed programme. Plain SVG with CSS /
// SMIL animation only, so it survives GitHub's image proxy. The display face
// is a subset of Oswald (SIL OFL 1.1, see fonts/OFL.txt) embedded as base64.
//
// Renderers not yet redesigned fall back to the psql theme (see `viaPsql`).

import { readFileSync } from 'node:fs';
import { esc, clip, ago } from '../common.mjs';
import * as psql from '../psql/svg.mjs';
import { ratings, season } from '../../ratings.mjs';

export const THEMES = {
  dark: {
    mode: 'dark', bg: '#0b3d2e', stripe: '#0e4636', line: '#e8f1ea', lineOp: 0.16,
    fg: '#f4f7f2', dim: '#a9c2b5', gold: '#f5c542', go: '#7ee787', red: '#ff6b6b',
    track: '#1d5a47', card: '#f5c542', card2: '#d9a521', cardInk: '#1a1405',
  },
  light: {
    mode: 'light', bg: '#f7f3e8', stripe: '#f1ebdb', line: '#14213d', lineOp: 0.12,
    fg: '#14213d', dim: '#566079', gold: '#a87a06', go: '#1a7f37', red: '#c8102e',
    track: '#e4dcc7', card: '#14213d', card2: '#2a3d6b', cardInk: '#f7f3e8',
  },
};

const W = 1000;
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const DISPLAY = `MatchdayDisplay, 'Oswald', 'DIN Condensed', 'Arial Narrow', Impact, sans-serif`;

// ── embedded display font + its advance widths (em units) for layout ────────
const FONT_B64 = readFileSync(new URL('./fonts/oswald-subset.woff2', import.meta.url)).toString('base64');
const METRICS = JSON.parse(readFileSync(new URL('./fonts/oswald-metrics.json', import.meta.url), 'utf8'));

/** Width in px of `text` set in the display face, including letter-spacing. */
export function measure(text, size, weight = 700, spacing = 0) {
  const table = METRICS[String(weight)] ?? METRICS['700'];
  let em = 0, n = 0;
  for (const ch of String(text)) { em += table[ch] ?? 0.55; n++; }
  return em * size + spacing * n;
}

/** Largest font size <= `size` at which `text` fits in `maxW`. */
export const fit = (text, maxW, size, weight = 700, spacing = 0) =>
  Math.min(size, Math.floor((size * (maxW - spacing * [...String(text)].length)) / Math.max(1, measure(text, size, weight))));

function frame({ w = W, h, t, title, body, css = '', defs = '', font = true }) {
  const fontFace = font
    ? `@font-face { font-family: MatchdayDisplay; font-weight: 400 700; src: url(data:font/woff2;base64,${FONT_B64}) format('woff2'); }`
    : '';
  const stripes = Array.from({ length: Math.ceil(w / 100) }, (_, i) =>
    i % 2 ? `<rect x="${i * 100}" y="0" width="100" height="${h}" fill="${t.stripe}"/>` : '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
${fontFace}
text { font-family: ${SANS}; font-size: 14px; fill: ${t.fg}; }
.d { font-family: ${DISPLAY}; }
.dim { fill: ${t.dim}; } .gold { fill: ${t.gold}; } .go { fill: ${t.go}; } .red { fill: ${t.red}; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes fade { from { opacity: 0; } }
@keyframes pulse { 50% { opacity: .3; } }
.pulse { animation: pulse 1.8s ease-in-out infinite; }
${css}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs><clipPath id="pitch"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10"/></clipPath>${defs}</defs>
<g clip-path="url(#pitch)">
<rect width="${w}" height="${h}" fill="${t.bg}"/>
${stripes}
</g>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.1}"/>
${body}
</svg>
`;
}

// Chalk markings: touchline inset, optionally a centre circle cut off by the right edge.
const markings = (t, w, h, { circle = true } = {}) => `<g fill="none" stroke="${t.line}" stroke-opacity="${t.lineOp}" stroke-width="2">
  <rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="4"/>
  ${circle ? `<circle cx="${w - 14}" cy="${h / 2}" r="${h * 0.3}"/>
  <circle cx="${w - 14}" cy="${h / 2}" r="3" fill="${t.line}"/>` : ''}
</g>`;

// ── hero: player card + programme cover ─────────────────────────────────────
function shield(x, y, w, h) {
  const c = 22, tip = 48;
  return `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + c} V ${y + h - tip} L ${x + w / 2} ${y + h} L ${x} ${y + h - tip} V ${y + c} Z`;
}

export function hero(d, t, cfg = {}) {
  const m = cfg.matchday ?? {};
  const now = new Date(d.generatedAt);
  const r = ratings(d, now);
  const shirt = String(m.shirt ?? 7).padStart(2, '0');
  const position = m.position ?? 'FWD';
  const club = m.club ?? '';
  const surname = (m.cardName ?? d.name.split(/\s+/).slice(-1)[0]).toUpperCase();
  const available = /open|available|looking/i.test(d.status ?? '');
  const deal = m.deal ?? 'internship';

  // card
  const CX = 40, CY = 36, CW = 260, CH = 368, mid = CX + CW / 2;
  const outline = shield(CX, CY, CW, CH);
  const inner = shield(CX + 9, CY + 9, CW - 18, CH - 22);
  const nameSize = fit(surname, CW - 44, 30, 700, 1);
  const cardAttrs = r.attrs.map((a, i) => {
    const col = i < 3 ? 0 : 1, row = i % 3;
    const x = CX + 34 + col * 112, y = CY + 262 + row * 30;
    return `<text x="${x}" y="${y}" class="d" style="font-size:22px;font-weight:700;fill:${t.cardInk}">${a.value}</text>
<text x="${x + 32}" y="${y}" class="d" style="font-size:16px;font-weight:400;fill:${t.cardInk};letter-spacing:1px">${a.key}</text>`;
  }).join('\n');

  const card = `<g style="animation: rise .7s ease-out backwards">
<path d="${outline}" fill="url(#cardFill)"/>
<path d="${inner}" fill="none" stroke="${t.cardInk}" stroke-opacity=".28" stroke-width="1.5"/>
<g clip-path="url(#cardClip)"><rect x="${CX - 200}" y="${CY}" width="120" height="${CH}" fill="url(#sheen)" transform="skewX(-18)" class="sheen"/></g>
<text x="${CX + 30}" y="${CY + 78}" class="d" style="font-size:64px;font-weight:700;fill:${t.cardInk}">${r.overall}</text>
<text x="${CX + 32}" y="${CY + 106}" class="d" style="font-size:22px;font-weight:500;fill:${t.cardInk};letter-spacing:2px">${esc(position)}</text>
<text x="${CX + 32}" y="${CY + 126}" style="font-size:10px;font-weight:600;fill:${t.cardInk};opacity:.75;letter-spacing:1.5px">${esc(club.toUpperCase())}</text>
<text x="${CX + CW - 34}" y="${CY + 150}" text-anchor="end" class="d" style="font-size:104px;font-weight:700;fill:none;stroke:${t.cardInk};stroke-width:2;stroke-opacity:.85">${esc(shirt)}</text>
<line x1="${CX + 30}" x2="${CX + CW - 30}" y1="${CY + 180}" y2="${CY + 180}" stroke="${t.cardInk}" stroke-opacity=".35"/>
<text x="${mid}" y="${CY + 216}" text-anchor="middle" class="d" style="font-size:${nameSize}px;font-weight:700;fill:${t.cardInk};letter-spacing:1px">${esc(surname)}</text>
<line x1="${CX + 30}" x2="${CX + CW - 30}" y1="${CY + 232}" y2="${CY + 232}" stroke="${t.cardInk}" stroke-opacity=".35"/>
<line x1="${mid}" x2="${mid}" y1="${CY + 244}" y2="${CY + 330}" stroke="${t.cardInk}" stroke-opacity=".25"/>
${cardAttrs}
</g>`;

  // programme cover, right of the card
  const X = 340, RIGHT = W - 40;
  const fullName = d.name.toUpperCase();
  const statusText = available ? `AVAILABLE · ${deal.toUpperCase()}` : String(d.status ?? '').toUpperCase();
  const statusX = Math.ceil(32 + measure('TRANSFER STATUS', 12, 500, 2) + 14);
  const badgeW = Math.ceil(statusX + measure(statusText, 14, 600, 1.5) + 16);
  const rows = r.attrs.map((a, i) => {
    const y = 250 + i * 30, barX = 630, barW = 270;
    const w = Math.max(4, (barW * (a.value - 40)) / 59);
    return `<g style="animation: fade .5s ease-out ${(0.35 + i * 0.08).toFixed(2)}s backwards">
<text x="${X}" y="${y}" class="d" style="font-size:16px;font-weight:600;letter-spacing:1px">${esc(a.label.toUpperCase())}</text>
<text x="${X + 108}" y="${y}" class="dim" style="font-size:12.5px">${esc(a.means)}</text>
<rect x="${barX}" y="${y - 10}" width="${barW}" height="8" rx="4" fill="${t.track}"/>
<rect x="${barX}" y="${y - 10}" width="${w.toFixed(1)}" height="8" rx="4" fill="${t.gold}" class="bar" style="animation-delay:${(0.45 + i * 0.08).toFixed(2)}s"/>
<text x="${RIGHT}" y="${y}" text-anchor="end" class="d" style="font-size:19px;font-weight:700">${a.value}</text>
</g>`;
  }).join('\n');

  const cover = `
<text x="${X}" y="66" class="d gold" style="font-size:14px;font-weight:500;letter-spacing:3px">MATCHDAY PROGRAMME · SEASON ${season(now)}</text>
<text x="${X}" y="122" class="d" style="font-size:${fit(fullName, RIGHT - X, 52, 700, 0.5)}px;font-weight:700;letter-spacing:.5px;animation: rise .6s ease-out .1s backwards">${esc(fullName)}</text>
<text x="${X}" y="152" class="dim" style="font-size:15px">${esc(d.role)}</text>
<g transform="translate(${X} 172)" style="animation: fade .5s ease-out .25s backwards">
  <rect x="0.5" y="0.5" width="${badgeW}" height="32" rx="4" fill="none" stroke="${available ? t.go : t.dim}" stroke-opacity=".9"/>
  <circle cx="17" cy="16.5" r="4.5" fill="${available ? t.go : t.dim}" class="${available ? 'pulse' : ''}"/>
  <text x="32" y="21.5" class="d dim" style="font-size:12px;font-weight:500;letter-spacing:2px">TRANSFER STATUS</text>
  <text x="${statusX}" y="22" class="d ${available ? 'go' : ''}" style="font-size:14px;font-weight:600;letter-spacing:1.5px">${esc(statusText)}</text>
</g>
<line x1="${X}" x2="${RIGHT}" y1="222" y2="222" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.06}"/>
${rows}
<text x="${X}" y="${250 + 6 * 30 - 2}" class="dim" style="font-size:11.5px">Ratings are computed from live GitHub data every 6 hours. Formulas are under “How the ratings work”.</text>`;

  const h = 440;
  const defs = `<linearGradient id="cardFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.card}"/><stop offset="1" stop-color="${t.card2}"/></linearGradient>
<linearGradient id="sheen" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${t.mode === 'dark' ? 0.45 : 0.18}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="cardClip"><path d="${outline}"/></clipPath>`;
  const css = `.bar { transform-box: fill-box; transform-origin: left center; animation: grow 1s cubic-bezier(.2,.7,.2,1) backwards; }
@keyframes grow { from { transform: scaleX(0); } }
.sheen { animation: sweep 1.4s ease-in-out .8s 1 both; }
@keyframes sweep { from { transform: skewX(-18deg) translateX(0); } to { transform: skewX(-18deg) translateX(560px); } }`;
  const alt = `${d.name}, rated ${r.overall}: ${r.attrs.map((a) => `${a.label} ${a.value}`).join(', ')}. ${d.status}.`;
  return frame({ h, t, title: alt, body: markings(t, W, h, { circle: false }) + card + cover, defs, css });
}

// ── shared bits ─────────────────────────────────────────────────────────────
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAY = 86400000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Section heading: big display title with a small kicker after it. */
function heading(t, x, y, title, kicker = '') {
  const tw = measure(title, 24, 700, 1);
  return `<text x="${x}" y="${y}" class="d" style="font-size:24px;font-weight:700;letter-spacing:1px">${esc(title)}</text>
${kicker ? `<text x="${Math.ceil(x + tw + 14)}" y="${y - 1}" class="dim" style="font-size:13px">${esc(kicker)}</text>` : ''}`;
}

const label = (x, y, text, anchor = 'start', cls = 'dim') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="d ${cls}" style="font-size:11.5px;font-weight:500;letter-spacing:2px">${esc(text)}</text>`;

// small "open in new place" arrow, drawn so it doesn't depend on a font
const arrow = (x, y, color) =>
  `<path d="M ${x} ${y + 7} L ${x + 7} ${y} M ${x + 2} ${y} H ${x + 7} V ${y + 5}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;

// ── squad sheet: one clickable row per pinned repo ──────────────────────────
// Column x positions shared by the header and every row.
const COL = { num: 28, name: 88, pos: 560, push: 718, status: 870 };

export function resultHeader(d, t) {
  const h = 64;
  const body = `${heading(t, COL.num, 34, 'THE SQUAD', 'pinned repos · click a player to open the repo')}
${label(COL.pos, 54, 'POSITION')}${label(COL.push, 54, 'LAST TRAINED')}${label(COL.status, 54, 'STATUS')}`;
  return frame({ h, t, title: 'The squad: pinned projects', body });
}

export function resultRow(r, i, t, now = new Date()) {
  const h = 66, delay = (0.1 + i * 0.1).toFixed(2);
  const days = Math.max(0, Math.floor((now - new Date(r.pushedAt)) / DAY));
  const fitness = days <= 14 ? t.go : days <= 60 ? t.gold : t.dim;
  const stars = r.stars > 0 ? `<tspan class="gold" style="font-size:13px" dx="10">★ ${r.stars}</tspan>` : '';
  const lang = r.lang
    ? `<circle cx="${COL.pos + 5}" cy="33" r="5" fill="${r.lang.color || t.dim}"/><text x="${COL.pos + 17}" y="38" style="font-size:13px">${esc(clip(r.lang.name, 16))}</text>`
    : `<text x="${COL.pos}" y="38" class="dim" style="font-size:13px">-</text>`;
  const live = Boolean(r.demo);
  const pillColor = live ? t.go : t.dim;
  const pillText = live ? 'LIVE DEMO' : 'SOURCE';
  const pillW = 106, px = COL.status, textW = measure(pillText, 13, 600, 1.5);
  const pill = `<rect x="${px}" y="20" width="${pillW}" height="26" rx="13" fill="${live ? t.go : 'none'}" fill-opacity="${live ? 0.14 : 0}" stroke="${pillColor}"/>
<text x="${(px + (pillW - textW - 12) / 2).toFixed(1)}" y="38" class="d" style="font-size:13px;font-weight:600;letter-spacing:1.5px;fill:${pillColor}">${pillText}</text>
${arrow(px + (pillW + textW - 12) / 2 + 5, 26.5, pillColor)}`;
  const body = `
<g style="animation: rise .45s ease-out ${delay}s backwards">
  <text x="${COL.num}" y="44" class="d gold" style="font-size:30px;font-weight:700">${String(i + 1).padStart(2, '0')}</text>
  <text x="${COL.name}" y="30" class="d" style="font-size:20px;font-weight:600;letter-spacing:.3px">${esc(clip(r.name, 34))}${stars}</text>
  <text x="${COL.name}" y="51" class="dim" style="font-size:13px">${esc(clip(r.about, 68))}</text>
  ${lang}
  <circle cx="${COL.push + 5}" cy="33" r="5" fill="${fitness}"/>
  <text x="${COL.push + 17}" y="38" style="font-size:13px">pushed ${esc(ago(r.pushedAt, now))}</text>
  ${pill}
</g>`;
  return frame({ h, t, title: `${r.name}: ${r.about}`, body });
}

export function resultFooter(d, t) {
  const n = d.pinned.length;
  const text = `${plural(n, 'player')} in the squad  ·  ${plural(d.ownRepos, 'public repo')}  ·  ${d.liveDemos} with live demos`.toUpperCase();
  const body = `<text x="${COL.num}" y="28" class="d dim" style="font-size:12.5px;font-weight:500;letter-spacing:2px">${esc(text)}</text>
<circle cx="${COL.push + 5}" cy="23.5" r="4" fill="${t.go}"/><text x="${COL.push + 15}" y="28" class="dim" style="font-size:11.5px">≤ 14 d</text>
<circle cx="${COL.push + 68}" cy="23.5" r="4" fill="${t.gold}"/><text x="${COL.push + 78}" y="28" class="dim" style="font-size:11.5px">≤ 60 d</text>`;
  return frame({ h: 44, t, title: `${n} pinned projects`, body });
}

// ── season stats: scoreboard tiles + language "possession" bar ──────────────
export function stats(d, t) {
  const X = 32, R = W - 32;
  const tiles = [
    ['TOUCHES', d.contributions, `contributions in ${d.year}`],
    ['GOALS', d.commits, `commits in ${d.year}`],
    ['ASSISTS', d.upstream.prs, 'PRs merged elsewhere'],
    ['AWAY GROUNDS', d.upstream.repos, 'repos contributed to'],
    ['UNBEATEN RUN', `${d.streak.current}d`, 'current daily streak'],
    ['BEST RUN', `${d.streak.best}d`, 'longest in a year'],
    ['DRILLS', d.leetcodeSolved ?? '-', 'LeetCode solved'],
  ];
  const gap = 8, tw = (R - X - gap * (tiles.length - 1)) / tiles.length;
  const tileEls = tiles.map(([k, v, sub], i) => {
    const x = X + i * (tw + gap), cx = x + tw / 2;
    const size = fit(String(v), tw - 20, 38);
    return `<g style="animation: rise .45s ease-out ${(0.15 + i * 0.07).toFixed(2)}s backwards">
<rect x="${x.toFixed(1)}" y="60" width="${tw.toFixed(1)}" height="106" rx="6" fill="${t.mode === 'dark' ? '#082c21' : '#ffffff'}" fill-opacity="${t.mode === 'dark' ? 0.75 : 0.7}" stroke="${t.line}" stroke-opacity="${t.lineOp}"/>
${label(cx.toFixed(1), 84, k, 'middle', 'gold')}
<text x="${cx.toFixed(1)}" y="128" text-anchor="middle" class="d" style="font-size:${size}px;font-weight:700">${esc(v)}</text>
<text x="${cx.toFixed(1)}" y="151" text-anchor="middle" class="dim" style="font-size:11px">${esc(clip(sub, 24))}</text>
</g>`;
  }).join('\n');

  // possession: one bar split by language share
  const langs = d.languages, total = langs.reduce((s, l) => s + l.share, 0) || 1;
  const barY = 232, barH = 18, barW = R - X;
  let x = X;
  const segs = langs.map((l, i) => {
    const w = (l.share / total) * barW;
    const seg = `<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(0, w - (i < langs.length - 1 ? 2 : 0)).toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
    x += w;
    return seg;
  }).join('');
  let lx = X;
  const legend = langs.map((l) => {
    const pct = `${Math.round(l.share * 100)}%`;
    const out = `<circle cx="${lx + 5}" cy="${barY + 41}" r="5" fill="${l.color}"/>
<text x="${lx + 16}" y="${barY + 46}" style="font-size:13px">${esc(l.name)} <tspan class="d" style="font-weight:600">${pct}</tspan></text>`;
    lx += 16 + (l.name.length + 1) * 7.3 + measure(pct, 13, 600) + 22;
    return out;
  }).join('\n');
  const h = barY + 68;
  const body = `${markings(t, W, h, { circle: false })}
${heading(t, X, 40, `SEASON STATS ${d.year}`, 'from GitHub, refreshed every 6 hours')}
${tileEls}
${heading(t, X, 212, 'POSSESSION', 'share of code by language')}
<clipPath id="barClip"><rect x="${X}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}"/></clipPath>
<g clip-path="url(#barClip)"><g class="bar">${segs}</g></g>
${legend}`;
  const css = `.bar { transform-box: fill-box; transform-origin: left center; animation: grow 1.1s cubic-bezier(.2,.7,.2,1) .5s backwards; }
@keyframes grow { from { transform: scaleX(0); } }`;
  return frame({ h, t, title: `Season stats for ${d.name}: ${tiles.map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ')}`, body, css });
}

// ── away fixtures: merged PRs to other people's repos ───────────────────────
export function upstreamLog(d, t, limit = 8) {
  const X = 32, R = W - 32, list = d.upstream.list.slice(0, limit), rowH = 34, top = 102;
  const rows = list.map((p, i) => {
    const y = top + i * rowH;
    const [yy, mm, dd] = p.merged.split('-');
    const date = `${dd} ${MONTHS[Number(mm) - 1]} ${yy}`;
    return `<g style="animation: rise .4s ease-out ${(0.1 + i * 0.07).toFixed(2)}s backwards">
  ${i % 2 ? '' : `<rect x="${X - 10}" y="${y - 22}" width="${R - X + 20}" height="${rowH}" rx="4" fill="${t.line}" fill-opacity="${t.mode === 'dark' ? 0.05 : 0.04}"/>`}
  <text x="${X}" y="${y}" class="d dim" style="font-size:14px;font-weight:500;letter-spacing:1px">${esc(date)}</text>
  <rect x="${X + 108}" y="${y - 16}" width="22" height="22" rx="4" fill="${t.go}"/>
  <text x="${X + 119}" y="${y}" text-anchor="middle" class="d" style="font-size:14px;font-weight:700;fill:${t.bg}">W</text>
  <text x="${X + 170}" y="${y}" class="d" style="font-size:16px;font-weight:600">${esc(clip(p.repo, 32))}</text>
  <text x="${X + 450}" y="${y}" style="font-size:13.5px">${esc(clip(p.title, 58))}</text>
  <text x="${R}" y="${y}" text-anchor="end" class="d dim" style="font-size:14px;font-weight:500">#${esc(p.number)}</text>
</g>`;
  }).join('\n');
  const empty = list.length ? '' : `<text x="${X}" y="${top}" class="dim">No away fixtures yet.</text>`;
  const footY = top + Math.max(1, list.length) * rowH;
  const more = d.upstream.prs > list.length ? `  ·  latest ${list.length} shown` : '';
  const body = `${heading(t, X, 40, 'AWAY FIXTURES', 'pull requests merged into other people\'s projects')}
${label(X, 68, 'MERGED')}${label(X + 108, 68, 'RESULT')}${label(X + 170, 68, 'GROUND')}${label(X + 450, 68, 'PULL REQUEST')}${label(R, 68, 'PR', 'end')}
<line x1="${X}" x2="${R}" y1="76" y2="76" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.06}"/>
${rows}${empty}
<text x="${X}" y="${footY + 4}" class="d dim" style="font-size:12.5px;font-weight:500;letter-spacing:2px">${esc(`${plural(d.upstream.prs, 'win')} away from home across ${plural(d.upstream.repos, 'ground')}${more}`.toUpperCase())}</text>`;
  return frame({ h: footY + 26, t, title: `${d.upstream.prs} merged pull requests to other projects`, body });
}

// ── not redesigned yet: render with the psql look ──────────────────────────
const viaPsql = (fn) => (...args) => fn(...args.map((a) => (a && a.mode && THEMES[a.mode] === a ? psql.THEMES[a.mode] : a)));

export const linkButton = viaPsql(psql.linkButton);
export const queryButton = viaPsql(psql.queryButton);
export const queryResult = viaPsql(psql.queryResult);
export const footer = viaPsql(psql.footer);
