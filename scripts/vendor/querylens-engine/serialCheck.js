/**
 * Did a schedule behave as if its transactions had run one at a time (plan.md §25.4 D6)? Whatever the protocol, the
 * answer is the same question put to its record: take the transactions that committed, run them one after another on
 * a fresh database in the order a serial schedule would have put them, and compare. Two things have to agree — the
 * table that is left, and what each of those transactions *read*. The second matters: write skew leaves a table that
 * a serial run could also have left, and is only caught because each transaction saw something no serial run would
 * have shown it.
 *
 * This is a check on one run, not a proof about the protocol. It is held against fuzzed schedules in the tests.
 */
import { runQuery } from "./runQuery.js";
import { createAccountsDatabase } from "./seed.js";
/** Every transaction of a run, in the order they were *decided*. A statement outside a transaction is one of its own. */
export function transactionsOf(result) {
    const open = new Map();
    const out = [];
    const settle = (txn, fate, at, reason) => {
        txn.fate = fate;
        txn.ended = at;
        if (reason !== undefined)
            txn.reason = reason;
        out.push(txn);
    };
    result.steps.forEach((r, at) => {
        if (r.phase === 'queued' || r.phase === 'blocked')
            return;
        const txn = open.get(r.session);
        if (r.kind === 'begin') {
            if (r.notes.some((n) => n.includes('begins'))) {
                open.set(r.session, {
                    session: r.session,
                    statements: [],
                    fate: 'open',
                    began: at,
                    ended: at,
                    explicit: true,
                    writes: false,
                });
            }
            return;
        }
        if (r.phase === 'victim') {
            if (txn) {
                settle(txn, 'aborted', at, r.error);
                open.delete(r.session);
            }
            else if (r.kind === 'statement') {
                out.push({
                    session: r.session,
                    statements: [],
                    fate: 'aborted',
                    reason: r.error ?? 'refused by the protocol',
                    began: at,
                    ended: at,
                    explicit: false,
                    writes: false,
                });
            }
            return;
        }
        if (r.kind === 'commit') {
            if (txn) {
                settle(txn, 'committed', at);
                open.delete(r.session);
            }
            return;
        }
        if (r.kind === 'rollback') {
            if (txn) {
                settle(txn, 'rolled-back', at);
                open.delete(r.session);
            }
            return;
        }
        if (r.kind === 'statement' && r.error === undefined && r.run !== undefined) {
            const done = { sql: r.sql, rows: r.rows, write: r.run.write !== undefined };
            if (txn) {
                txn.statements.push(done);
                if (done.write)
                    txn.writes = true;
            }
            else {
                out.push({
                    session: r.session,
                    statements: [done],
                    fate: 'committed',
                    began: at,
                    ended: at,
                    explicit: false,
                    writes: done.write,
                });
            }
        }
    });
    for (const txn of open.values())
        out.push({ ...txn, fate: 'open' });
    return out;
}
const canonical = (rows) => rows.map((r) => JSON.stringify(r)).sort();
const sameRows = (a, b) => {
    const x = canonical(a);
    const y = canonical(b);
    return x.length === y.length && x.every((v, i) => v === y[i]);
};
const stateKey = (db) => JSON.stringify(Object.entries(db.tables).map(([name, table]) => [name, canonical(table.rows)]));
/**
 * Runs one transaction's statements on `db`, in order. `ok` is false once a statement answers differently from the
 * way it did in the run; with `stop` the replay ends there, otherwise it carries on applying writes so that the
 * table it leaves is still the one this order leaves.
 */
function replay(db, txn, stop) {
    let now = db;
    let different = null;
    for (const statement of txn.statements) {
        const run = runQuery(statement.sql, now);
        if (different === null && !sameRows(run.rows, statement.rows)) {
            different = { session: txn.session, sql: statement.sql, saw: statement.rows, serialSaw: run.rows };
            if (stop)
                return { db: now, ok: false, different };
        }
        if (run.write) {
            const table = now.tables[run.write.table];
            now = { tables: { ...now.tables, [run.write.table]: { ...table, rows: run.write.rows } } };
        }
    }
    return { db: now, ok: different === null, different };
}
/** How many single-transaction replays the search may spend before it gives up. */
const SEARCH_BUDGET = 4000;
/**
 * Replays the committed transactions serially. `order` says which natural serial order to report on: when they
 * *committed* (what locking, validation and snapshots promise), or when they *began* (what timestamp ordering
 * promises). The verdict is wider than either: serializable if any order works.
 */
export function serialCheck(result, rows, order = 'commit', start = createAccountsDatabase(rows), budget = SEARCH_BUDGET) {
    const committed = transactionsOf(result).filter((t) => t.fate === 'committed');
    const target = result.committed.tables.accounts?.rows ?? [];
    const byCommit = [...committed].sort((a, b) => a.ended - b.ended);
    const byBegin = [...committed].sort((a, b) => a.began - b.began);
    const attempt = (txns) => {
        let db = start;
        let different = null;
        for (const txn of txns) {
            const r = replay(db, txn, false);
            db = r.db;
            if (different === null)
                different = r.different;
        }
        return { db, different };
    };
    const natural = attempt(order === 'begin' ? byBegin : byCommit);
    const naturalRows = natural.db.tables.accounts?.rows ?? [];
    const sameTable = sameRows(target, naturalRows);
    const base = {
        rows: naturalRows,
        sameTable,
        differentRead: natural.different,
        order: (order === 'begin' ? byBegin : byCommit).map((t) => t.session),
    };
    if (sameTable && natural.different === null) {
        return { ...base, serializable: true, found: base.order, exhaustive: true };
    }
    const other = attempt(order === 'begin' ? byCommit : byBegin);
    if (sameRows(target, other.db.tables.accounts?.rows ?? []) && other.different === null) {
        const found = (order === 'begin' ? byCommit : byBegin).map((t) => t.session);
        return { ...base, serializable: true, found, exhaustive: true };
    }
    // Neither natural order explains it. Look for any order, extending only prefixes whose every statement agrees, and
    // remembering (set of transactions placed, table) pairs already shown to lead nowhere.
    let left = budget;
    let exhaustive = true;
    const failed = new Set();
    const place = (db, placed, mask) => {
        if (placed.length === committed.length)
            return sameRows(target, db.tables.accounts?.rows ?? []) ? placed : null;
        const key = `${String(mask)}|${stateKey(db)}`;
        if (failed.has(key))
            return null;
        for (let i = 0; i < committed.length; i += 1) {
            if ((mask >> BigInt(i)) & 1n)
                continue;
            if (left <= 0) {
                exhaustive = false;
                return null;
            }
            left -= 1;
            const r = replay(db, committed[i], true);
            if (!r.ok)
                continue;
            const found = place(r.db, [...placed, i], mask | (1n << BigInt(i)));
            if (found)
                return found;
            if (!exhaustive)
                return null;
        }
        failed.add(key);
        return null;
    };
    const found = place(start, [], 0n);
    return {
        ...base,
        serializable: found !== null,
        found: found === null ? null : found.map((i) => committed[i].session),
        exhaustive,
    };
}
