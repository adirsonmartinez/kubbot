import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITY_ORB, currentActivity, elapsedMs, formatSeconds, newRun, runReducer, summarize, type RunState } from "../src/models/runStory.ts";
import type { AgentEvent } from "../src/models/qubi/types.ts";

function play(events: [AgentEvent, number][], start = 0): RunState {
  return events.reduce((run, [e, at]) => runReducer(run, e, at), newRun(start));
}

test("a new run is running and waiting for the model", () => {
  const run = newRun(1000, { model: "claude-sonnet-5-5", effort: "medium" });
  assert.equal(run.status, "running");
  assert.equal(currentActivity(run), "thinking");
  assert.equal(run.model, "claude-sonnet-5-5");
});

test("tools become steps with their time and the activity follows the running one", () => {
  let run = newRun(0);
  run = runReducer(run, { type: "thinking" }, 10);
  run = runReducer(run, { type: "toolStart", name: "lab_add_part", input: {} }, 100);
  assert.equal(currentActivity(run), "building");
  assert.equal(ACTIVITY_ORB[currentActivity(run)], "working");
  run = runReducer(run, { type: "toolEnd", name: "lab_add_part", input: {}, ok: true, part: "hc-sr04-1" }, 400);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].status, "done");
  assert.equal(run.steps[0].part, "hc-sr04-1");
  assert.equal(run.steps[0].endedAt, 400);
  // no tool running: the model thinks again
  assert.equal(currentActivity(run), "thinking");
});

test("each tool picks its own orb", () => {
  const orb = (name: string) => {
    const run = runReducer(newRun(0), { type: "toolStart", name, input: {} }, 1);
    return ACTIVITY_ORB[currentActivity(run)];
  };
  assert.equal(orb("lab_view"), "searching");
  assert.equal(orb("lab_auto_wire"), "connecting");
  assert.equal(orb("lab_simulate"), "solving");
  assert.equal(orb("lab_make_sketch"), "composing");
  assert.equal(orb("lab_plan"), "weaving");
  assert.equal(orb("lab_make_enclosure"), "shaping");
  assert.equal(orb("lab_unknown"), "working");
});

test("a failed tool is marked and lab_step is not a step", () => {
  const run = play([
    [{ type: "toolStart", name: "lab_connect", input: {} }, 10],
    [{ type: "toolEnd", name: "lab_connect", input: {}, ok: false }, 20],
    [{ type: "toolStart", name: "lab_step", input: {} }, 30],
    [{ type: "toolEnd", name: "lab_step", input: {}, ok: true }, 31],
  ]);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].status, "failed");
  assert.equal(summarize(run, 100).failed, 1);
});

test("two tools of the same name end in order", () => {
  const run = play([
    [{ type: "toolStart", name: "lab_add_part", input: {} }, 0],
    [{ type: "toolStart", name: "lab_add_part", input: {} }, 5],
    [{ type: "toolEnd", name: "lab_add_part", input: {}, ok: true }, 10],
  ]);
  assert.deepEqual(run.steps.map((s) => s.status), ["done", "running"]);
  assert.equal(currentActivity(run), "building");
});

test("done and error close the run once; leftovers fail", () => {
  const done = play([
    [{ type: "toolStart", name: "lab_view", input: {} }, 100],
    [{ type: "reply", text: "listo" }, 200],
    [{ type: "done" }, 300],
  ]);
  assert.equal(done.status, "done");
  assert.equal(done.replies, 1);
  assert.equal(done.endedAt, 300);
  assert.equal(done.steps[0].status, "failed"); // it never reported an end
  assert.equal(elapsedMs(done, 99999), 300);
  // events after the end change nothing
  assert.equal(runReducer(done, { type: "thinking" }, 400), done);
  const failed = play([[{ type: "error" }, 50]]);
  assert.equal(failed.status, "error");
  assert.equal(failed.thinking, false);
});

test("reply moves the activity to writing", () => {
  const run = play([[{ type: "reply", text: "hola" }, 5]]);
  assert.equal(currentActivity(run), "writing");
});

test("formatSeconds uses Spanish decimals", () => {
  assert.equal(formatSeconds(3200), "3,2 s");
  assert.equal(formatSeconds(12400), "12 s");
  assert.equal(formatSeconds(10), "0,1 s");
});
