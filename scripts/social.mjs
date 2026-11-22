#!/usr/bin/env node
// Renders a 1280×640 social preview image for each pinned repo, in the same
// psql style as the profile, as SVG and (with Chrome installed) PNG.
//
//   node scripts/social.mjs [--out social] [--sample]
//
// Upload each PNG in the repo's Settings → General → Social preview.
// GitHub has no API for that upload, so it stays a manual step.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchProfile, normalize } from './data.mjs';
import { sampleResponse } from './sample.mjs';
import { THEMES, esc } from './svg.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const cfg = JSON.parse(await readFile(new URL('./profile.config.json', import.meta.url), 'utf8'));
const out = opt('out', 'social');
const now = new Date();
const resp = args.includes('--sample') || !process.env.GITHUB_TOKEN ? sampleResponse(now) : await fetchProfile(cfg.login, process.env.GITHUB_TOKEN, now);
const d = normalize(resp, cfg, now);

const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace`;
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const t = THEMES.dark;

function wrap(text, max) {
  const lines = [''];
  for (const w of text.split(/\s+/)) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines.slice(0, 3);
}

function card(r) {
  const about = wrap(r.about, 44).map((l, i) => `<text x="80" y="${330 + i * 48}" font-family="${SANS}" font-size="36" fill="${t.dim}">${esc(l)}</text>`).join('');
  const lang = r.lang ? `<circle cx="92" cy="${528}" r="10" fill="${r.lang.color || t.dim}"/><text x="114" y="538" font-family="${MONO}" font-size="28" fill="${t.fg}">${esc(r.lang.name)}</text>` : '';
  const demo = r.demo ? `<text x="1200" y="538" text-anchor="end" font-family="${MONO}" font-size="24" fill="${t.green}">${esc(r.demo.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</text>` : '';
  const size = r.name.length > 16 ? 76 : 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
<rect width="1280" height="640" fill="${t.bg}"/>
<rect x="24" y="24" width="1232" height="592" rx="20" fill="none" stroke="${t.border}" stroke-width="2"/>
<text x="80" y="118" font-family="${MONO}" font-size="28"><tspan fill="${t.accent}" font-weight="700">naveen=#</tspan><tspan fill="${t.fg}"> \\d+ </tspan><tspan fill="${t.fg}">${esc(r.name.toLowerCase())}</tspan></text>
<text x="80" y="244" font-family="${SANS}" font-size="${size}" font-weight="700" fill="${t.fg}" letter-spacing="-1">${esc(r.name)}</text>
${about}
<line x1="80" x2="1200" y1="480" y2="480" stroke="${t.faint}" stroke-width="2"/>
${lang}${demo}
<text x="1200" y="118" text-anchor="end" font-family="${MONO}" font-size="24" fill="${t.dim}">github.com/${esc(d.login)}</text>
</svg>
`;
}

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(out, { recursive: true });
for (const r of d.pinned) {
  const svgPath = join(out, `${r.name}.svg`);
  await writeFile(svgPath, card(r));
  if (existsSync(chrome)) {
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--screenshot=${resolve(out, `${r.name}.png`)}`, '--window-size=1280,640', pathToFileURL(resolve(svgPath)).href], { stdio: 'ignore' });
  }
  console.log(`${r.name}: ${svgPath}${existsSync(chrome) ? ' + .png' : ''}`);
}
