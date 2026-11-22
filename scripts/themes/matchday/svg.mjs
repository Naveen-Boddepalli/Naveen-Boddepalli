// "matchday" theme: the profile as a football matchday programme. Dark mode is
// a floodlit night pitch, light mode a printed programme. Plain SVG with CSS /
// SMIL animation only, so it survives GitHub's image proxy. The display face
// is a subset of Oswald (SIL OFL 1.1, see fonts/OFL.txt) embedded as base64.
//
// Renderers not yet redesigned fall back to the psql theme (see `viaPsql`).

import { readFileSync } from 'node:fs';
import { esc } from '../common.mjs';
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

// ── not redesigned yet: render with the psql look ──────────────────────────
const viaPsql = (fn) => (...args) => fn(...args.map((a) => (a && a.mode && THEMES[a.mode] === a ? psql.THEMES[a.mode] : a)));

export const resultHeader = viaPsql(psql.resultHeader);
export const resultRow = viaPsql(psql.resultRow);
export const resultFooter = viaPsql(psql.resultFooter);
export const stats = viaPsql(psql.stats);
export const upstreamLog = viaPsql(psql.upstreamLog);
export const linkButton = viaPsql(psql.linkButton);
export const queryButton = viaPsql(psql.queryButton);
export const queryResult = viaPsql(psql.queryResult);
export const footer = viaPsql(psql.footer);
