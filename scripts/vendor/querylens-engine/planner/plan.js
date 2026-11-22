/**
 * The logical plan. v0 keeps one representation rather than separate logical
 * and physical trees: the scan node carries its own access method, which is
 * what the optimizer actually chooses (plan.md §7.2–7.4).
 */
import { columnsOfIndex } from "../index/spec.js";
import { exprToSql } from "../parser/print.js";
import { walkExpr } from "../parser/index.js";
export function childOf(plan) {
    return plan.op === 'Filter' ||
        plan.op === 'Having' ||
        plan.op === 'HashDistinct' ||
        plan.op === 'SortDistinct' ||
        plan.op === 'HashAggregate' ||
        plan.op === 'SortAggregate' ||
        plan.op === 'Sort' ||
        plan.op === 'Project' ||
        plan.op === 'Limit'
        ? plan.child
        : undefined;
}
/**
 * The `Sort` node, wherever it sits in the chain — `runQuery.ts` needs to
 * know before the buffer pool exists, to reserve its spill's page ids. A Sort
 * only ever sits above any `Join` (whose `left`/`right` `childOf` does not
 * enter), so walking `childOf` from the root reaches it.
 */
export function findSort(plan) {
    let node = plan;
    while (node) {
        if (node.op === 'Sort')
            return node;
        node = childOf(node);
    }
    return null;
}
/**
 * The `SortAggregate` node, if the plan has one — it runs `externalMergeSort` internally to order its groups, so
 * `runQuery.ts` reserves it a spill block of its own, before ORDER BY's `Sort` (which runs after it, above it).
 */
export function findSortAggregate(plan) {
    let node = plan;
    while (node) {
        if (node.op === 'SortAggregate')
            return node;
        node = childOf(node);
    }
    return null;
}
/** Whether the plan has a `SortDistinct` — which reserves a spill block of its own, after every other sort's. */
export function findSortDistinct(plan) {
    let node = plan;
    while (node) {
        if (node.op === 'SortDistinct')
            return node;
        node = childOf(node);
    }
    return null;
}
/**
 * Every `Join` node in `plan`, in source order — the first `JOIN` clause first, the last (outermost in the tree,
 * plan.md §25.4 C3 slice b) last. `childOf` stops at a `Join` (it has `left`/`right`, not `child`), so finding more
 * than the outermost one means recursing into `left` on purpose: a left-deep chain's `right` side is always a base
 * table's own scan or probe, never itself a `Join`, so only `left` is ever worth walking further into. A `Sort` (plan.md
 * §26 Feature 1) always sits above the whole chain, so `findSort` finds it on the way down and this never meets it.
 */
export function joinsIn(plan) {
    let node = plan;
    while (node && node.op !== 'Join')
        node = childOf(node);
    if (!node)
        return [];
    return [...joinsIn(node.left), node];
}
/**
 * Every `Join` in the chain that runs the `sort-merge` algorithm — `runQuery.ts` needs these before the buffer pool
 * exists, to reserve scratch page ids for each one's own two internal sorts (each side its own `externalMergeSort`
 * call, plan.md §22.2).
 */
export function findSortMergeJoins(plan) {
    return joinsIn(plan).filter((j) => j.algorithm === 'sort-merge');
}
/**
 * Every `Join` in the chain that runs the `index-nested-loop` algorithm — `runQuery.ts` needs these before the
 * buffer pool exists, to build each one's own inner table's B+Tree (plan.md §25.4 B4) and give its pages ids of
 * their own.
 */
export function findIndexNestedLoopJoins(plan) {
    return joinsIn(plan).filter((j) => j.algorithm === 'index-nested-loop');
}
/* -------------------------------------------------------------------------- */
/* Predicate helpers                                                           */
/* -------------------------------------------------------------------------- */
/** Flattens an AND tree into its individual comparisons. */
export function conjuncts(expr) {
    return expr.kind === 'and'
        ? [...conjuncts(expr.left), ...conjuncts(expr.right)]
        : [expr];
}
/** Rebuilds a left-associative AND chain. Returns undefined for an empty list. */
export function conjoin(parts) {
    if (parts.length === 0)
        return undefined;
    return parts.reduce((left, right) => ({
        kind: 'and',
        left,
        right,
        span: { from: left.span.from, to: right.span.to },
    }));
}
/**
 * What every `IN (subquery)` in `where` resolved to (plan.md §25.4 C3 slice c) — `subquery.ts`'s
 * `resolveStatementSubqueries` already ran each one exactly once, before this plan was even built, and filled its
 * `items` with the real values found; this just says so, once, for the WHERE-clause narration (`emit.ts`,
 * `emitDelete.ts`, `emitUpdate.ts` all share it). Empty when `where` has none — the ordinary case, and the only
 * one before this slice existed at all.
 */
export function subqueryResolutionNotes(where) {
    const notes = [];
    walkExpr(where, (e) => {
        if (e.kind === 'in' && e.subquery) {
            const found = e.items.length === 0
                ? `finding no values at all — so \`${e.negated ? 'NOT IN' : 'IN'}\` is ${e.negated ? 'TRUE' : 'FALSE'} for every row, even one whose value is NULL`
                : `finding ${e.items.length} distinct value${e.items.length === 1 ? '' : 's'}`;
            notes.push(`its subquery \`SELECT ${e.subquery.column.name} FROM ${e.subquery.from.name}${e.subquery.where ? ' WHERE …' : ''}\` already ran once, before this plan was built, ${found}`);
        }
    });
    return notes;
}
/**
 * `col = literal` against the given column, in either operand order.
 *
 * A NULL literal is never a key: `col = NULL` is UNKNOWN for every row, so it
 * matches nothing whatever the index holds — and NULLs are not in the tree at
 * all (`buildIndex`). Returning `undefined` leaves the comparison where it
 * belongs, in the filter, which says UNKNOWN and rejects every row. (Found by
 * the SQLite oracle, plan.md §25.4 A1; the same rule guards `rangeOn`.)
 */
export function equalityOn(expr, column) {
    if (expr.kind !== 'compare' || expr.op !== '=')
        return undefined;
    if (expr.left.kind === 'column' && expr.left.name === column && expr.right.kind === 'literal') {
        return expr.right.value ?? undefined;
    }
    if (expr.right.kind === 'column' && expr.right.name === column && expr.left.kind === 'literal') {
        return expr.left.value ?? undefined;
    }
    return undefined;
}
const FLIPPED_COMPARE_OP = {
    '<': '>',
    '>': '<',
    '<=': '>=',
    '>=': '<=',
};
/**
 * `col OP literal` against the given column, for `OP` in `<`, `>`, `<=`,
 * `>=` — in either operand order, with the operator flipped when the column
 * is on the right (`30 < age` reads as `age > 30`). `rangeIndexSelection`'s
 * sibling to `equalityOn`, above.
 */
export function rangeOn(expr, column) {
    if (expr.kind !== 'compare' || expr.op === '=' || expr.op === '<>')
        return undefined;
    if (expr.left.kind === 'column' && expr.left.name === column && expr.right.kind === 'literal') {
        return expr.right.value === null ? undefined : { op: expr.op, value: expr.right.value };
    }
    if (expr.right.kind === 'column' && expr.right.name === column && expr.left.kind === 'literal') {
        return expr.left.value === null ? undefined : { op: FLIPPED_COMPARE_OP[expr.op], value: expr.left.value };
    }
    return undefined;
}
/** `age ≥ 30`, `age < 50`, or `age between 20 and 40` — an `IndexRangeScan`'s bounds, in words. */
export function formatRangeBounds(column, low, high) {
    if (low && high)
        return `\`${column}\` between ${format(low.value)} and ${format(high.value)}`;
    if (low)
        return `\`${column}\` ${low.inclusive ? '≥' : '>'} ${format(low.value)}`;
    if (high)
        return `\`${column}\` ${high.inclusive ? '≤' : '<'} ${format(high.value)}`;
    return `\`${column}\``;
}
/** The equality values an `IndexScan` / `IndexOnlyScan` looks up, in index-column order — one, unless the index is composite. */
export const lookupKeysOf = (plan) => plan.keys ?? [plan.key];
/** An index's name as it reads in a plan label: `id`, or `(lastName, firstName)` for a composite one. */
export const indexLabel = (name) => (columnsOfIndex(name).length > 1 ? `(${name})` : name);
/** `a = 1 AND b = 'x'` — the equalities a lookup on the index `name` makes, for as many leading columns as it has keys. */
export function lookupText(name, keys) {
    const columns = columnsOfIndex(name);
    return keys.map((value, i) => `${columns[i] ?? name} = ${format(value)}`).join(' AND ');
}
/** Re-exported: the printer lives beside the AST (`parser/print.ts`) so `selectItemKey` can use it. */
export { exprToSql } from "../parser/print.js";
/* -------------------------------------------------------------------------- */
/* Display conversion                                                          */
/* -------------------------------------------------------------------------- */
/**
 * `changed` holds the Plan objects a rewrite produced. Identity comparison is
 * exact — no id bookkeeping to drift — and lets the UI highlight precisely
 * what the rule touched.
 *
 * `estimates` is optional per-node cost (plan.md §22.2). When supplied, each
 * node carries `estRows` and the heuristic behind it; the pipeline always
 * passes it, callers that only want the tree shape can leave it out.
 */
export function toPlanDisplay(plan, changed = new Set(), estimates) {
    return convert(plan, 'p', changed, estimates);
}
/** A predicate over `column` for a range bound, as SQL — `age >= 30`. */
function boundSql(column, bound, side) {
    const op = side === 'low' ? (bound.inclusive ? '>=' : '>') : bound.inclusive ? '<=' : '<';
    return `${column} ${op} ${format(bound.value)}`;
}
/**
 * The relational-algebra reading of a plan node (plan.md §25.4 B5). Physical
 * choices vanish — a sequential scan with a filter and an index lookup both
 * become σ over the relation — which is exactly the point: the algebra says
 * *what* is computed, the plan tree says *how*.
 */
function raOf(plan) {
    switch (plan.op) {
        case 'SeqScan':
            return plan.filter
                ? { symbol: 'σ', sub: exprToSql(plan.filter), rel: plan.table }
                : { symbol: 'rel', rel: plan.table };
        case 'IndexProbe':
            // In algebra the inner side of a join is just the relation; *how* it is reached is the physical plan's business.
            return { symbol: 'rel', rel: plan.table };
        case 'IndexScan':
        case 'IndexOnlyScan': {
            const parts = [lookupText(plan.column, lookupKeysOf(plan))];
            if (plan.op === 'IndexScan' && plan.residual)
                parts.push(exprToSql(plan.residual));
            return { symbol: 'σ', sub: parts.join(' AND '), rel: plan.table };
        }
        case 'IndexRangeScan': {
            const rangeColumn = columnsOfIndex(plan.column)[plan.prefix?.length ?? 0] ?? plan.column;
            const parts = [
                ...(plan.prefix && plan.prefix.length > 0 ? [lookupText(plan.column, plan.prefix)] : []),
                ...(plan.low ? [boundSql(rangeColumn, plan.low, 'low')] : []),
                ...(plan.high ? [boundSql(rangeColumn, plan.high, 'high')] : []),
                ...(plan.residual ? [exprToSql(plan.residual)] : []),
            ];
            return { symbol: 'σ', sub: parts.join(' AND '), rel: plan.table };
        }
        case 'Filter':
        case 'Having':
            return { symbol: 'σ', sub: exprToSql(plan.predicate) };
        case 'Join':
            return { symbol: '⋈', sub: `${plan.leftTable}.${plan.leftColumn} = ${plan.rightTable}.${plan.rightColumn}` };
        case 'HashAggregate':
        case 'SortAggregate': {
            const keys = plan.aggregates.map((a) => a.key).join(', ');
            return { symbol: 'γ', sub: plan.groupBy.length > 0 ? `${plan.groupBy.join(', ')}; ${keys}` : keys };
        }
        case 'Sort':
            return { symbol: 'τ', sub: `${plan.column} ${plan.direction === 'asc' ? '↑' : '↓'}` };
        case 'Project':
            return {
                symbol: 'π',
                sub: plan.columns.kind === 'star'
                    ? '*'
                    : plan.columns.kind === 'columns'
                        ? plan.columns.names.join(', ')
                        : plan.columns.items.map((i) => i.sql).join(', '),
            };
        case 'HashDistinct':
        case 'SortDistinct':
            return { symbol: 'δ' };
        case 'Limit':
            return { symbol: 'λ', sub: plan.offset ? `${String(plan.count)}, offset ${String(plan.offset)}` : String(plan.count) };
    }
}
function convert(plan, id, changed, estimates) {
    return { ...convertBody(plan, id, changed, estimates), ra: raOf(plan) };
}
function convertBody(plan, id, changed, estimates) {
    const highlight = changed.has(plan);
    const kid = (child) => [convert(child, `${id}.0`, changed, estimates)];
    const estimate = estimates?.get(plan);
    const cost = estimate
        ? { estRows: estimate.estRows, estBasis: estimate.basis }
        : {};
    switch (plan.op) {
        case 'SeqScan':
            return {
                id,
                op: 'SeqScan',
                label: `SeqScan ${plan.table}`,
                ...(plan.filter ? { detail: `filter: ${exprToSql(plan.filter)}` } : {}),
                table: plan.table,
                ...(highlight ? { highlight } : {}),
                ...cost,
            };
        case 'Join':
            return {
                id,
                op: 'Join',
                label: `Join (${plan.algorithm}) ${plan.leftTable} × ${plan.rightTable}`,
                detail: `on: ${plan.leftTable}.${plan.leftColumn} = ${plan.rightTable}.${plan.rightColumn}`,
                // `rightTable` is the table this specific `Join` step introduces — unique across a chain, since the parser
                // never allows a query to name the same table twice (plan.md §25.4 C3 slice b) — so it is what disambiguates
                // this node from another `Join` in the same chain for EXPLAIN ANALYZE's actual-row lookup (see `table`'s
                // own doc comment on `PlanNode`), the same way `plan.table` does for a scan below.
                table: plan.rightTable,
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: [
                    convert(plan.left, `${id}.0`, changed, estimates),
                    convert(plan.right, `${id}.1`, changed, estimates),
                ],
            };
        case 'IndexProbe':
            return {
                id,
                op: 'IndexProbe',
                label: `IndexProbe ${plan.table}.${indexLabel(plan.column)}`,
                detail: `key: ${plan.column} = ${plan.outerTable}.${plan.outerColumn} — once per ${plan.outerTable} row`,
                ...(highlight ? { highlight } : {}),
                ...cost,
            };
        case 'IndexScan':
            return {
                id,
                op: 'IndexScan',
                label: `IndexScan ${plan.table}.${indexLabel(plan.column)}`,
                detail: plan.residual
                    ? `key: ${lookupText(plan.column, lookupKeysOf(plan))} · recheck: ${exprToSql(plan.residual)}`
                    : `key: ${lookupText(plan.column, lookupKeysOf(plan))}`,
                table: plan.table,
                ...(highlight ? { highlight } : {}),
                ...cost,
            };
        case 'IndexOnlyScan':
            return {
                id,
                op: 'IndexOnlyScan',
                label: `IndexOnlyScan ${plan.table}.${indexLabel(plan.column)}`,
                detail: `key: ${lookupText(plan.column, lookupKeysOf(plan))} · never touches the heap`,
                table: plan.table,
                ...(highlight ? { highlight } : {}),
                ...cost,
            };
        case 'IndexRangeScan':
            return {
                id,
                op: 'IndexRangeScan',
                label: `IndexRangeScan ${plan.table}.${indexLabel(plan.column)}`,
                detail: (() => {
                    const rangeColumn = columnsOfIndex(plan.column)[plan.prefix?.length ?? 0] ?? plan.column;
                    const within = plan.prefix && plan.prefix.length > 0 ? `${lookupText(plan.column, plan.prefix)}, ` : '';
                    const range = `range: ${within}${formatRangeBounds(rangeColumn, plan.low, plan.high)}`;
                    return plan.residual ? `${range} · recheck: ${exprToSql(plan.residual)}` : range;
                })(),
                table: plan.table,
                ...(highlight ? { highlight } : {}),
                ...cost,
            };
        case 'Filter':
            return {
                id,
                op: 'Filter',
                label: 'Filter',
                detail: exprToSql(plan.predicate),
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'Having':
            return {
                id,
                op: 'Having',
                label: 'Having',
                detail: exprToSql(plan.predicate),
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'HashAggregate':
        case 'SortAggregate':
            return {
                id,
                op: plan.op,
                label: plan.op,
                detail: plan.groupBy.length > 0
                    ? `GROUP BY ${plan.groupBy.join(', ')}${plan.aggregates.length > 0 ? `; ${plan.aggregates.map((a) => a.key).join(', ')}` : ''}`
                    : plan.aggregates.map((a) => a.key).join(', '),
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'Sort':
            return {
                id,
                op: 'Sort',
                label: 'Sort',
                detail: `${plan.column} ${plan.direction === 'asc' ? 'ASC' : 'DESC'}`,
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'Project':
            return {
                id,
                op: 'Project',
                label: 'Project',
                detail: plan.columns.kind === 'star'
                    ? '*'
                    : plan.columns.kind === 'columns'
                        ? plan.columns.names.join(', ')
                        : plan.columns.items.map((i) => i.sql).join(', '),
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'HashDistinct':
        case 'SortDistinct':
            return {
                id,
                op: plan.op,
                label: plan.op,
                detail: plan.op === 'SortDistinct' && plan.sortKey ? `DISTINCT, sorted by ${plan.sortKey.column} ${plan.sortKey.direction.toUpperCase()}` : 'DISTINCT',
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
        case 'Limit':
            return {
                id,
                op: 'Limit',
                label: `Limit ${String(plan.count)}`,
                ...(plan.offset ? { detail: `offset ${String(plan.offset)}` } : {}),
                ...(highlight ? { highlight } : {}),
                ...cost,
                children: kid(plan.child),
            };
    }
}
function format(value) {
    if (value === null)
        return 'NULL';
    return typeof value === 'string' ? `'${value}'` : String(value);
}
