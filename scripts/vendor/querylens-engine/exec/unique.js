/**
 * Enforcing `UNIQUE` (plan.md §25.4 B3c). A unique constraint is not a rule checked somewhere else — it *is* an
 * index lookup: before a new key goes in, the index is asked whether it is already there, and if it is the statement
 * is rejected. That is why every unique constraint is backed by an index, and why an `INSERT` into a table with one
 * reads index pages even though it never scans anything. Each check below narrates that lookup, real page reads and
 * all; on a violation it throws, and `runQuery` turns the throw into the statement's error — no change is made,
 * because a write's rows only reach the table when the whole statement succeeds.
 */
import { rowAt } from "./operators.js";
import { describeUniqueKey, emitIndexLookup, indexNameOf, indexSpecsOf, keyValuesOf, resolveClustered } from "../index/index.js";
/** A statement tried to put a key into a unique index that already holds it. */
export class UniqueViolation extends Error {
    index;
    columns;
    values;
    holder;
    constructor(index, columns, values, holder) {
        super(`duplicate key value violates unique index ${index}`);
        this.index = index;
        this.columns = columns;
        this.values = values;
        this.holder = holder;
    }
}
/** Asks the unique index whether `values` is already there; throws `UniqueViolation` if it is. */
function checkKey(ctx, spec, values, statement) {
    const name = indexNameOf(spec.columns);
    const tree = ctx.trees[name];
    if (!tree)
        return;
    // A NULL in the key is never equal to another NULL, so it can conflict with nothing: there is nothing to look up.
    if (values.some((v) => v === null)) {
        ctx.emit(`The UNIQUE index on \`${name}\` has a NULL in this key, and NULL is not equal to NULL, so it cannot conflict with any entry — no lookup is needed.`, {
            stage: 'execute',
            op: statement === 'INSERT' ? 'Insert' : 'Update',
            rowsProduced: 0,
        });
        return;
    }
    const key = describeUniqueKey(spec.columns, values);
    ctx.emit(`${statement} checks the UNIQUE index on \`${name}\` before it changes anything: is there already an entry for ${key}?`, {
        stage: 'execute',
        op: statement === 'INSERT' ? 'Insert' : 'Update',
        rowsProduced: 0,
    });
    const outcome = emitIndexLookup(ctx.emit, tree, values, ctx.pool, name, ctx.locks, false, `Found ${key} — the key is already taken, so ${statement} will be rejected.`);
    if (outcome.pointer) {
        // On a clustered table's secondary UNIQUE index, `pointer` is a sentinel — the row that has the key needs the
        // same second descent any other match through this index would (plan.md §25.4 B3e), so the error can still say
        // which row holds it, not just that one does.
        const clusterKey = outcome.clusterKeys?.[0];
        const clusteredTree = tree.clusteredVia !== undefined ? ctx.trees[tree.clusteredVia] : undefined;
        const holder = clusterKey && clusteredTree
            ? (resolveClustered(ctx.emit, clusteredTree, tree.clusteredVia, clusterKey, ctx.pool, ctx.locks) ?? outcome.pointer)
            : outcome.pointer;
        throw new UniqueViolation(name, spec.columns, values, holder);
    }
    ctx.emit(`No entry for ${key}, so the key is free and ${statement} goes on.`, {
        stage: 'execute',
        op: statement === 'INSERT' ? 'Insert' : 'Update',
        rowsProduced: 0,
    });
}
/** Every unique index of the table, checked for the row an `INSERT` is about to add. */
export function enforceUniqueOnInsert(ctx, row) {
    for (const spec of indexSpecsOf(ctx.table)) {
        if (spec.unique)
            checkKey(ctx, spec, keyValuesOf(row, spec.columns), 'INSERT');
    }
}
/** The one unique index `spec`, checked for the values an `UPDATE` is about to give a row (its old entry is already out of the tree). */
export function enforceUniqueOnUpdate(ctx, spec, values) {
    if (spec.unique)
        checkKey(ctx, spec, values, 'UPDATE');
}
/** What the row holding a taken key looks like, for the error's hint. */
export function holderOf(ctx, violation) {
    return rowAt(ctx, violation.holder);
}
