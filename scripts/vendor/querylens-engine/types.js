/**
 * The single contract between the engine and the UI.
 *
 * Rules for everything in `src/engine`:
 *   - pure and synchronous (no DOM, no React, no async, no I/O)
 *   - every value here must be structurally cloneable, so the engine stays
 *     worker-ready even though v0 runs it on the main thread
 */
export const STAGES = [
    'parse',
    'plan',
    'optimize',
    'execute',
    'buffer',
    'index',
    'lock',
    'result',
];
/** Display order for policy pickers — here rather than beside the policies, so UI code can import it without the engine. */
export const REPLACEMENT_POLICY_NAMES = [
    'lru',
    'clock',
    'fifo',
    'second-chance',
    'optimal',
    'midpoint',
    'lru-k',
    'two-q',
];
/** Short label for each policy, for `<select>`s and column headers. */
export const REPLACEMENT_POLICY_LABELS = {
    lru: 'LRU',
    clock: 'Clock sweep',
    fifo: 'FIFO',
    'second-chance': 'Second-chance',
    optimal: 'Optimal (Bélády)',
    midpoint: 'Midpoint LRU (InnoDB)',
    'lru-k': 'LRU-2 (scan-resistant)',
    'two-q': '2Q (scan-resistant)',
};
/** Whether `value` names a policy — for anything read from a URL, a stored preference or a file. */
export function isReplacementPolicyName(value) {
    return typeof value === 'string' && REPLACEMENT_POLICY_NAMES.includes(value);
}
export const DEFAULT_ENGINE_OPTIONS = {
    bufferFrames: 8,
    rowsPerPage: 4,
    policy: 'lru',
};
/**
 * The stages this build of the engine actually executes. Everything else in
 * `STAGES` is scaffolding the UI must show as unbuilt — plan.md §2 makes
 * honesty about ground truth a top-line goal, and a pipeline that looks
 * complete when it is not breaks that. Grows one milestone at a time.
 */
export const IMPLEMENTED_STAGES = [
    'parse',
    'plan',
    'optimize',
    'buffer',
    'index',
    'execute',
    'lock',
    'result',
];
