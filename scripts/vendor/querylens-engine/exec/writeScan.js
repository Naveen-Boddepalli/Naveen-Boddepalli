/**
 * How a `DELETE` or `UPDATE` finds its rows through an index (plan.md §22.2's write path; ranges since §25.4 B3b).
 *
 * A write cannot stream: it has to find *every* match before it changes anything, or a change mid-scan could shift what
 * a later step reads (an `UPDATE` that moves a row's key would find it again). So each of these walks the index to
 * the end, takes an exclusive lock on the heap page of every row it will touch, marks that page dirty, and hands back
 * the rows with their addresses — the address is what lets the executor drop and re-add exactly *that* row's index entry.
 * `exec/delete.ts` and `exec/update.ts` share them, and differ only in the verb the narration uses.
 */
import { lookupKeysOf } from "../planner/index.js";
import { fetchHeapPage, rangeHolds, rowAt } from "./operators.js";
import { passes } from "./evaluate.js";
import { emitIndexLookup, emitRangeStart, nextInRange, resolveClustered } from "../index/index.js";
/** Takes the exclusive lock a write needs on the row's heap page, marks it dirty, and narrates the find. */
function claim(ctx, match, verb, op, found, of) {
    ctx.locks.acquire(match.pointer.pageId, 'exclusive', `Upgrade to an exclusive lock on heap page ${String(match.pointer.pageId)} — ${verb.name} is about to ${verb.does} the row it holds.`);
    ctx.pool.markDirty(match.pointer.pageId);
    ctx.emit(of, { stage: 'execute', op, rowsProduced: found });
    ctx.locks.release(match.pointer.pageId, 'exclusive');
}
const rejected = (ctx, verb, op, found) => {
    ctx.emit(`The row the index found fails the rest of the predicate, so ${verb.name} leaves it alone.`, {
        stage: 'execute',
        op,
        rowsProduced: found,
    });
};
/** Every row an equality lookup points at that passes any residual predicate — one, or one per index entry. */
export function indexLookupMatches(ctx, plan, verb) {
    const tree = ctx.trees[plan.column];
    if (!tree)
        return [];
    const outcome = emitIndexLookup(ctx.emit, tree, lookupKeysOf(plan), ctx.pool, plan.column, ctx.locks);
    const { pointers, clusterKeys } = outcome;
    const clusteredTree = tree.clusteredVia !== undefined ? ctx.trees[tree.clusteredVia] : undefined;
    const matched = [];
    pointers.forEach((pointer, at) => {
        // A clustered table's secondary entry has no address (plan.md §25.4 B3e): every match costs a real second
        // descent, through the clustered index. Otherwise the lookup already fetched the first match's page, and the
        // rest are read now, as their rows are examined.
        const clusterKey = clusterKeys?.[at];
        const real = clusterKey && clusteredTree ? resolveClustered(ctx.emit, clusteredTree, tree.clusteredVia, clusterKey, ctx.pool, ctx.locks) : pointer;
        if (!real)
            return;
        if (!clusterKey && at > 0)
            fetchHeapPage(ctx, pointer);
        const row = rowAt(ctx, real);
        if (!row)
            return;
        if (!passes(plan.residual, row)) {
            rejected(ctx, verb, 'IndexScan', matched.length);
            return;
        }
        matched.push({ row, pointer: real });
        claim(ctx, { row, pointer: real }, verb, 'IndexScan', matched.length, pointers.length === 1
            ? `IndexScan finds the one row ${verb.name} will ${verb.does}.`
            : `IndexScan finds a row ${verb.name} will ${verb.does} — ${String(matched.length)} so far, of ${String(pointers.length)} entries for this value.`);
    });
    return matched;
}
/** Every row a range walk of the index reaches that passes the range and any residual predicate. */
export function indexRangeMatches(ctx, plan, verb) {
    const tree = ctx.trees[plan.column];
    if (!tree)
        return [];
    const start = emitRangeStart(ctx.emit, tree, plan.column, plan.low, ctx.pool, ctx.locks, plan.prefix);
    let leafId = start.leafId;
    let index = start.startIndex;
    const matched = [];
    while (leafId !== null) {
        const found = nextInRange(ctx.emit, tree, leafId, index, plan.high, { pool: ctx.pool, locks: ctx.locks }, plan.prefix);
        if (!found)
            break;
        leafId = found.leafId;
        index = found.nextIndex;
        fetchHeapPage(ctx, found.pointer);
        const row = rowAt(ctx, found.pointer);
        if (!row || !rangeHolds(row, plan))
            continue;
        if (!passes(plan.residual, row)) {
            rejected(ctx, verb, 'IndexRangeScan', matched.length);
            continue;
        }
        matched.push({ row, pointer: found.pointer });
        claim(ctx, { row, pointer: found.pointer }, verb, 'IndexRangeScan', matched.length, `IndexRangeScan finds a row ${verb.name} will ${verb.does} via leaf ${found.leafId} — ${String(matched.length)} so far.`);
    }
    return matched;
}
