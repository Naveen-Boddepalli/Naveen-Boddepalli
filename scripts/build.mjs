#!/usr/bin/env node
// Builds the profile SVGs into an output folder (default dist/profile).
//
//   GITHUB_TOKEN=... node scripts/build.mjs            live data (used in CI)
//   node scripts/build.mjs --sample --preview          sample data + preview.html
//   ... --readme README.md                             also sync the README projects block
//
// Every image is written in a -dark and a -light variant.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchProfile, normalize } from './data.mjs';
import { sampleResponse } from './sample.mjs';
import * as svg from './svg.mjs';
import { syncReadme } from './readme.mjs';

const started = Date.now();
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const cfg = JSON.parse(await readFile(new URL('./profile.config.json', import.meta.url), 'utf8'));
cfg.login = process.env.PROFILE_LOGIN || cfg.login;
const out = opt('out', 'dist/profile');
const now = new Date();

let resp;
if (flag('sample')) {
  resp = sampleResponse(now);
} else {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN is not set. Use --sample to render with sample data.');
    process.exit(1);
  }
  resp = await fetchProfile(cfg.login, token, now);
}
const d = normalize(resp, cfg, now);

// name -> (theme) => svg string
const images = {
  hero: (t) => svg.hero(d, t),
  'projects-header': (t) => svg.resultHeader(d, t),
  ...Object.fromEntries(d.pinned.map((r, i) => [`project-${i + 1}`, (t) => svg.resultRow(r, i, t, now)])),
  'projects-footer': (t) => svg.resultFooter(d, t),
  stats: (t) => svg.stats(d, t),
  ...Object.fromEntries(cfg.links.map((l) => [`link-${l.label}`, (t) => svg.linkButton(l.label, t)])),
  ...Object.fromEntries(cfg.queries.map((q, i) => [`query-${i + 1}`, (t) => svg.queryButton(q.label, t)])),
};
const fileCount = (Object.keys(images).length + 1) * 2; // +1 for the footer itself
images.footer = (t) => svg.footer(d, t, Date.now() - started, fileCount);

await mkdir(out, { recursive: true });
const written = [];
for (const [name, render] of Object.entries(images)) {
  for (const theme of ['dark', 'light']) {
    const file = `${name}-${theme}.svg`;
    await writeFile(join(out, file), render(svg.THEMES[theme]));
    written.push(file);
  }
}
await writeFile(join(out, 'data.json'), JSON.stringify(d, null, 2) + '\n');

const readmePath = opt('readme', null);
if (readmePath) {
  const before = await readFile(readmePath, 'utf8');
  const after = syncReadme(before, d, cfg);
  if (after !== before) await writeFile(readmePath, after);
  console.log(after === before ? 'README generated blocks already in sync' : 'README generated blocks updated');
}

if (flag('preview')) {
  const names = Object.keys(images);
  const col = (theme) => `<div class="${theme}">${names.map((n) => `<img src="${n}-${theme}.svg" alt="${n}">`).join('')}</div>`;
  await writeFile(join(out, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>Profile preview</title>
<style>body{margin:0;display:grid;grid-template-columns:1fr 1fr}div{padding:24px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
img{max-width:100%}.dark{background:#0d1117}.light{background:#fff}</style>${col('dark')}${col('light')}`);
}

console.log(`Wrote ${written.length} SVGs + data.json to ${out} in ${Date.now() - started} ms${flag('sample') ? ' (SAMPLE DATA)' : ''}`);
