import { buildUpdatePlan } from "./buildPlan.js";
import { estimatePlan } from "./cost.js";
import { optimize, WRITE_PATH_RULES } from "./optimize.js";
import { exprToSql, subqueryResolutionNotes, toPlanDisplay } from "./plan.js";
/** Strips the throwaway `Project *` wrapper `emitUpdatePlanEvents` builds around an update's scan. */
function unwrap(plan) {
    return plan.op === 'Project' ? plan.child : plan;
}
/**
 * Emits the plan/optimize stages for an `UPDATE`, and returns the final
 * access plan (`SeqScan` or `IndexScan`) the executor uses to find the rows
 * to modify — the mirror of `emitDeletePlanEvents`, since only the WHERE
 * clause is planned; the SET clause has nothing for a plan or an optimizer
 * rule to act on. Uses `WRITE_PATH_RULES` for the same reason
 * `emitDeletePlanEvents` does — see its own doc comment.
 */
export function emitUpdatePlanEvents(emit, ast, table, rowsPerPage) {
    const display = (plan, changed) => toPlanDisplay(unwrap(plan), changed, estimatePlan(unwrap(plan), table, rowsPerPage));
    const scan = { op: 'SeqScan', table: ast.table.name };
    emit(`Start at the bottom: every plan begins by reading a table, so the base of the tree is a sequential scan of \`${ast.table.name}\`.`, { stage: 'plan', planTree: display(scan) });
    let current = scan;
    if (ast.where) {
        current = { op: 'Filter', predicate: ast.where, child: current };
        const subqueryNotes = subqueryResolutionNotes(ast.where);
        emit(`The WHERE clause becomes a Filter sitting above the scan: \`${exprToSql(ast.where)}\` — the rows it passes are the rows UPDATE modifies.${subqueryNotes.length > 0 ? ` ${subqueryNotes.map((n) => `${n[0].toUpperCase()}${n.slice(1)}.`).join(' ')}` : ''}`, { stage: 'plan', planTree: display(current) });
    }
    const canonical = buildUpdatePlan(ast);
    const wrapped = { op: 'Project', columns: { kind: 'star' }, child: canonical };
    let optimisedWrapped = wrapped;
    let before = wrapped;
    for (const step of optimize(wrapped, table, rowsPerPage, {}, WRITE_PATH_RULES)) {
        emit(step.label, {
            stage: 'optimize',
            rule: step.rule,
            before: display(before),
            after: display(step.plan, step.changed),
            ...(step.whyNot ? { whyNot: step.whyNot } : {}),
        }, step.prompt ? { predictable: step.prompt } : undefined);
        before = step.plan;
        optimisedWrapped = step.plan;
    }
    if (optimisedWrapped === wrapped) {
        emit('No rewrite rule fires on this plan — the optimizer leaves it exactly as written.', {
            stage: 'optimize',
            rule: 'none',
            before: display(wrapped),
            after: display(wrapped),
        });
    }
    return unwrap(optimisedWrapped);
}
