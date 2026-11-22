import { aggregateKeyOf, exprToSql } from "./print.js";
export { aggregateKeyOf } from "./print.js";
/** A qualified reference's row key — `authors.id` — or the bare name when unqualified. */
export function columnKey(ref) {
    return ref.table ? `${ref.table}.${ref.name}` : ref.name;
}
/** The row key an aggregate reads, or `null` for `COUNT(*)`. */
export function selectItemArgColumn(item) {
    return item.arg.kind === 'star' ? null : columnKey(item.arg);
}
/** Canonical display key for a SELECT item — its own name, or e.g. `COUNT(*)`, `SUM(age)`. */
export function selectItemKey(item) {
    if (item.kind === 'column')
        return columnKey(item);
    if (item.kind === 'expression')
        return item.alias ?? exprToSql(item.expr);
    return aggregateKeyOf(item.fn, item.arg);
}
/** The direct sub-expressions of a node, in source order. */
export function childrenOf(expr) {
    switch (expr.kind) {
        case 'column':
        case 'literal':
        case 'aggregate':
            return [];
        case 'compare':
        case 'and':
        case 'or':
        case 'arith':
            return [expr.left, expr.right];
        case 'not':
        case 'isNull':
        case 'neg':
            return [expr.operand];
        case 'in':
            return [expr.operand, ...expr.items];
        case 'like':
            return [expr.operand, expr.pattern];
    }
}
/** `expr` with `f` applied to each direct sub-expression — the rebuild half of `childrenOf`. */
export function mapChildren(expr, f) {
    switch (expr.kind) {
        case 'column':
        case 'literal':
        case 'aggregate':
            return expr;
        case 'compare':
        case 'and':
        case 'or':
        case 'arith':
            return { ...expr, left: f(expr.left), right: f(expr.right) };
        case 'not':
        case 'isNull':
        case 'neg':
            return { ...expr, operand: f(expr.operand) };
        case 'in':
            return { ...expr, operand: f(expr.operand), items: expr.items.map(f) };
        case 'like':
            return { ...expr, operand: f(expr.operand), pattern: f(expr.pattern) };
    }
}
/** Depth-first walk, parents before children. */
export function walkExpr(expr, visit) {
    visit(expr);
    for (const child of childrenOf(expr))
        walkExpr(child, visit);
}
/** Every column name referenced anywhere in a predicate. */
export function columnsIn(expr) {
    const names = [];
    walkExpr(expr, (e) => {
        if (e.kind === 'column')
            names.push(e.name);
    });
    return names;
}
