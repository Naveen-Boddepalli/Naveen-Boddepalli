// "wizarding" theme: the profile as a student wizard's school record. Dark mode
// is the castle at night, light mode a parchment letter. Plain SVG with CSS
// animation only, so it survives GitHub's image proxy. Headings use a subset of
// Cinzel (SIL OFL 1.1, see fonts/OFL.txt) embedded as base64.
//
// Fan homage with original artwork: no crests, logos or quotes. Houses appear
// only as a colour pair and a word. The house comes from the data (sorting.mjs),
// so the accent colours can change between builds.

import { readFileSync } from 'node:fs';
import { esc, clip, ago } from '../common.mjs';
import { results } from './owls.mjs';
import { sortHouse } from './sorting.mjs';
import * as psql from '../psql/svg.mjs';

const BASE = {
  dark: {
    wizarding: true, mode: 'dark', bg: '#0f1021', paper: '#1a1b33', edge: '#e8b64c', fg: '#efe6cf',
    dim: '#a9a08a', gold: '#e8b64c', wax: '#a3262a', line: '#efe6cf', lineOp: 0.14, go: '#7ee787',
    env: '#cdbb92', envBack: '#a8956a', envFold: '#bba77c', envInk: '#2b1d0e', texture: 0.05,
  },
  light: {
    wizarding: true, mode: 'light', bg: '#eadcbd', paper: '#f6edd8', edge: '#b8892d', fg: '#2b1d0e',
    dim: '#6e5230', gold: '#9a7124', wax: '#9b1c1c', line: '#2b1d0e', lineOp: 0.12, go: '#1a7f37',
    env: '#efe3c6', envBack: '#cbb58a', envFold: '#dfcfa8', envInk: '#2b1d0e', texture: 0.16,
  },
};

// One colour pair per house, tuned for each background.
export const HOUSE_COLOURS = {
  Gryffindor: { dark: { accent: '#ef5a4f', accent2: '#f0c040' }, light: { accent: '#9c1f24', accent2: '#a87a06' } },
  Ravenclaw: { dark: { accent: '#7f9ef0', accent2: '#cf9a5c' }, light: { accent: '#1f3a7a', accent2: '#8a5a1f' } },
  Hufflepuff: { dark: { accent: '#f2c53d', accent2: '#d8cbb0' }, light: { accent: '#8a6400', accent2: '#2b2420' } },
  Slytherin: { dark: { accent: '#4fc07c', accent2: '#c3c9cf' }, light: { accent: '#1a5c34', accent2: '#5f676c' } },
};

const DEFAULT_HOUSE = 'Ravenclaw';
const withHouse = (t, house) => ({ ...t, house, ...HOUSE_COLOURS[house][t.mode] });

/** Base tokens with the default house; build.mjs replaces them via prepare(). */
export const THEMES = { dark: withHouse(BASE.dark, DEFAULT_HOUSE), light: withHouse(BASE.light, DEFAULT_HOUSE) };

/** Sorts the profile once per build so every image carries the house colours. */
export function prepare(d, cfg, now) {
  const { house } = sortHouse(results(d, now).subjects);
  return { dark: withHouse(BASE.dark, house), light: withHouse(BASE.light, house) };
}

const W = 1000;
const SERIF = `'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif`;
const DISPLAY = `WizardingDisplay, Cinzel, 'Trajan Pro', ${SERIF}`;

// ── embedded display font + its advance widths (em units) for layout ────────
const FONT_B64 = readFileSync(new URL('./fonts/cinzel-subset.woff2', import.meta.url)).toString('base64');
const METRICS = JSON.parse(readFileSync(new URL('./fonts/cinzel-metrics.json', import.meta.url), 'utf8'));

/** Width in px of `text` set in the display face, including letter-spacing. */
export function measure(text, size, weight = 700, spacing = 0) {
  const table = METRICS[String(weight)] ?? METRICS['700'];
  let em = 0, n = 0;
  for (const ch of String(text)) { em += table[ch] ?? 0.7; n++; }
  return em * size + spacing * n;
}

/** Largest font size <= `size` at which `text` fits in `maxW`. */
export const fit = (text, maxW, size, weight = 700, spacing = 0) =>
  Math.min(size, Math.floor((size * (maxW - spacing * [...String(text)].length)) / Math.max(1, measure(text, size, weight))));

// Deterministic star field for the night sky.
function stars(w, h, n, t) {
  let s = 20261123;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) => {
    const x = (rnd() * w).toFixed(1), y = (rnd() * h).toFixed(1), r = (0.4 + rnd() * 1.1).toFixed(2);
    const tw = i % 5 === 0 ? ` class="twinkle" style="animation-delay:${(rnd() * 4).toFixed(2)}s"` : '';
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${t.fg}" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"${tw}/>`;
  }).join('');
}

function frame({ w = W, h, t, title, body, css = '', defs = '', font = true }) {
  const fontFace = font
    ? `@font-face { font-family: WizardingDisplay; font-weight: 400 700; src: url(data:font/woff2;base64,${FONT_B64}) format('woff2'); }`
    : '';
  const sky = t.mode === 'dark' ? stars(w, h, Math.round((w * h) / 9000), t) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
${fontFace}
text { font-family: ${SERIF}; font-size: 14px; fill: ${t.fg}; }
.d { font-family: ${DISPLAY}; }
.dim { fill: ${t.dim}; } .gold { fill: ${t.gold}; } .acc { fill: ${t.accent}; } .go { fill: ${t.go}; }
.i { font-style: italic; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes fade { from { opacity: 0; } }
@keyframes pulse { 50% { opacity: .3; } }
@keyframes twinkle { 50% { opacity: .1; } }
.pulse { animation: pulse 1.8s ease-in-out infinite; }
.twinkle { animation: twinkle 4s ease-in-out infinite; }
${css}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
<clipPath id="edge"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10"/></clipPath>
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="7" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 .42  0 0 0 0 .3  0 0 0 0 .12  1.4 0 0 0 -.45"/>
</filter>
${defs}
</defs>
<g clip-path="url(#edge)">
<rect width="${w}" height="${h}" fill="${t.bg}"/>
${sky}
<rect width="${w}" height="${h}" filter="url(#grain)" opacity="${t.texture}"/>
</g>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.1}"/>
${body}
</svg>
`;
}

/** A sheet of paper with a double gold rule, used by the letter and later sections. */
function sheet(t, x, y, w, h, id) {
  return `<g>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${t.paper}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" filter="url(#grain)" opacity="${t.texture * 1.4}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#${id}Vignette)"/>
<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="6" fill="none" stroke="${t.edge}" stroke-opacity=".7"/>
<rect x="${x + 7.5}" y="${y + 7.5}" width="${w - 15}" height="${h - 15}" rx="3" fill="none" stroke="${t.edge}" stroke-opacity=".35"/>
</g>`;
}

const vignette = (t, id) => `<radialGradient id="${id}Vignette" cx=".5" cy=".45" r=".75">
  <stop offset=".6" stop-color="${t.mode === 'dark' ? '#000' : '#7a5a2f'}" stop-opacity="0"/>
  <stop offset="1" stop-color="${t.mode === 'dark' ? '#000' : '#7a5a2f'}" stop-opacity="${t.mode === 'dark' ? 0.35 : 0.22}"/>
</radialGradient>`;

const initials = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ── hero: an opened envelope (the sorting) and the acceptance letter ────────
export function hero(d, base, cfg = {}) {
  const now = new Date(d.generatedAt);
  const r = results(d, now);
  const sorted = sortHouse(r.subjects);
  const t = withHouse(base, sorted.house); // the hero always shows its own sorting
  const wz = cfg.wizarding ?? {};
  const deal = wz.deal ?? cfg.matchday?.deal ?? 'internship';
  const available = /open|available|looking|seeking/i.test(d.status ?? '');
  const firstName = d.name.split(/\s+/)[0];
  const h = 570;

  // envelope, left: the seal breaks, the flap opens, the house card rises
  const EX = 40, EW = 240, ET = 226, EB = 386, EM = EX + EW / 2, apex = ET - 92;
  const card = { x: EX + 22, y: ET - 78, w: EW - 44, h: 150 };
  const houseSize = fit(sorted.house.toUpperCase(), card.w - 28, 24, 700, 2);
  const envelope = `<g>
<rect x="${EX}" y="${ET}" width="${EW}" height="${EB - ET}" rx="4" fill="${t.envBack}"/>
<path d="M ${EX} ${ET} L ${EX + EW} ${ET} L ${EM} ${apex} Z" fill="${t.envFold}" stroke="${t.envBack}" class="flap"/>
<g class="card">
  <rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="3" fill="${t.mode === 'dark' ? '#f3ead2' : '#fbf6ea'}" stroke="${t.envBack}"/>
  <rect x="${card.x}" y="${card.y + 14}" width="${card.w}" height="7" fill="${t.accent}"/>
  <rect x="${card.x}" y="${card.y + 21}" width="${card.w}" height="4" fill="${t.accent2}"/>
  <text x="${EM}" y="${card.y + 50}" text-anchor="middle" class="d" style="font-size:10.5px;font-weight:700;letter-spacing:3px;fill:${t.envInk};opacity:.75">SORTED INTO</text>
  <text x="${EM}" y="${card.y + 82}" text-anchor="middle" class="d" style="font-size:${houseSize}px;font-weight:700;letter-spacing:2px;fill:${t.envInk}">${esc(sorted.house.toUpperCase())}</text>
  <text x="${EM}" y="${card.y + 102}" text-anchor="middle" class="i" style="font-size:12.5px;fill:${t.envInk};opacity:.8">for ${esc(sorted.trait)}</text>
</g>
<path d="M ${EX} ${ET} L ${EM} ${ET + 88} L ${EX + EW} ${ET} L ${EX + EW} ${EB} L ${EX} ${EB} Z" fill="${t.env}"/>
<path d="M ${EX} ${EB} L ${EM} ${ET + 72} L ${EX + EW} ${EB}" fill="none" stroke="${t.envBack}" stroke-opacity=".7"/>
<path d="M ${EX} ${ET} L ${EM} ${ET + 88} L ${EX + EW} ${ET}" fill="none" stroke="${t.envBack}" stroke-opacity=".7"/>
<g class="seal">
  <g class="half l"><path d="M ${EM} ${ET + 62} a 24 24 0 0 0 0 48 l 3 -8 l -4 -8 l 4 -8 l -4 -8 l 4 -8 Z" fill="${t.wax}"/></g>
  <g class="half r"><path d="M ${EM} ${ET + 62} a 24 24 0 0 1 0 48 l 3 -8 l -4 -8 l 4 -8 l -4 -8 l 4 -8 Z" fill="${t.wax}"/></g>
  <text x="${EM}" y="${ET + 92}" text-anchor="middle" class="d" style="font-size:16px;font-weight:700;fill:#f3d9a4;letter-spacing:1px">${esc(initials(d.name))}</text>
</g>
</g>
<text x="${EM}" y="${EB + 40}" text-anchor="middle" class="d dim" style="font-size:11px;font-weight:700;letter-spacing:2.5px">OWL POST · ${esc(DAY_FMT.format(now).toUpperCase())}</text>
<text x="${EM}" y="${EB + 60}" text-anchor="middle" class="i dim" style="font-size:12.5px">re-sorted from GitHub every 6 hours</text>`;

  // letter, right
  const LX = 320, LY = 28, LW = W - LX - 32, LH = h - 56;
  const X = LX + 36, RIGHT = LX + LW - 36;
  const fullName = d.name.toUpperCase();
  const stampX = RIGHT - 54, stampY = LY + 90;
  const statusText = available ? `SEEKING AN APPRENTICESHIP · ${deal.toUpperCase()}` : String(d.status ?? '').toUpperCase();
  const badgeW = Math.ceil(30 + measure(statusText, 11.5, 700, 1.5) + 14);

  const rowY = (i) => LY + 250 + i * 29;
  const rows = r.subjects.map((s, i) => {
    const y = rowY(i);
    const size = fit(s.subject.toUpperCase(), 250, 14.5, 700, 0.5);
    return `<g style="animation: fade .5s ease-out ${(0.9 + i * 0.1).toFixed(2)}s backwards">
<circle cx="${X + 11}" cy="${y - 5}" r="11" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<text x="${X + 11}" y="${y}" text-anchor="middle" class="d acc" style="font-size:14px;font-weight:700">${s.grade.letter}</text>
<text x="${X + 34}" y="${y}" class="d" style="font-size:${size}px;font-weight:700;letter-spacing:.5px">${esc(s.subject.toUpperCase())}</text>
<text x="${X + 300}" y="${y}" class="i dim" style="font-size:13.5px">${esc(s.means)}</text>
<line x1="${X + 300 + s.means.length * 6.6 + 10}" x2="${RIGHT - 34}" y1="${y - 4}" y2="${y - 4}" stroke="${t.dim}" stroke-opacity=".45" stroke-dasharray="1 4"/>
<text x="${RIGHT}" y="${y}" text-anchor="end" class="d" style="font-size:17px;font-weight:700">${s.value}</text>
</g>`;
  }).join('\n');

  const sortY = rowY(6) + 12;
  const letter = `<g style="animation: rise .7s ease-out .1s backwards">
${sheet(t, LX, LY, LW, LH, 'letter')}
<text x="${X}" y="${LY + 46}" class="d gold" style="font-size:11.5px;font-weight:700;letter-spacing:3px">ACADEMY OF APPLIED SORCERY · ADMISSIONS</text>
<text x="${X}" y="${LY + 92}" class="d" style="font-size:${fit(fullName, stampX - 56 - X, 38, 700, 1)}px;font-weight:700;letter-spacing:1px">${esc(fullName)}</text>
<text x="${X}" y="${LY + 118}" class="i dim" style="font-size:15px">${esc(d.role)}</text>
<g transform="translate(${X} ${LY + 134})">
  <rect x="0.5" y="0.5" width="${badgeW}" height="28" rx="4" fill="none" stroke="${available ? t.go : t.dim}" stroke-opacity=".9"/>
  <circle cx="15" cy="14.5" r="4.5" fill="${available ? t.go : t.dim}" class="${available ? 'pulse' : ''}"/>
  <text x="30" y="19" class="d ${available ? 'go' : 'dim'}" style="font-size:11.5px;font-weight:700;letter-spacing:1.5px">${esc(statusText)}</text>
</g>
<text x="${X}" y="${LY + 196}" style="font-size:14.5px">Dear ${esc(firstName)}, we are pleased to confirm your place. Your entrance marks, taken from</text>
<text x="${X}" y="${LY + 214}" style="font-size:14.5px">your public GitHub record, are below.</text>
${rows}
<line x1="${X}" x2="${RIGHT}" y1="${sortY - 14}" y2="${sortY - 14}" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.06}"/>
<rect x="${X}" y="${sortY - 2}" width="22" height="6" fill="${t.accent}"/><rect x="${X}" y="${sortY + 4}" width="22" height="4" fill="${t.accent2}"/>
<text x="${X + 32}" y="${sortY + 8}" class="d acc" style="font-size:13px;font-weight:700;letter-spacing:2px">SORTED INTO ${esc(sorted.house.toUpperCase())}</text>
<text x="${X + 32}" y="${sortY + 28}" class="i dim" style="font-size:13px">${esc(sorted.reason)}.</text>
<text x="${RIGHT}" y="${LY + LH - 24}" text-anchor="end" class="i dim" style="font-size:12px">Marked from live GitHub data every 6 hours. How the grades work is below the profile.</text>
</g>`;

  const stamp = `<g transform="translate(${stampX} ${stampY}) rotate(-8)" class="stamp">
<circle r="50" fill="none" stroke="${t.accent}" stroke-width="2"/>
<circle r="44" fill="none" stroke="${t.accent}" stroke-width="1" stroke-dasharray="2 3"/>
<text y="-15" text-anchor="middle" class="d acc" style="font-size:9px;font-weight:700;letter-spacing:1.5px">OVERALL</text>
<text y="14" text-anchor="middle" class="d acc" style="font-size:30px;font-weight:700">${r.overall}</text>
<text y="27" text-anchor="middle" class="d acc" style="font-size:9px;font-weight:700;letter-spacing:1.5px">GRADE ${r.overallGrade.letter}</text>
</g>`;

  const defs = vignette(t, 'letter');
  const css = `.seal .half { transform-box: fill-box; animation: crack .6s ease-in .5s both; }
.seal .l { --dx: -16px; --rot: -20deg; transform-origin: right center; } .seal .r { --dx: 16px; --rot: 20deg; transform-origin: left center; }
.seal text { animation: gone .3s ease-in .5s both; }
@keyframes crack { to { transform: translate(var(--dx), 30px) rotate(var(--rot)); opacity: 0; } }
@keyframes gone { to { opacity: 0; } }
.flap { transform-box: fill-box; transform-origin: center bottom; animation: open .5s cubic-bezier(.3,.6,.3,1) 1s both; }
@keyframes open { from { transform: scaleY(-1); } }
.card { animation: lift .6s ease-out 1.4s both; }
@keyframes lift { from { opacity: 0; transform: translateY(70px); } }
.stamp { animation: fade .3s ease-out 1.6s backwards; }
@media (prefers-reduced-motion: reduce) { .seal { display: none; } }`;
  const alt = `Acceptance letter for ${d.name}: overall ${r.overall} (grade ${r.overallGrade.letter}). `
    + r.subjects.map((s) => `${s.subject} ${s.value} (${s.grade.letter}, ${s.means})`).join(', ')
    + `. Sorted into ${sorted.house} for ${sorted.trait}. ${available ? `Seeking an apprenticeship: ${deal}.` : d.status ?? ''}`;
  return frame({ h, t, title: alt, body: envelope + letter + stamp, defs, css });
}

// ── shared bits ─────────────────────────────────────────────────────────────
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAY = 86400000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Section heading: display title with a small italic kicker after it. */
function heading(t, x, y, title, kicker = '') {
  const tw = measure(title, 24, 700, 1.5);
  return `<text x="${x}" y="${y}" class="d" style="font-size:24px;font-weight:700;letter-spacing:1.5px">${esc(title)}</text>
${kicker ? `<text x="${Math.ceil(x + tw + 14)}" y="${y - 1}" class="i dim" style="font-size:14px">${esc(kicker)}</text>` : ''}`;
}

const label = (x, y, text, anchor = 'start', cls = 'dim') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="d ${cls}" style="font-size:10.5px;font-weight:700;letter-spacing:2px">${esc(text)}</text>`;

// four-point sparkle, drawn so it doesn't depend on a font
const sparkle = (x, y, r, color) =>
  `<path d="M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z" fill="${color}"/>`;

// small "go there" arrow
const arrow = (x, y, color) =>
  `<path d="M ${x} ${y + 7} L ${x + 7} ${y} M ${x + 2} ${y} H ${x + 7} V ${y + 5}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;

// wax seal with a tick, for delivered letters
const seal = (x, y, t) => `<circle cx="${x}" cy="${y}" r="11" fill="${t.wax}"/>
<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#f3d9a4" stroke-opacity=".45"/>
<path d="M ${x - 4} ${y} L ${x - 1} ${y + 3.5} L ${x + 4.5} ${y - 3.5}" fill="none" stroke="#f3d9a4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A strip of paper behind a row, so stacked rows read as pages of one book. */
const strip = (t, x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${t.paper}" fill-opacity="${t.mode === 'dark' ? 0.85 : 0.75}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" filter="url(#grain)" opacity="${t.texture}"/>
<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="4" fill="none" stroke="${t.edge}" stroke-opacity=".35"/>`;

// ── the spellbook: one clickable spell per pinned repo ──────────────────────
// Column x positions shared by the header and every row.
const COL = { num: 34, name: 92, school: 560, cast: 716, key: 862 };

export function resultHeader(d, t) {
  const h = 66;
  const body = `${heading(t, COL.num - 6, 34, 'THE SPELLBOOK', 'pinned repos · open a spell to read its source')}
${label(COL.school, 56, 'SCHOOL')}${label(COL.cast, 56, 'LAST CAST')}${label(COL.key, 56, 'PORTKEY')}`;
  return frame({ h, t, title: 'The spellbook: pinned projects', body });
}

export function resultRow(r, i, t, now = new Date()) {
  const h = 70, delay = (0.1 + i * 0.1).toFixed(2);
  const days = Math.max(0, Math.floor((now - new Date(r.pushedAt)) / DAY));
  const fresh = days <= 14 ? t.go : days <= 60 ? t.gold : t.dim;
  const nameSize = Math.min(19, fit(clip(r.name, 34), 380, 19, 700, 0.3));
  const nameW = measure(clip(r.name, 34), nameSize, 700, 0.3);
  const stars = r.stars > 0
    ? `${sparkle(COL.name + nameW + 16, 25, 6, t.gold)}<text x="${COL.name + nameW + 26}" y="30" class="gold" style="font-size:13px">${r.stars}</text>`
    : '';
  const school = r.lang
    ? `<circle cx="${COL.school + 5}" cy="35" r="5" fill="${r.lang.color || t.dim}"/><text x="${COL.school + 17}" y="40" style="font-size:14px">${esc(clip(r.lang.name, 16))}</text>`
    : `<text x="${COL.school}" y="40" class="dim" style="font-size:14px">-</text>`;
  const live = Boolean(r.demo);
  const c = live ? t.accent : t.dim, pillText = live ? 'LIVE DEMO' : 'SOURCE';
  const pillW = 108, px = COL.key, textW = measure(pillText, 11, 700, 1.5);
  const pill = `<rect x="${px}" y="22" width="${pillW}" height="26" rx="13" fill="${c}" fill-opacity="${live ? 0.14 : 0}" stroke="${c}"/>
<text x="${(px + (pillW - textW - 12) / 2).toFixed(1)}" y="39" class="d" style="font-size:11px;font-weight:700;letter-spacing:1.5px;fill:${c}">${pillText}</text>
${arrow(px + (pillW + textW - 12) / 2 + 5, 28.5, c)}`;
  const body = `
<g style="animation: rise .45s ease-out ${delay}s backwards">
  ${strip(t, 14, 5, W - 28, h - 10)}
  <text x="${COL.num + 16}" y="44" text-anchor="middle" class="d gold" style="font-size:22px;font-weight:700">${ROMAN[i] ?? i + 1}</text>
  <line x1="${COL.name - 18}" x2="${COL.name - 18}" y1="16" y2="${h - 16}" stroke="${t.edge}" stroke-opacity=".4"/>
  <text x="${COL.name}" y="31" class="d" style="font-size:${nameSize}px;font-weight:700;letter-spacing:.3px">${esc(clip(r.name, 34))}</text>
  ${stars}
  <text x="${COL.name}" y="52" class="i dim" style="font-size:13.5px">${esc(clip(r.about, 66))}</text>
  ${school}
  <circle cx="${COL.cast + 5}" cy="35" r="5" fill="${fresh}"/>
  <text x="${COL.cast + 17}" y="40" style="font-size:14px">${esc(ago(r.pushedAt, now))}</text>
  ${pill}
</g>`;
  const alt = `Spell ${i + 1}: ${r.name}. ${r.about}.${r.lang ? ` ${r.lang.name}.` : ''} Last pushed ${ago(r.pushedAt, now)}.${live ? ' Has a live demo.' : ''}`;
  return frame({ h, t, title: alt, body });
}

export function resultFooter(d, t) {
  const n = d.pinned.length;
  const text = `${plural(n, 'spell')} in the book  ·  ${plural(d.ownRepos, 'public repo')}  ·  ${d.liveDemos} with live demos`.toUpperCase();
  const body = `<text x="${COL.num - 6}" y="28" class="d dim" style="font-size:11.5px;font-weight:700;letter-spacing:2px">${esc(text)}</text>
<circle cx="${COL.cast + 5}" cy="23.5" r="4" fill="${t.go}"/><text x="${COL.cast + 15}" y="28" class="i dim" style="font-size:12px">≤ 14 d</text>
<circle cx="${COL.cast + 70}" cy="23.5" r="4" fill="${t.gold}"/><text x="${COL.cast + 80}" y="28" class="i dim" style="font-size:12px">≤ 60 d</text>`;
  return frame({ h: 44, t, title: `${n} pinned projects`, body });
}

// ── The Daily Commit: stats as a newspaper front page ───────────────────────
function candle(x, y, t, delay = 0) {
  return `<g>
<rect x="${x - 5}" y="${y}" width="10" height="34" rx="2" fill="${t.mode === 'dark' ? '#efe6cf' : '#f8f1de'}" stroke="${t.edge}" stroke-opacity=".6"/>
<line x1="${x}" x2="${x}" y1="${y}" y2="${y - 4}" stroke="${t.fg}" stroke-opacity=".6"/>
<ellipse cx="${x}" cy="${y - 11}" rx="10" ry="13" fill="${t.gold}" opacity=".18" class="glow" style="animation-delay:${delay}s"/>
<path d="M ${x} ${y - 20} C ${x + 5} ${y - 12} ${x + 4} ${y - 5} ${x} ${y - 4} C ${x - 4} ${y - 5} ${x - 5} ${y - 12} ${x} ${y - 20} Z" fill="${t.gold}" class="flame" style="animation-delay:${delay}s"/>
</g>`;
}

const ORDINAL_DAY = (now) => Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 0)) / DAY);

/** Headline written from the numbers, so it changes as they do. */
function headline(d) {
  const first = d.name.split(/\s+/)[0].toUpperCase();
  const lead = `${first} CASTS ${d.commits.toLocaleString('en-US')} COMMITS IN ${d.year}`;
  if (d.upstream.prs > 0) return `${lead}; ${plural(d.upstream.prs, 'SPELL').toUpperCase()} ACCEPTED ABROAD`;
  return `${lead}; STREAK STANDS AT ${d.streak.current} DAYS`;
}

// hourglass outline, centred on cx, top at y; 46 wide, 84 tall
const glass = (cx, y) => `M ${cx - 20} ${y + 6} C ${cx - 20} ${y + 32} ${cx - 3} ${y + 35} ${cx - 3} ${y + 42} C ${cx - 3} ${y + 49} ${cx - 20} ${y + 52} ${cx - 20} ${y + 78} L ${cx + 20} ${y + 78} C ${cx + 20} ${y + 52} ${cx + 3} ${y + 49} ${cx + 3} ${y + 42} C ${cx + 3} ${y + 35} ${cx + 20} ${y + 32} ${cx + 20} ${y + 6} Z`;

function hourglass(cx, y, lang, frac, i, t) {
  const id = `hg${i}`, low = 34 * frac, high = 30 * (1 - frac);
  const pct = `${Math.round(lang.share * 100)}%`;
  return `<g style="animation: fade .5s ease-out ${(0.6 + i * 0.08).toFixed(2)}s backwards">
<clipPath id="${id}"><path d="${glass(cx, y)}"/></clipPath>
<g clip-path="url(#${id})">
  <rect x="${cx - 22}" y="${(y + 40 - high).toFixed(1)}" width="44" height="${high.toFixed(1)}" fill="${lang.color}" opacity=".55"/>
  <rect x="${cx - 22}" y="${(y + 78 - low).toFixed(1)}" width="44" height="${low.toFixed(1)}" fill="${lang.color}" class="sand" style="animation-delay:${(0.7 + i * 0.08).toFixed(2)}s"/>
  <line x1="${cx}" x2="${cx}" y1="${y + 40}" y2="${y + 78}" stroke="${lang.color}" stroke-width="1.5" stroke-dasharray="2 3" class="fall"/>
</g>
<path d="${glass(cx, y)}" fill="${t.fg}" fill-opacity=".04" stroke="${t.fg}" stroke-opacity=".55" stroke-width="1.3"/>
<rect x="${cx - 27}" y="${y}" width="54" height="6" rx="2" fill="${t.edge}"/>
<rect x="${cx - 27}" y="${y + 78}" width="54" height="6" rx="2" fill="${t.edge}"/>
<text x="${cx}" y="${y + 108}" text-anchor="middle" style="font-size:14px">${esc(clip(lang.name, 14))}</text>
<text x="${cx}" y="${y + 128}" text-anchor="middle" class="d" style="font-size:16px;font-weight:700">${pct}</text>
</g>`;
}

export function stats(d, t) {
  const X = 32, R = W - 32, mid = W / 2;
  const now = new Date(d.generatedAt);
  const name = 'THE DAILY COMMIT';
  const mast = fit(name, 560, 46, 700, 3);
  const mastW = measure(name, mast, 700, 3);

  const cols = [
    ['CONTRIBUTIONS', d.contributions, `in ${d.year} on GitHub`],
    ['COMMITS', d.commits, `commits in ${d.year}`],
    ['OWLS DELIVERED', d.upstream.prs, 'PRs merged elsewhere'],
    ['DISTANT CASTLES', d.upstream.repos, 'repos contributed to'],
    ['STREAK', plural(d.streak.current, 'day'), `daily streak · best ${d.streak.best}d`],
    ['DUELS WON', d.leetcodeSolved ?? '-', 'LeetCode problems solved'],
  ];
  const colW = (R - X) / cols.length, cTop = 196;
  const colEls = cols.map(([k, v, sub], i) => {
    const cx = X + colW * i + colW / 2;
    const val = typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
    return `<g style="animation: rise .45s ease-out ${(0.25 + i * 0.07).toFixed(2)}s backwards">
${label(cx.toFixed(1), cTop, k, 'middle', 'acc')}
<text x="${cx.toFixed(1)}" y="${cTop + 42}" text-anchor="middle" class="d" style="font-size:${fit(val, colW - 24, 36)}px;font-weight:700">${esc(val)}</text>
<text x="${cx.toFixed(1)}" y="${cTop + 64}" text-anchor="middle" class="i dim" style="font-size:12.5px">${esc(clip(sub, 26))}</text>
</g>${i ? `<line x1="${(X + colW * i).toFixed(1)}" x2="${(X + colW * i).toFixed(1)}" y1="${cTop - 16}" y2="${cTop + 72}" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.04}"/>` : ''}`;
  }).join('\n');

  // house points: one hourglass per language, filled relative to the leader
  const langs = d.languages.filter((l) => l.share >= 0.01).slice(0, 6);
  const top = langs[0]?.share || 1, gy = 340;
  const gap = (R - X) / Math.max(1, langs.length);
  const glasses = langs.map((l, i) => hourglass(X + gap * i + gap / 2, gy, l, l.share / top, i, t)).join('\n');

  const rule = (y, double = false) => `<line x1="${X}" x2="${R}" y1="${y}" y2="${y}" stroke="${t.fg}" stroke-opacity=".7" stroke-width="${double ? 2 : 1}"/>${double ? `<line x1="${X}" x2="${R}" y1="${y + 4}" y2="${y + 4}" stroke="${t.fg}" stroke-opacity=".5"/>` : ''}`;
  const h = gy + 150;
  const body = `
${candle(mid - mastW / 2 - 34, 46, t, 0)}${candle(mid + mastW / 2 + 34, 46, t, 0.7)}
<text x="${mid}" y="76" text-anchor="middle" class="d" style="font-size:${mast}px;font-weight:700;letter-spacing:3px">${name}</text>
${rule(92, true)}
<text x="${X}" y="114" class="d dim" style="font-size:10.5px;font-weight:700;letter-spacing:2px">VOL. ${d.year} · NO. ${ORDINAL_DAY(now)}</text>
<text x="${mid}" y="114" text-anchor="middle" class="d dim" style="font-size:10.5px;font-weight:700;letter-spacing:2px">${esc(DAY_FMT.format(now).toUpperCase())}</text>
<text x="${R}" y="114" text-anchor="end" class="d dim" style="font-size:10.5px;font-weight:700;letter-spacing:2px">REPRINTED FROM GITHUB EVERY 6 HOURS</text>
${rule(124)}
<text x="${mid}" y="158" text-anchor="middle" class="d" style="font-size:${fit(headline(d), R - X, 25, 700, 1)}px;font-weight:700;letter-spacing:1px;animation: rise .5s ease-out .1s backwards">${esc(headline(d))}</text>
${colEls}
${rule(cTop + 90)}
<text x="${mid}" y="${cTop + 118}" text-anchor="middle" class="d" style="font-size:16px;font-weight:700;letter-spacing:2.5px">HOUSE POINTS</text>
<text x="${mid}" y="${cTop + 136}" text-anchor="middle" class="i dim" style="font-size:13px">share of code by language; sand is measured against the leader</text>
${glasses}`;
  const css = `.flame { transform-box: fill-box; transform-origin: center bottom; animation: flicker 2.2s ease-in-out infinite; }
@keyframes flicker { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(.9, 1.08) skewX(2deg); } 60% { transform: scale(1.05, .94) skewX(-2deg); } }
.glow { animation: glow 2.2s ease-in-out infinite; } @keyframes glow { 50% { opacity: .08; } }
.sand { transform-box: fill-box; transform-origin: center bottom; animation: pour 1.4s cubic-bezier(.3,.6,.3,1) backwards; }
@keyframes pour { from { transform: scaleY(0); } }
.fall { animation: stream .6s linear infinite; } @keyframes stream { to { stroke-dashoffset: -5; } }`;
  const alt = `The Daily Commit, ${DAY_FMT.format(now)}: ${headline(d).toLowerCase()}. `
    + cols.map(([k, v, sub]) => `${v} ${sub}`).join(', ')
    + `. Code by language: ${langs.map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(', ')}.`;
  return frame({ h, t, title: alt, body, css });
}

// ── owl post: merged PRs to other people's repos ────────────────────────────
export function upstreamLog(d, t, limit = 8) {
  const X = 32, R = W - 32, list = d.upstream.list.slice(0, limit), rowH = 36, top = 104;
  const rows = list.map((p, i) => {
    const y = top + i * rowH;
    const [yy, mm, dd] = p.merged.split('-');
    const date = `${Number(dd)} ${MONTHS[Number(mm) - 1]} ${yy}`;
    return `<g style="animation: rise .4s ease-out ${(0.1 + i * 0.07).toFixed(2)}s backwards">
  ${i % 2 ? '' : `<rect x="${X - 10}" y="${y - 23}" width="${R - X + 20}" height="${rowH}" rx="4" fill="${t.paper}" fill-opacity="${t.mode === 'dark' ? 0.7 : 0.6}"/>`}
  <text x="${X}" y="${y}" class="d dim" style="font-size:12.5px;font-weight:700;letter-spacing:1px">${esc(date)}</text>
  ${seal(X + 132, y - 5, t)}
  <text x="${X + 170}" y="${y}" class="d" style="font-size:14.5px;font-weight:700">${esc(clip(p.repo, 30))}</text>
  <text x="${X + 470}" y="${y}" class="i" style="font-size:14px">${esc(clip(p.title, 56))}</text>
  <text x="${R}" y="${y}" text-anchor="end" class="d dim" style="font-size:12.5px;font-weight:700">#${esc(p.number)}</text>
</g>`;
  }).join('\n');
  const empty = list.length ? '' : `<text x="${X}" y="${top}" class="i dim">No owls sent yet.</text>`;
  const footY = top + Math.max(1, list.length) * rowH;
  const more = d.upstream.prs > list.length ? `  ·  latest ${list.length} shown` : '';
  const body = `${heading(t, X, 40, 'OWL POST', 'pull requests merged into other people\'s projects')}
${label(X, 70, 'DELIVERED')}${label(X + 132, 70, 'SEAL', 'middle')}${label(X + 170, 70, 'TO')}${label(X + 470, 70, 'THE LETTER')}${label(R, 70, 'PR', 'end')}
<line x1="${X}" x2="${R}" y1="78" y2="78" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.06}"/>
${rows}${empty}
<text x="${X}" y="${footY + 4}" class="d dim" style="font-size:11.5px;font-weight:700;letter-spacing:2px">${esc(`${plural(d.upstream.prs, 'letter')} delivered to ${plural(d.upstream.repos, 'distant castle')}${more}`.toUpperCase())}</text>`;
  const alt = `Owl post: ${d.upstream.prs} merged pull requests to ${d.upstream.repos} other projects. `
    + list.map((p) => `${p.repo}: ${p.title} (merged ${p.merged})`).join('; ');
  return frame({ h: footY + 26, t, title: alt, body });
}

// ── not redesigned yet: render in the psql look until their phase lands ─────
const P = (fn) => (...args) => fn(...args.map((a) => (a && a.wizarding ? psql.THEMES[a.mode] : a)));
export const linkButton = P(psql.linkButton);
export const queryButton = P(psql.queryButton);
export const queryResult = P(psql.queryResult);
export const footer = P(psql.footer);
