// node --test "scripts/**/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, results, SUBJECTS } from './themes/wizarding/owls.mjs';
import { sortHouse, HOUSES } from './themes/wizarding/sorting.mjs';
import { ATTRIBUTES } from './ratings.mjs';
import { normalize } from './data.mjs';
import { sampleResponse } from './sample.mjs';

const now = new Date('2026-11-22T12:00:00Z');
const cfg = { login: 'Naveen-Boddepalli', name: 'N', excludeLanguages: ['Jupyter Notebook'] };
const sample = normalize(sampleResponse(now), cfg, now);

const attrs = (o) => Object.entries({ PAC: 60, FIN: 60, VIS: 60, TEA: 60, STA: 60, COM: 60, ...o })
  .map(([key, value]) => ({ key, value }));

test('every rating has a subject and every house uses known ratings', () => {
  for (const a of ATTRIBUTES) assert.ok(SUBJECTS[a.key], a.key);
  for (const h of HOUSES) for (const k of h.from) assert.ok(SUBJECTS[k], `${h.name}: ${k}`);
});

test('grade bands', () => {
  const cases = [[99, 'O'], [90, 'O'], [89, 'E'], [80, 'E'], [79, 'A'], [68, 'A'], [67, 'P'],
    [56, 'P'], [55, 'D'], [46, 'D'], [45, 'T'], [40, 'T']];
  for (const [v, letter] of cases) assert.equal(grade(v).letter, letter, `${v}`);
});

test('results grade every subject and the overall', () => {
  const r = results(sample, now);
  assert.equal(r.subjects.length, ATTRIBUTES.length);
  for (const s of r.subjects) assert.equal(s.grade.letter, grade(s.value).letter);
  assert.equal(r.overallGrade.letter, grade(r.overall).letter);
});

test('each house can win', () => {
  assert.equal(sortHouse(attrs({ TEA: 95, PAC: 95 })).house, 'Gryffindor');
  assert.equal(sortHouse(attrs({ VIS: 95 })).house, 'Ravenclaw');
  assert.equal(sortHouse(attrs({ STA: 95, COM: 95 })).house, 'Hufflepuff');
  assert.equal(sortHouse(attrs({ FIN: 95 })).house, 'Slytherin');
});

test('houses score the mean of their ratings', () => {
  const s = sortHouse(attrs({ TEA: 90, PAC: 70, VIS: 79 }));
  assert.equal(s.house, 'Gryffindor');
  assert.equal(s.score, 80);
  assert.match(s.reason, /ahead of Ravenclaw on 79/);
});

test('ties go to the house listed first', () => {
  const all = sortHouse(attrs({}));
  assert.equal(all.house, 'Gryffindor');
  assert.match(all.reason, /tied with Ravenclaw/);
  assert.equal(sortHouse(attrs({ VIS: 80, FIN: 80 })).house, 'Ravenclaw');
  assert.equal(sortHouse(attrs({ STA: 80, COM: 80, FIN: 80 })).house, 'Hufflepuff');
});

test('ranking lists all four houses, best first', () => {
  const s = sortHouse(results(sample, now).subjects);
  assert.equal(s.ranking.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(s.ranking[i - 1].score >= s.ranking[i].score);
});
