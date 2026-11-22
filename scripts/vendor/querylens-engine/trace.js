/**
 * Trace buffer: an `emit` callback threaded down into every operator. The
 * query runs to completion and the array is returned. Simplest thing that
 * works, and it works because playback is pre-computed anyway (plan.md §7.8).
 */
export function createTracer() {
    const events = [];
    const emit = (label, body, options) => {
        const event = { ...body, id: events.length, label };
        if (options?.predictable)
            event.predictable = options.predictable;
        if (options?.dwell !== undefined)
            event.dwell = options.dwell;
        events.push(event);
    };
    return { emit, drain: () => events.slice() };
}
