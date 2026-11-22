import { resultPrompt } from "../predict.js";
import { rootEstimate } from "../planner/cost.js";
import { buildOperator } from "./operators.js";
/** Pulls the operator tree to exhaustion and emits the result. */
export function execute(plan, ctx) {
    const root = buildOperator(plan, ctx);
    const rows = [];
    root.open();
    for (;;) {
        const row = root.next();
        if (!row)
            break;
        rows.push(row);
    }
    root.close();
    // A disk read is a miss or a page read ahead of the request: both are I/O the query paid for.
    const { hits, evictions } = ctx.pool.stats;
    const misses = ctx.pool.stats.misses + ctx.pool.stats.prefetches;
    // Every table this query names, including `ctx.table` itself — a chain's own cost-model recursion (plan.md
    // §25.4 C3 slice b) needs to resolve it by name again once it reaches the bottom of the chain, not just at the
    // top (see emit.ts's identical build for the fuller explanation).
    const otherTables = ctx.joinPartners
        ? {
            ...Object.fromEntries(Object.entries(ctx.joinPartners).map(([name, partner]) => [name, partner.table])),
            [ctx.table.name]: ctx.table,
        }
        : undefined;
    const estimate = rootEstimate(plan, ctx.table, ctx.options.rowsPerPage, otherTables);
    const reconcile = estimate.estRows === rows.length
        ? ` The cost model guessed ~${estimate.estRows} — on the nose (${estimate.basis}).`
        : ` The cost model guessed ~${estimate.estRows} (${estimate.basis}); the count is exact, the estimate is a heuristic.`;
    ctx.emit(`${rows.length} row${rows.length === 1 ? '' : 's'} returned, from ${misses} disk read${misses === 1 ? '' : 's'}, ${hits} buffer hit${hits === 1 ? '' : 's'} and ${evictions} eviction${evictions === 1 ? '' : 's'}.${reconcile}`, { stage: 'result', rows }, (() => {
        const prompt = resultPrompt(rows.length, ctx.table.rows.length);
        return prompt ? { predictable: prompt } : undefined;
    })());
    return rows;
}
