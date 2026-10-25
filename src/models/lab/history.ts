/** Generic undo/redo history with coalescing.

 * A history captures snapshots of type T.  The user can undo and redo
 * through the stack.  Consecutive snapshots with the same `coalesceKey`
 * within 800 ms merge into a single entry (useful for drag gestures).
 *
 * All functions mutate the History object in place (no new object is
 * returned).  This is the standard undo/redo pattern.
 */

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
  now: number; // epoch ms when the current state was recorded
}

interface HistoryEntry<T> {
  snapshot: T;
  now: number;
  coalesceKey?: string;
}

/** Maximum number of undo entries kept. */
const MAX_ENTRIES = 100;
/** Coalescing window in ms. */
const COALESCE_MS = 800;

/** Deep equality for plain objects, arrays and primitives. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const tA = typeof a, tB = typeof b;
  if (tA !== tB) return false;
  if (tA === 'object') {
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
    }
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Create a fresh history from an initial snapshot. */
export function createHistory<T>(initial: T): History<T> {
  return {
    past: [],
    present: initial,
    future: [],
    now: Date.now(),
  };
}

/**
 * Push a new snapshot onto the history.
 *
 * If `next` is referentially equal to `present` the state is unchanged.
 *
 * When `options.coalesceKey` is provided the last entry in `past` is
 * replaced instead of appended if:
 *  - it has the same `coalesceKey`, and
 *  - it was recorded within `COALESCE_MS` ms.
 *
 * `options.now` defaults to `Date.now()` and is useful for tests.
 */
export function commit<T>(
  h: History<T>,
  next: T,
  options?: { coalesceKey?: string; now?: number },
): void {
  if (deepEqual(next, h.present)) return;

  const now = options?.now ?? Date.now();

  // Try to coalesce with the previous entry
  if (options?.coalesceKey && h.past.length > 0) {
    const last = h.past[h.past.length - 1];
    if (last.coalesceKey === options.coalesceKey && now - last.now < COALESCE_MS) {
      last.snapshot = h.present; // snapshot keeps the first value of the group
      last.now = now;
      h.present = next;
      h.now = now;
      return;
    }
  }

  // Trim the past to the maximum allowed entries
  if (h.past.length >= MAX_ENTRIES) {
    h.past.shift();
  }

  h.past.push({ snapshot: h.present, now, coalesceKey: options?.coalesceKey });
  h.present = next;
  h.now = now;
  // A new non-redo commit clears the future
  h.future = [];
}

/** Undo one step. Returns the previous state or `undefined` when nothing to undo. */
export function undo<T>(h: History<T>): T | undefined {
  if (h.past.length === 0) return undefined;
  const prev = h.past.pop()!;
  h.future.unshift({ snapshot: h.present, now: h.now, coalesceKey: undefined });
  h.present = prev.snapshot;
  h.now = prev.now;
  return prev.snapshot;
}

/** Redo one step. Returns the redone state or `undefined` when nothing to redo. */
export function redo<T>(h: History<T>): T | undefined {
  if (h.future.length === 0) return undefined;
  const next = h.future.shift()!;
  h.past.push({ snapshot: h.present, now: h.now, coalesceKey: undefined });
  h.present = next.snapshot;
  h.now = next.now;
  return next.snapshot;
}

/** Whether there is something to undo. */
export const canUndo = <T>(h: History<T>) => h.past.length > 0;

/** Whether there is something to redo. */
export const canRedo = <T>(h: History<T>) => h.future.length > 0;