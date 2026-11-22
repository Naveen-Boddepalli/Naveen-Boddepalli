/**
 * `UNIQUE` (plan.md §25.4 B3c), as a fact about a table's rows rather than about a tree.
 *
 * An index is unique when no two rows hold the same key — and, as SQL says, a key with a NULL in it never counts:
 * NULL is not equal to NULL, so any number of rows may hold one. The write path enforces it through the index
 * (`exec/unique.ts` looks the new key up first); this is the same rule applied to a whole table at once, for
 * whoever has to decide whether a set of rows may sit under a unique index at all (the Custom database editor).
 */
import { indexNameOf, indexSpecsOf } from "./spec.js";
/** The first pair of rows that break a unique index of `table` — in `rows` (default: its own) — or `null`. */
export function uniqueViolation(table, rows) {
    for (const spec of indexSpecsOf(table)) {
        if (!spec.unique)
            continue;
        const seen = new Set();
        for (const row of rows) {
            const values = spec.columns.map((c) => row[c] ?? null);
            if (values.some((v) => v === null))
                continue; // NULL never conflicts
            const key = JSON.stringify(values);
            if (seen.has(key))
                return { index: indexNameOf(spec.columns), columns: spec.columns, values };
            seen.add(key);
        }
    }
    return null;
}
/** `(email) = ('a@x')` — a key the way PostgreSQL's constraint errors write it. */
export function describeUniqueKey(columns, values) {
    return `(${columns.join(', ')}) = (${values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(', ')})`;
}
