import test from "node:test";
import assert from "node:assert/strict";
import { activeTask, summarizeTasks, taskProgress, tasksReducer } from "../src/models/qubi/tasks.ts";
import type { QubiTask } from "../src/models/qubi/types.ts";

const plan = (tasks: QubiTask[] = [], goal = "Arma una estación del clima", steps = ["Poner la placa", "Poner el sensor", "Conectar"]) =>
  tasksReducer(tasks, { type: "plan", goal, steps });

test("a plan creates a task with every step pending", () => {
  const [t] = plan();
  assert.equal(t.id, "task-1");
  assert.equal(t.state, "planning");
  assert.deepEqual(t.steps.map((s) => s.state), ["pending", "pending", "pending"]);
});

test("an empty plan or a plan without a goal creates nothing", () => {
  assert.deepEqual(plan([], "x", []), []);
  assert.deepEqual(plan([], "  ", ["a"]), []);
  assert.deepEqual(plan([], "x", ["", "  "]), []);
});

test("steps update the active task and the task starts working", () => {
  let tasks = plan();
  tasks = tasksReducer(tasks, { type: "step", index: 0, state: "doing" });
  assert.equal(tasks[0].state, "working");
  assert.equal(tasks[0].steps[0].state, "doing");
  tasks = tasksReducer(tasks, { type: "step", index: 0, state: "done" });
  assert.equal(tasks[0].steps[0].state, "done");
  assert.equal(tasks[0].steps[1].state, "pending");
});

test("a step outside the plan, or with no task, changes nothing", () => {
  const tasks = plan();
  assert.equal(tasksReducer(tasks, { type: "step", index: 9, state: "done" }), tasks);
  assert.equal(tasksReducer(tasks, { type: "step", index: -1, state: "done" }), tasks);
  const none: QubiTask[] = [];
  assert.equal(tasksReducer(none, { type: "step", index: 0, state: "done" }), none);
});

test("the task is done when its last step is", () => {
  let tasks = plan([], "g", ["a", "b"]);
  tasks = tasksReducer(tasks, { type: "step", index: 0, state: "done" });
  assert.equal(tasks[0].state, "working");
  tasks = tasksReducer(tasks, { type: "step", index: 1, state: "done" });
  assert.equal(tasks[0].state, "done");
  assert.equal(activeTask(tasks), null);
});

test("when the agent stops, a task with a failed step or steps left is failed", () => {
  let a = plan([], "g", ["a", "b"]);
  a = tasksReducer(a, { type: "step", index: 0, state: "failed" });
  assert.equal(tasksReducer(a, { type: "done" })[0].state, "failed");
  const b = tasksReducer(plan([], "g", ["a", "b"]), { type: "step", index: 0, state: "done" });
  assert.equal(tasksReducer(b, { type: "done" })[0].state, "failed");
  assert.equal(tasksReducer(plan(), { type: "error" })[0].state, "failed");
});

test("cancelling stops an active task and leaves finished ones alone", () => {
  let tasks = plan();
  tasks = tasksReducer(tasks, { type: "cancel", id: "task-1" });
  assert.equal(tasks[0].state, "cancelled");
  // later steps of a cancelled task are ignored
  assert.equal(tasksReducer(tasks, { type: "step", index: 0, state: "done" }), tasks);
  assert.equal(tasksReducer(tasks, { type: "cancel", id: "nope" }), tasks);
  const finished = tasksReducer(plan([], "g", ["a"]), { type: "step", index: 0, state: "done" });
  assert.equal(tasksReducer(finished, { type: "cancel", id: "task-1" })[0].state, "done");
});

test("a new plan replaces the running one and gets a fresh id", () => {
  const tasks = plan(plan(), "Otro objetivo", ["x"]);
  assert.deepEqual(tasks.map((t) => [t.id, t.state]), [["task-1", "cancelled"], ["task-2", "planning"]]);
  assert.equal(activeTask(tasks)?.id, "task-2");
});

test("steps and text are capped", () => {
  const [t] = plan([], "g".repeat(500), Array.from({ length: 40 }, (_, i) => `paso ${i}`));
  assert.equal(t.steps.length, 12);
  assert.ok(t.goal.length <= 140);
});

test("progress and summary", () => {
  let tasks = plan();
  tasks = tasksReducer(tasks, { type: "step", index: 0, state: "done" });
  tasks = tasksReducer(tasks, { type: "step", index: 1, state: "doing" });
  const p = taskProgress(tasks[0]);
  assert.deepEqual([p.done, p.total, p.percent, p.current, p.currentText], [1, 3, 33, 1, "Poner el sensor"]);
  const s = summarizeTasks(tasks);
  assert.deepEqual([s.total, s.active, s.done, s.failed], [1, 1, 0, 0]);
  assert.equal(s.current?.id, "task-1");
  tasks = tasksReducer(tasks, { type: "cancel", id: "task-1" });
  assert.equal(taskProgress(tasks[0]).current, null);
  assert.equal(summarizeTasks(tasks).cancelled, 1);
});

test("other agent events leave the tasks alone", () => {
  const tasks = plan();
  assert.equal(tasksReducer(tasks, { type: "thinking" }), tasks);
  assert.equal(tasksReducer(tasks, { type: "reply", text: "hola" }), tasks);
});
