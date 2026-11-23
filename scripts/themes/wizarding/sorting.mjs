// Wizarding theme: sorts the profile into a house from its ratings. Pure, no I/O.
//
// Each house scores the mean of the ratings that match its trait; the highest
// wins and ties go to the house listed first. The data refreshes every 6
// hours, so the profile can be re-sorted when the numbers shift.

import { SUBJECTS } from './owls.mjs';

export const HOUSES = [
  { name: 'Gryffindor', trait: 'boldness', from: ['TEA', 'PAC'] },
  { name: 'Ravenclaw', trait: 'breadth of mind', from: ['VIS'] },
  { name: 'Hufflepuff', trait: 'steady hard work', from: ['STA', 'COM'] },
  { name: 'Slytherin', trait: 'ambition', from: ['FIN'] },
];

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * attrs: [{ key, value }] as returned by ratings() or results().subjects.
 * Returns { house, trait, score, ranking: [{ name, trait, from, score }], reason }.
 */
export function sortHouse(attrs) {
  const value = Object.fromEntries(attrs.map((a) => [a.key, a.value]));
  const ranking = HOUSES
    .map((h, i) => ({ ...h, i, score: h.from.reduce((s, k) => s + (value[k] ?? 0), 0) / h.from.length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i, ...h }) => h);
  const [win, next] = ranking;
  const by = win.from.map((k) => `${SUBJECTS[k]} ${value[k] ?? 0}`).join(' + ');
  const reason = win.score === next.score
    ? `${win.trait} (${by}) tied with ${next.name} on ${fmt(next.score)}; ties go to ${win.name}`
    : `${win.trait} (${by}) scored ${fmt(win.score)}, ahead of ${next.name} on ${fmt(next.score)}`;
  return { house: win.name, trait: win.trait, score: win.score, ranking, reason };
}
