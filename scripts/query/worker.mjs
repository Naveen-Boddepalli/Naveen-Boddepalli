// Runs one query on the QueryLens engine in a worker thread, so the caller can
// stop it if it runs too long.
import { parentPort, workerData } from 'node:worker_threads';
import { runQuery } from '../vendor/querylens-engine/index.js';
import { SCHEMA } from './guard.mjs';

const { sql, tables } = workerData;
const db = { tables: {} };
for (const [name, columns] of Object.entries(SCHEMA)) {
  db.tables[name] = { name, columns, rows: tables[name] ?? [], indexedColumns: columns.slice(0, 1) };
}

const started = performance.now();
const r = runQuery(sql, db);
const ms = performance.now() - started;
const stages = [...new Set(r.events.map((e) => e.stage))];

parentPort.postMessage({
  rows: r.rows,
  error: r.error ? { message: r.error.message, hint: r.error.hint ?? null } : null,
  wrote: Boolean(r.write),
  stages,
  ms,
});
