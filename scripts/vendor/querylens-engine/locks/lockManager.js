/**
 * Page-level locking, visual only (plan.md §7.7).
 *
 * What this models honestly: which pages a query holds a read lock on, and for
 * how long. What it does NOT model: contention. v0 runs exactly one query, so
 * no lock ever waits on another. The panel says so rather than implying that a
 * lock icon means something is being protected from a rival.
 *
 * Real engines also distinguish a short *latch* on the buffer frame from a
 * transaction-length *lock* on the data. We collapse the two into one
 * page-level read lock held for the duration of the read.
 */
function key(pageId, mode) {
    return `${String(pageId)}:${mode}`;
}
export function createLockManager(emit) {
    const holding = new Map();
    const stats = { acquired: 0, released: 0, maxHeldAtOnce: 0 };
    return {
        acquire(pageId, mode, why) {
            const id = key(pageId, mode);
            // Re-entrant on the same page and mode: one query cannot conflict with
            // itself, so this is a no-op rather than a second lock.
            if (holding.has(id))
                return;
            holding.set(id, { pageId, mode });
            stats.acquired += 1;
            stats.maxHeldAtOnce = Math.max(stats.maxHeldAtOnce, holding.size);
            emit(why, { stage: 'lock', action: 'acquire', pageId, mode });
        },
        release(pageId, mode, why) {
            const id = key(pageId, mode);
            if (!holding.delete(id))
                return;
            stats.released += 1;
            emit(why ?? `Release the ${mode} lock on page ${String(pageId)}.`, {
                stage: 'lock',
                action: 'release',
                pageId,
                mode,
            });
        },
        held: () => [...holding.values()],
        stats,
    };
}
