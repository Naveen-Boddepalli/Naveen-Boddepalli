import { node, valuesOf } from "./btree.js";
function formatValue(value) {
    if (value === null)
        return 'NULL';
    return typeof value === 'string' ? `'${value}'` : String(value);
}
/** A key as the tree draws it: a table index's entry shows its value(s) — the row address it also carries is not drawn. */
function formatKey(key) {
    const values = valuesOf(key);
    return values.length === 1 ? formatValue(values[0]) : `(${values.map(formatValue).join(', ')})`;
}
/** An index key as the write narration says it: `2`, `'ada'`, or `(2, 'ada')` for a composite index's. */
export function keyText(values) {
    return values.length === 1 ? JSON.stringify(values[0]) : `(${values.map((v) => JSON.stringify(v)).join(', ')})`;
}
export function keyList(keys) {
    return keys.length === 0 ? '·' : keys.map(formatKey).join(' ');
}
/** The whole tree, as the UI draws it. */
export function toIndexDisplay(tree, id = tree.rootId) {
    const n = node(tree, id);
    if (n.kind === 'leaf') {
        return {
            id: n.id,
            kind: 'leaf',
            label: keyList(n.keys),
            pageId: n.pageId,
            ...(n.next === null ? {} : { next: n.next }),
        };
    }
    return {
        id: n.id,
        kind: 'internal',
        label: keyList(n.keys),
        pageId: n.pageId,
        children: n.children.map((childId) => toIndexDisplay(tree, childId)),
    };
}
