import test from "node:test";
import assert from "node:assert/strict";
import {
  TOUR_STEPS,
  INITIAL_STATE,
  tourReducer,
  shouldOfferTour,
  isTourComplete,

} from "../src/models/lab/tour.ts";

test("TOUR_STEPS has all expected targets and placements", () => {
  const targets = [
    "catalog",
    "bench",
    "toolbar-wire",
    "toolbar-sim",
    "toolbar-box",
    "toolbar-code",
    "check",
    "chat",
    "qubi",
  ];
  assert.equal(TOUR_STEPS.length, targets.length);
  for (const t of targets) {
    assert.ok(TOUR_STEPS.some((s) => s.target === t), `target ${t}`);
  }
  for (const step of TOUR_STEPS) {
    assert.ok(["top", "bottom", "left", "right"].includes(step.placement), step.id);
    assert.ok(step.title.length > 0, step.id);
    assert.ok(step.text.length > 0, step.id);
    assert.ok(step.id.length > 0, step.id);
  }
});

test("INITIAL_STATE: tour is off", () => {
  assert.equal(INITIAL_STATE.active, false);
  assert.equal(INITIAL_STATE.step, -1);
});

test("start: goes active, step 0", () => {
  const next = tourReducer(INITIAL_STATE, { type: "start" });
  assert.equal(next.active, true);
  assert.equal(next.step, 0);
});

test("next: advances through steps", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  assert.equal(s.step, 0);
  s = tourReducer(s, { type: "next" });
  assert.equal(s.step, 1);
  s = tourReducer(s, { type: "next" });
  assert.equal(s.step, 2);
});

test("next: last step finishes the tour", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  for (let i = 1; i < TOUR_STEPS.length; i++) {
    s = tourReducer(s, { type: "next" });
  }
  assert.equal(s.active, true);
  assert.equal(s.step, TOUR_STEPS.length - 1);
  s = tourReducer(s, { type: "next" });
  assert.equal(s.active, false);
  assert.equal(s.step, TOUR_STEPS.length);
});

test("next from finished tour stays finished", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  for (let i = 1; i < TOUR_STEPS.length; i++) {
    s = tourReducer(s, { type: "next" });
  }
  s = tourReducer(s, { type: "next" });
  const after = tourReducer(s, { type: "next" });
  assert.equal(after.active, false);
  assert.equal(after.step, TOUR_STEPS.length);
});

test("prev: goes back", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  s = tourReducer(s, { type: "next" });
  assert.equal(s.step, 1);
  s = tourReducer(s, { type: "prev" });
  assert.equal(s.step, 0);
});

test("prev at step 0 stays at 0", () => {
  const s = tourReducer(INITIAL_STATE, { type: "start" });
  const back = tourReducer(s, { type: "prev" });
  assert.equal(back.step, 0);
});

test("skip: resets to initial", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  s = tourReducer(s, { type: "next" });
  assert.equal(s.active, true);
  const reset = tourReducer(s, { type: "skip" });
  assert.equal(reset.active, false);
  assert.equal(reset.step, -1);
});

test("finish: resets to initial", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  s = tourReducer(s, { type: "next" });
  const end = tourReducer(s, { type: "finish" });
  assert.equal(end.active, false);
  assert.equal(end.step, -1);
});

test("shouldOfferTour: returns true when not seen", () => {
  assert.equal(shouldOfferTour(false), true);
});

test("shouldOfferTour: returns false when already seen", () => {
  assert.equal(shouldOfferTour(true), false);
});

test("isTourComplete: initial state is complete (not started)", () => {
  assert.equal(isTourComplete(INITIAL_STATE), true);
});

test("isTourComplete: active tour is not complete", () => {
  const s = tourReducer(INITIAL_STATE, { type: "start" });
  assert.equal(isTourComplete(s), false);
});

test("isTourComplete: finished tour is complete", () => {
  let s = tourReducer(INITIAL_STATE, { type: "start" });
  for (let i = 1; i < TOUR_STEPS.length; i++) {
    s = tourReducer(s, { type: "next" });
  }
  s = tourReducer(s, { type: "next" });
  assert.equal(isTourComplete(s), true);
});