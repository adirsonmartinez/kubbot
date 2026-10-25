import test from "node:test";
import assert from "node:assert/strict";
import {
  createHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
} from "../src/models/lab/history.ts";

/* ---------- createHistory ---------- */

test("createHistory starts empty with past and future", () => {
  const h = createHistory({ x: 1 });
  assert.equal(h.past.length, 0);
  assert.deepEqual(h.present, { x: 1 });
  assert.equal(h.future.length, 0);
});

test("createHistory records now", () => {
  const h = createHistory(42);
  assert.ok(typeof h.now === "number" && h.now > 0);
});

/* ---------- commit: basic ---------- */

test("commit pushes a new state onto past", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 });
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present, { x: 1 });
  assert.equal(h.future.length, 0);
});

test("commit with same value does not change state", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 0 });
  assert.equal(h.past.length, 0);
  assert.deepEqual(h.present, { x: 0 });
});

test("commit with same reference does not change state", () => {
  const snap = { x: 0 };
  const h = createHistory(snap);
  commit(h, snap);
  assert.equal(h.past.length, 0);
});

/* ---------- commit: undo/redo round-trip ---------- */

test("undo restores the previous state", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 });
  commit(h, { x: 2 });
  const v = undo(h);
  assert.deepEqual(v, { x: 1 });
  assert.deepEqual(h.present, { x: 1 });
  assert.equal(h.past.length, 1);
});

test("redo restores the undone state", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 });
  undo(h);
  const v = redo(h);
  assert.deepEqual(v, { x: 1 });
  assert.deepEqual(h.present, { x: 1 });
});

test("undo at the beginning returns undefined", () => {
  const h = createHistory(42);
  assert.equal(undo(h), undefined);
});

test("redo with empty future returns undefined", () => {
  const h = createHistory(42);
  // future is empty from the start — nothing to redo
  assert.equal(redo(h), undefined);
});

test("a new commit after undo clears the future", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 });
  undo(h);
  commit(h, { x: 99 });
  assert.equal(h.future.length, 0);
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present, { x: 99 });
});

/* ---------- coalescing ---------- */

test("same coalesceKey within 800 ms replaces the previous entry", () => {
  const h = createHistory({ x: 0 });
  const base = 1000;
  commit(h, { x: 1 }, { coalesceKey: "drag", now: base });
  commit(h, { x: 2 }, { coalesceKey: "drag", now: base + 400 });
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present, { x: 2 });
});

test("different coalesceKey always appends", () => {
  const h = createHistory({ x: 0 });
  const base = 1000;
  commit(h, { x: 1 }, { coalesceKey: "a", now: base });
  commit(h, { x: 2 }, { coalesceKey: "b", now: base + 100 });
  assert.equal(h.past.length, 2);
});

test("coalesceKey older than 800 ms appends", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 }, { coalesceKey: "drag", now: 1000 });
  commit(h, { x: 2 }, { coalesceKey: "drag", now: 1900 });
  assert.equal(h.past.length, 2);
});

test("undo after coalescing goes back to the state before the group", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 }, { coalesceKey: "drag", now: 1000 });
  commit(h, { x: 2 }, { coalesceKey: "drag", now: 1200 });
  const v = undo(h);
  assert.deepEqual(v, { x: 1 });
  assert.equal(h.past.length, 0);
});

test("no coalesceKey always appends", () => {
  const h = createHistory(0);
  commit(h, 1, { now: 1000 });
  commit(h, 2, { now: 1000 });
  assert.equal(h.past.length, 2);
});

test("coalescing does not affect future (it is already cleared)", () => {
  const h = createHistory({ x: 0 });
  commit(h, { x: 1 }, { coalesceKey: "a", now: 1000 });
  undo(h);
  // past has 0, present is {x:0}, future has {x:1}
  commit(h, { x: 2 }, { coalesceKey: "b", now: 1100 });
  assert.equal(h.future.length, 0);
  assert.equal(h.past.length, 1);
});

/* ---------- 100-entry limit ---------- */

test("past is trimmed to 100 entries", () => {
  const h = createHistory(0);
  for (let i = 1; i <= 150; i++) {
    commit(h, i);
  }
  assert.equal(h.past.length, 100);
  // after 150 commits from 0: 50 entries shifted out, past[0].snapshot = 50
  assert.equal(h.past[0].snapshot, 50);
  assert.deepEqual(h.present, 150);
});

/* ---------- canUndo / canRedo ---------- */

test("canUndo and canRedo reflect the stack", () => {
  const h = createHistory(0);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);

  commit(h, 1);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  undo(h);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), true);

  redo(h);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);
});

/* ---------- multiple undo/redo ---------- */

test("multiple undo steps restore the correct order", () => {
  const h = createHistory(0);
  commit(h, 1);
  commit(h, 2);
  commit(h, 3);
  assert.equal(undo(h), 2);
  assert.equal(undo(h), 1);
  assert.equal(undo(h), 0);
  assert.equal(undo(h), undefined);
});

test("multiple redo steps restore the correct order", () => {
  const h = createHistory(0);
  commit(h, 1);
  commit(h, 2);
  commit(h, 3);
  undo(h);
  undo(h);
  undo(h);
  assert.equal(redo(h), 1);
  assert.equal(redo(h), 2);
  assert.equal(redo(h), 3);
  assert.equal(redo(h), undefined);
});

/* ---------- now tracking ---------- */

test("now is updated on commit", () => {
  const h = createHistory(0);
  commit(h, 1, { now: 5000 });
  assert.equal(h.now, 5000);
});

test("now is updated on undo", () => {
  const h = createHistory(0);
  commit(h, 1, { now: 1000 });
  commit(h, 2, { now: 2000 });
  undo(h);
  assert.equal(h.now, 2000);
});

test("now is updated on redo", () => {
  const h = createHistory(0);
  commit(h, 1, { now: 1000 });
  undo(h);
  redo(h);
  assert.equal(h.now, 1000);
});

/* ---------- string values ---------- */

test("works with string values", () => {
  const h = createHistory("a");
  commit(h, "b");
  assert.equal(undo(h), "a"); // undo restores to the previous value
  assert.deepEqual(h.present, "a");
  assert.equal(redo(h), "b"); // redo goes back to the committed value
});

/* ---------- complex object values ---------- */

test("works with complex objects", () => {
  const h = createHistory({ parts: [{ id: 1 }], wires: [] });
  const next = { parts: [{ id: 1 }, { id: 2 }], wires: [] };
  commit(h, next);
  const v = undo(h);
  assert.equal(v?.parts.length, 1);
  assert.equal(v?.wires.length, 0);
});