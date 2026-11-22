/**
 * The buffer pool: a fixed set of frames standing between the executor and
 * "disk". Every page the engine reads goes through `fetch`, which is the only
 * place a disk read can happen — so the hit/miss numbers in the UI are exactly
 * the ones the engine experienced.
 */
import { policyFor } from "./policy.js";
import { evictionPrompt } from "../predict.js";
/** Playback pacing weight — a disk read should *feel* slower than a hit. */
export const DISK_READ_DWELL = 2.5;
/**
 * PostgreSQL's rule for when a scan goes through a ring: only a scan bigger than a quarter of the pool does. A smaller
 * one is worth caching whole, and a ring would only throw its pages away and read them again on a rescan. Shared by
 * the executor's `SeqScan` and by a marked scan in a bare reference string, so the two cannot disagree.
 */
export function scanUsesRing(pages, options) {
    return (options.scanRing ?? 0) > 0 && pages > Math.floor(options.bufferFrames / 4);
}
function emptyState(frameCount) {
    return {
        frames: Array.from({ length: frameCount }, (_, frameId) => ({
            frameId,
            pageId: null,
            usageCount: 0,
            pinCount: 0,
            lastUsedAt: -1,
            loadedAt: -1,
        })),
        now: 0,
        hand: 0,
        lookaheadCursor: 0,
    };
}
/** How the `evict` event narrates the choice, per policy. */
function evictionReason(policy) {
    switch (policy) {
        case 'lru':
            return 'LRU picked it because it was used least recently.';
        case 'clock':
            return 'Clock sweep picked it because the hand reached it with a usage count of zero.';
        case 'fifo':
            return 'FIFO picked it because it has been resident longest — first in, first out, however much it was used.';
        case 'second-chance':
            return 'Second-chance picked it: the oldest frame whose reference bit was already clear.';
        case 'optimal':
            return "The optimal policy picked it because its next use is farthest away — the choice no real policy can make, since it needs the future.";
        case 'midpoint':
            return 'Midpoint LRU picked the least-recently-used page in the old sublist — a page read once and never touched again, which is exactly what it is built to evict first.';
        case 'two-q':
            return '2Q picked it: the oldest page in the small queue of pages read only once, which is where a one-pass scan leaves its pages.';
        case 'lru-k':
            return 'LRU-2 picked it because its second-most-recent reference is the oldest — a page touched only once has no second reference at all, so it goes first.';
    }
}
/** How the `evict` event narrates a frame a scan reused from its own ring, whichever policy runs the pool. */
function ringReason(size) {
    return `The scan reads through a ring of ${size} frames, so it reused its own oldest page rather than ask the policy for a victim — a long scan can then pass through without flushing the pages everything else is using.`;
}
/**
 * `pageCount` covers every page in the database — heap pages first, then index
 * pages. The pool manages frames, not contents: what a page *holds* is the
 * caller's business, which is why heap and index pages can share one pool and
 * compete for the same frames.
 */
export function createBufferPool(pageCount, options, emit, 
/**
 * The full page-reference string, when the caller has one: `runBufferTrace` is handed it, and `runQuery`
 * records it for the `optimal` policy by running the query once first (plan.md §26 Feature 2) — a query's
 * page reads come from its plan, so they are the same under any policy. Only `optimal` reads it.
 */
lookahead, 
/**
 * Where `lookahead` came from. A sandbox's reference string is all one page space, so read-ahead may follow it
 * anywhere; a query's is only its record of demand reads, and read-ahead stays inside a scan's own pages there.
 */
lookaheadFrom = 'reference-string') {
    const state = emptyState(options.bufferFrames);
    if (lookahead !== undefined)
        state.lookahead = lookahead;
    const policy = policyFor(options.policy);
    const stats = { hits: 0, misses: 0, evictions: 0, writes: 0, prefetches: 0 };
    // Which access `fetch` is resolving, so `optimal` can look past it. Advances
    // once per successful `fetch`, staying aligned with the reference index.
    let accessIndex = -1;
    // Only the first eviction asks. After that the learner has the rule, and a
    // prompt on every one of them would be nagging rather than teaching.
    let evictionAsked = false;
    // Pages a DELETE (or a future write) has modified since they were read —
    // resident or not, since a page can be marked dirty and evicted later in
    // the same query. Cleared once the writeback happens.
    const dirty = new Set();
    // The page the last `fetch` asked for: a request for the page after it is a sequential scan, which read-ahead follows.
    let lastDemand = null;
    const resident = (pageId) => state.frames.find((f) => f.pageId === pageId);
    /**
     * A free frame, or the policy's eviction victim — shared between a disk
     * read's miss and a fresh write, since both need "a frame for this page"
     * and both may have to evict for it under the same policy. `incoming` is
     * narration only: what the emitted `evict` event says is displacing the
     * victim.
     */
    function claimFrame(incoming, forWrite) {
        const free = state.frames.find((f) => f.pageId === null);
        if (free)
            return free;
        const choice = policy.selectVictim(state, emit);
        if (choice === null)
            return null; // every frame pinned
        const victim = state.frames.find((f) => f.frameId === choice.frameId);
        return evictFrame(victim, incoming, forWrite, choice.clockHand === undefined ? {} : { clockHand: choice.clockHand });
    }
    /**
     * Empties `victim` to make room for `incoming`: counts the eviction, pays a dirty page's writeback and narrates it.
     * Shared by the two ways a victim is found — the policy's choice, and a scan reusing its own ring frame — so both
     * are accounted for identically.
     */
    function evictFrame(victim, incoming, forWrite, how) {
        const victimId = victim.frameId;
        const evicted = victim.pageId;
        stats.evictions += 1;
        // A clean page's eviction is free — the disk already holds the same
        // bytes. A dirty one costs a write first, charged and narrated here,
        // at the moment it is actually paid, not when the page was marked.
        const writtenBack = dirty.delete(evicted);
        if (writtenBack)
            stats.writes += 1;
        // The eviction question is asked once regardless of which path triggers
        // it — a write can just as easily be the first eviction a trace shows. A
        // ring's reuse is not asked about: it is the ring's rule, not a choice the
        // policy made, and it must not use up the one question the policy deserves.
        const asks = how.ring === undefined && !evictionAsked;
        const prompt = asks ? evictionPrompt(state.frames, victimId, incoming, options.policy) : null;
        if (how.ring === undefined)
            evictionAsked = true;
        emit(`The pool is full, so page ${evicted} is evicted from frame ${victimId} to make room${forWrite ? ' for a freshly written page' : ''}. ${writtenBack
            ? `Page ${evicted} is dirty — a row was deleted from it — so evicting it costs a write back to disk first. `
            : ''}${how.ring ? ringReason(how.ring.size) : evictionReason(options.policy)}`, {
            stage: 'buffer',
            action: 'evict',
            frameId: victimId,
            victimPageId: evicted,
            pageId: incoming,
            ...(how.clockHand === undefined ? {} : { clockHand: how.clockHand }),
            ...(writtenBack ? { writtenBack } : {}),
            ...(how.ring ? { ring: true } : {}),
        }, prompt ? { predictable: prompt } : undefined);
        victim.pageId = null;
        victim.usageCount = 0;
        victim.loadedAt = -1;
        return victim;
    }
    /**
     * A frame for a page a scan is reading through its ring. The scan cycles through `ring.size` slots in order: a slot
     * not yet filled takes a frame the ordinary way (a free one, else the policy's victim), and a filled slot is reused
     * outright — the scan evicts its own oldest page, not one the policy would have chosen. A slot whose frame is pinned,
     * or has since been given to another page, is not the scan's to reuse and is refilled the ordinary way.
     */
    function claimRingFrame(ring, incoming) {
        const slot = ring.cursor % ring.size;
        ring.cursor += 1;
        const frameId = ring.frames[slot];
        if (frameId !== null && frameId !== undefined) {
            const frame = state.frames.find((f) => f.frameId === frameId);
            if (frame.pageId !== null && frame.pageId === ring.pages[slot] && frame.pinCount === 0) {
                ring.pages[slot] = incoming;
                return evictFrame(frame, incoming, false, { ring });
            }
        }
        const target = claimFrame(incoming, false);
        if (target) {
            ring.frames[slot] = target.frameId;
            ring.pages[slot] = incoming;
        }
        return target;
    }
    /** A frame for a page about to be read: through the scan's ring when it has one, else by the policy alone. */
    function claimForRead(incoming, ring) {
        return ring?.active ? claimRingFrame(ring, incoming) : claimFrame(incoming, false);
    }
    function beginScan(size) {
        const slots = Math.max(1, Math.min(Number.isInteger(size) && size > 0 ? size : 1, state.frames.length));
        return {
            size: slots,
            frames: Array.from({ length: slots }, () => null),
            pages: Array.from({ length: slots }, () => null),
            cursor: 0,
            active: true,
        };
    }
    function endScan(ring) {
        ring.active = false;
    }
    function markDirty(pageId) {
        if (Number.isInteger(pageId) && pageId >= 0 && pageId < pageCount)
            dirty.add(pageId);
    }
    /**
     * Reads the pages after `pageId` that a sequential scan will ask for next, before it asks: each is a real disk read, so
     * it claims a frame the same way a miss does, and is recorded as `prefetch`. Pages already resident are skipped.
     */
    function readAheadFrom(pageId, ring, until) {
        // A scan's read-ahead stays inside its ring, and leaves one slot for the page it is reading: the pages read early
        // go where the scan's own pages go, instead of to whichever frames the policy would have given up.
        const requested = options.readAhead ?? 0;
        const depth = ring?.active ? Math.min(requested, ring.size - 1) : requested;
        const end = Math.min(pageCount, until ?? pageCount);
        for (let next = pageId + 1; next <= pageId + depth && next < end; next++) {
            if (resident(next))
                continue;
            const target = claimForRead(next, ring);
            if (!target)
                return;
            stats.prefetches += 1;
            state.now += 1;
            target.pageId = next;
            target.usageCount = 0;
            target.loadedAt = state.now;
            (policy.onLoad ?? policy.onAccess)(state, target.frameId);
            emit(`Read page ${next} from disk into frame ${target.frameId} ahead of the scan. Nothing has asked for it yet, but the scan is sequential, so the pool reads it early — and the request, when it comes, is a hit.`, { stage: 'buffer', action: 'prefetch', pageId: next, frameId: target.frameId }, { dwell: DISK_READ_DWELL });
        }
    }
    function fetch(pageId, ring, until) {
        if (!Number.isInteger(pageId) || pageId < 0 || pageId >= pageCount)
            return null;
        accessIndex += 1;
        state.lookaheadCursor = accessIndex;
        const sequential = lastDemand !== null && pageId === lastDemand + 1;
        lastDemand = pageId;
        const result = resolve(pageId, ring);
        // A reference string (`lookahead` given) is all one page space and reads ahead through it; a query reads ahead only
        // for a scan that has said where its pages end, or it would prefetch the index pages that follow the heap's.
        const mayReadAhead = (lookahead !== undefined && lookaheadFrom === 'reference-string') || until !== undefined;
        if (result && sequential && mayReadAhead)
            readAheadFrom(pageId, ring, until);
        return result;
    }
    function resolve(pageId, ring) {
        const hitFrame = resident(pageId);
        if (hitFrame) {
            stats.hits += 1;
            hitFrame.pinCount += 1;
            policy.onAccess(state, hitFrame.frameId);
            emit(`Page ${pageId} is already in frame ${hitFrame.frameId} — a buffer hit. No disk read.`, { stage: 'buffer', action: 'hit', pageId, frameId: hitFrame.frameId });
            return { frameId: hitFrame.frameId, hit: true };
        }
        stats.misses += 1;
        emit(`Page ${pageId} is not in the pool — a buffer miss.`, {
            stage: 'buffer',
            action: 'miss',
            pageId,
        });
        const target = claimForRead(pageId, ring);
        if (!target)
            return null;
        // Bump the clock on every load, not only in `onAccess` — FIFO and
        // second-chance order frames by `loadedAt`, and FIFO's `onAccess` is a
        // no-op, so nothing else would advance it.
        state.now += 1;
        target.pageId = pageId;
        target.usageCount = 0;
        target.loadedAt = state.now;
        target.pinCount += 1;
        // A load is a miss, not a hit: `onLoad` (default `onAccess`) lets a policy
        // treat the two differently — midpoint-LRU inserts at the old sublist.
        (policy.onLoad ?? policy.onAccess)(state, target.frameId);
        // Said once per slot, the first time the scan fills the ring — after that the evictions carry the explanation.
        const fillingRing = ring?.active === true && ring.cursor <= ring.size;
        emit(`Read page ${pageId} from disk into frame ${target.frameId}. This is the expensive part — everything else is memory.${fillingRing ? ` The frame is one of the scan's ring of ${ring.size}: a scan this long reuses a few frames instead of competing for the whole pool.` : ''}`, { stage: 'buffer', action: 'load', pageId, frameId: target.frameId }, { dwell: DISK_READ_DWELL });
        return { frameId: target.frameId, hit: false };
    }
    /**
     * A page a caller is *producing* — a `Sort` run or merge-pass output — not
     * reading off disk. Always a fresh page id (a `Sort` operator never reuses
     * one within a run), so unlike `fetch` there is no hit path: it either
     * takes a free frame or evicts, exactly the way a disk read does, and the
     * two kinds of page genuinely compete for the same pool.
     */
    function write(pageId) {
        if (!Number.isInteger(pageId) || pageId < 0 || pageId >= pageCount)
            return null;
        stats.writes += 1;
        const target = claimFrame(pageId, true);
        if (!target)
            return null;
        state.now += 1;
        target.pageId = pageId;
        target.usageCount = 0;
        target.loadedAt = state.now;
        target.pinCount += 1;
        (policy.onLoad ?? policy.onAccess)(state, target.frameId);
        emit(`Write page ${pageId} into frame ${target.frameId} — a fresh page, not a disk read.`, {
            stage: 'buffer',
            action: 'write',
            pageId,
            frameId: target.frameId,
        });
        return { frameId: target.frameId, hit: false };
    }
    function unpin(frameId) {
        const f = state.frames.find((x) => x.frameId === frameId);
        if (f && f.pinCount > 0)
            f.pinCount -= 1;
    }
    return { fetch, beginScan, endScan, write, markDirty, unpin, state, stats };
}
