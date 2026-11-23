// Wizarding theme: the six ratings from ratings.mjs as school subjects with
// letter grades. Pure functions, no I/O. ratings.mjs itself is unchanged, so
// Matchday keeps its numbers.

import { ratings } from '../../ratings.mjs';

// Keyed by the ATTRIBUTES keys in ratings.mjs.
export const SUBJECTS = {
  PAC: 'Apparition',
  FIN: 'Charms',
  VIS: 'Transfiguration',
  TEA: 'Care of Magical Creatures',
  STA: 'Potions',
  COM: 'Astronomy',
};

// Highest band first. Scores run 40–99 (see ratings.mjs).
export const GRADES = [
  { letter: 'O', name: 'Outstanding', min: 90 },
  { letter: 'E', name: 'Exceeds Expectations', min: 80 },
  { letter: 'A', name: 'Acceptable', min: 68 },
  { letter: 'P', name: 'Poor', min: 56 },
  { letter: 'D', name: 'Dreadful', min: 46 },
  { letter: 'T', name: 'Troll', min: -Infinity },
];

export const grade = (value) => GRADES.find((g) => value >= g.min);

/** { overall, overallGrade, subjects: [{ key, subject, label, means, how, weight, value, grade }] } */
export function results(d, now) {
  const r = ratings(d, now);
  return {
    overall: r.overall,
    overallGrade: grade(r.overall),
    subjects: r.attrs.map((a) => ({ ...a, subject: SUBJECTS[a.key] ?? a.label, grade: grade(a.value) })),
  };
}
