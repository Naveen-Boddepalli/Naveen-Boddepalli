// node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratings, scores, season, ATTRIBUTES } from './ratings.mjs';
import { normalize } from './data.mjs';
import { sampleResponse } from './sample.mjs';

const now = new Date('2026-11-22T12:00:00Z');
const cfg = { login: 'Naveen-Boddepalli', name: 'N', excludeLanguages: ['Jupyter Notebook'] };
const sample = normalize(sampleResponse(now), cfg, now);

const empty = {
  pinned: [], ownRepos: 0, liveDemos: 0, stars: 0, contributions: 0,
  upstream: { prs: 0, repos: 0 }, streak: { best: 0 }, languages: [],
};
const huge = {
  pinned: [{ pushedAt: now.toISOString() }], ownRepos: 10, liveDemos: 10, stars: 1e6, contributions: 1e6,
  upstream: { prs: 1e4, repos: 1e3 }, streak: { best: 1e4 },
  languages: Array.from({ length: 12 }, () => ({ share: 1 / 12 })),
};

test('weights add up to 1', () => {
  assert.equal(Math.round(ATTRIBUTES.reduce((s, a) => s + a.weight, 0) * 1e9), 1e9);
});

test('every rating stays within 40..99', () => {
  for (const d of [empty, huge, sample]) {
    const r = ratings(d, now);
    for (const a of r.attrs) assert.ok(a.value >= 40 && a.value <= 99, `${a.key}=${a.value}`);
    assert.ok(r.overall >= 40 && r.overall <= 99);
  }
  assert.equal(ratings(empty, now).overall, 40);
  assert.equal(ratings(huge, now).overall, 99);
});

test('more activity never lowers a score', () => {
  const base = scores(sample, now);
  const more = scores({ ...sample, contributions: sample.contributions + 500, upstream: { prs: 40, repos: 9 }, streak: { best: 60 } }, now);
  for (const k of ['STA', 'TEA', 'COM']) assert.ok(more[k] >= base[k], k);
  const stale = scores({ ...sample, pinned: sample.pinned.map((p) => ({ ...p, pushedAt: '2025-01-01T00:00:00Z' })) }, now);
  assert.ok(stale.PAC < base.PAC);
});

test('sample profile lands in a believable range', () => {
  const r = ratings(sample, now);
  assert.ok(r.overall >= 60 && r.overall <= 85, `overall ${r.overall}`);
});

test('season rolls over in August', () => {
  assert.equal(season(new Date('2026-07-31T00:00:00Z')), '2025/26');
  assert.equal(season(new Date('2026-08-01T00:00:00Z')), '2026/27');
  assert.equal(season(new Date('2099-12-01T00:00:00Z')), '2099/00');
});
