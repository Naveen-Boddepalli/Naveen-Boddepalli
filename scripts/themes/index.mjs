// Picks the renderer set named by `theme` in profile.config.json.
//
// A theme lives in scripts/themes/<name>/svg.mjs and exports:
//   THEMES          { dark, light } colour tokens, passed back to every renderer
//   hero, resultHeader, resultRow, resultFooter, stats, upstreamLog,
//   linkButton, queryButton, queryResult, footer
// and optionally
//   extras(d, cfg, now) -> { imageName: (t) => svgString }  for theme-only images

import { readdir } from 'node:fs/promises';

export const DEFAULT_THEME = 'psql';

export const REQUIRED = [
  'THEMES', 'hero', 'resultHeader', 'resultRow', 'resultFooter', 'stats',
  'upstreamLog', 'linkButton', 'queryButton', 'queryResult', 'footer',
];

export async function availableThemes() {
  const entries = await readdir(new URL('./', import.meta.url), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export async function loadTheme(name = DEFAULT_THEME) {
  const known = await availableThemes();
  if (!known.includes(name)) {
    throw new Error(`Unknown theme "${name}" in profile.config.json. Available: ${known.join(', ')}`);
  }
  const mod = await import(new URL(`./${name}/svg.mjs`, import.meta.url));
  const missing = REQUIRED.filter((k) => !(k in mod));
  if (missing.length) throw new Error(`Theme "${name}" is missing exports: ${missing.join(', ')}`);
  if (!mod.THEMES.dark || !mod.THEMES.light) throw new Error(`Theme "${name}" must define THEMES.dark and THEMES.light`);
  return mod;
}
