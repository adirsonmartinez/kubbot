import test from "node:test";
import assert from "node:assert/strict";
import { benchReducer, initBench, notice, type BenchAction, type BenchState } from "../src/models/lab/bench.ts";
import { addPart, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { COMPONENTS } from "../src/models/lab/catalog.ts";
import { EXAMPLE_NAMES, exampleDesign } from "../src/models/lab/examples.ts";
import { partBox } from "../src/models/lab/layout.ts";

const UNO_LED: Design = {
  version: 1,
  parts: [
    { id: "arduino-uno-1", type: "arduino-uno", x: 0, z: 0, rot: 0 },
    { id: "led-1", type: "led", x: 10, z: 0, rot: 0 },
  ],
  wires: [],
};

const run = (state: BenchState, ...actions: BenchAction[]) => actions.reduce(benchReducer, state);
const loaded = (design: Design = UNO_LED) => run(initBench(), { type: "load", design });

test("a new bench is empty and green", () => {
  const s = initBench();
  assert.deepEqual(s.design, emptyDesign());
  assert.equal(s.check.level, "green");
  assert.deepEqual([s.selected, s.wiring, s.hover, s.notice, s.query], [null, null, null, null, ""]);
  assert.deepEqual(s.sim, { running: false, t: 0 });
  assert.deepEqual(s.enclosure, { visible: false, exploded: false });
});

test("load checks the design; the LED is not wired yet", () => {
  const s = loaded();
  assert.equal(s.design.parts.length, 2);
  assert.equal(s.check.parts["led-1"], "yellow");
  assert.equal(s.notice, null);
});

test("load with dropped parts warns, and keeps the selection only while the part exists", () => {
  let s = run(loaded(), { type: "select", id: "led-1" });
  s = run(s, { type: "load", design: { ...UNO_LED, parts: [UNO_LED.parts[0]] }, dropped: 2 });
  assert.equal(s.selected, null);
  assert.deepEqual(s.notice, notice("warn", "loadFailed", { dropped: 2 }));
  s = run(loaded(), { type: "select", id: "led-1" }, { type: "load", design: UNO_LED });
  assert.equal(s.selected, "led-1");
});

test("add puts a part on a free spot, selects it and never on top of another", () => {
  const s = run(loaded(), { type: "add", part: "led", at: { x: 10, z: 0 } });
  assert.equal(s.selected, "led-2");
  const part = s.design.parts.find((p) => p.id === "led-2")!;
  assert.notEqual(part.x, 10);
  assert.equal(s.design.parts.length, 3);
});

test("add of an unknown type, or on a full bench, changes nothing", () => {
  const s = loaded();
  assert.equal(run(s, { type: "add", part: "tostadora" }), s);
  let full = emptyDesign();
  for (let i = 0; i < 60; i++) full = addPart(full, "led", { x: i }).design;
  const f = loaded(full);
  assert.equal(run(f, { type: "add", part: "led" }), f);
});

test("move is live and does not re-run the checker; unknown ids are ignored", () => {
  const s = loaded();
  const moved = run(s, { type: "move", id: "led-1", x: 5, z: 3 }, { type: "move", id: "led-1", x: 6, z: 4 });
  assert.deepEqual(moved.design.parts[1], { id: "led-1", type: "led", x: 6, z: 4, rot: 0 });
  assert.equal(moved.check, s.check, "same check object");
  assert.equal(run(s, { type: "move", id: "nope", x: 1, z: 1 }), s);
  assert.equal(run(s, { type: "moveEnd" }), s);
});

test("rotate and remove act on the selected part; remove takes its wires and the selection", () => {
  let s = run(loaded(), { type: "pickPin", part: "led-1", pin: "SIG" }, { type: "pickPin", part: "arduino-uno-1", pin: "D2" });
  assert.equal(s.design.wires.length, 1);
  s = run(s, { type: "select", id: "led-1" }, { type: "rotate" });
  assert.equal(s.design.parts[1].rot, 1);
  s = run(s, { type: "remove" });
  assert.equal(s.design.parts.length, 1);
  assert.equal(s.design.wires.length, 0);
  assert.equal(s.selected, null);
  const same = run(s, { type: "rotate" }, { type: "remove" });
  assert.equal(same.design, s.design, "nothing selected: nothing happens");
  assert.equal(run(s, { type: "remove", id: "arduino-uno-1" }).design.parts.length, 0);
});

test("select ignores parts that do not exist", () => {
  const s = run(loaded(), { type: "select", id: "led-1" });
  assert.equal(s.selected, "led-1");
  assert.equal(run(s, { type: "select", id: "ghost" }).selected, null);
  assert.equal(run(s, { type: "select", id: null }).selected, null);
});

test("pickPin: the first pick waits, the second on another part connects", () => {
  let s = run(loaded(), { type: "pickPin", part: "led-1", pin: "SIG" });
  assert.deepEqual(s.wiring, { part: "led-1", pin: "SIG" });
  assert.deepEqual(s.notice, notice("ok", "wiring", { part: "led-1", pin: "SIG" }));
  s = run(s, { type: "pickPin", part: "arduino-uno-1", pin: "D2" });
  assert.equal(s.wiring, null);
  assert.equal(s.notice, null);
  assert.equal(s.design.wires.length, 1);
  assert.deepEqual(s.design.wires[0].to, { part: "arduino-uno-1", pin: "D2" });
});

test("pickPin: the same pin cancels; another pin of the same part restarts from it", () => {
  let s = run(loaded(), { type: "pickPin", part: "led-1", pin: "SIG" }, { type: "pickPin", part: "led-1", pin: "SIG" });
  assert.equal(s.wiring, null);
  assert.equal(s.notice, null);
  s = run(s, { type: "pickPin", part: "led-1", pin: "SIG" }, { type: "pickPin", part: "led-1", pin: "GND" });
  assert.deepEqual(s.wiring, { part: "led-1", pin: "GND" });
  assert.equal(s.design.wires.length, 0);
});

test("pickPin: unknown parts and pins are ignored", () => {
  const s = loaded();
  assert.equal(run(s, { type: "pickPin", part: "ghost", pin: "SIG" }), s);
  assert.equal(run(s, { type: "pickPin", part: "led-1", pin: "XX" }), s);
});

test("pickPin: a refused connection says why and ends the wiring", () => {
  let s = run(loaded(), { type: "pickPin", part: "led-1", pin: "SIG" }, { type: "pickPin", part: "arduino-uno-1", pin: "D2" });
  s = run(s, { type: "pickPin", part: "arduino-uno-1", pin: "D2" }, { type: "pickPin", part: "led-1", pin: "SIG" });
  assert.equal(s.design.wires.length, 1);
  assert.deepEqual(s.notice, notice("warn", "connectRefused", { reason: "duplicate" }));
  assert.equal(s.wiring, null);
});

test("hoverPin sets and clears the hovered pin, and does not churn on the same pin", () => {
  const s = run(loaded(), { type: "hoverPin", part: "led-1", pin: "SIG" });
  assert.deepEqual(s.hover, { part: "led-1", pin: "SIG" });
  assert.equal(run(s, { type: "hoverPin", part: "led-1", pin: "SIG" }), s);
  assert.equal(run(s, { type: "hoverPin" }).hover, null);
});

test("cancelWire clears the wiring and its hint", () => {
  const s = run(loaded(), { type: "pickPin", part: "led-1", pin: "SIG" }, { type: "cancelWire" });
  assert.equal(s.wiring, null);
  assert.equal(s.notice, null);
  assert.equal(run(s, { type: "cancelWire" }), s);
});

test("autoWire without a board says so", () => {
  const s = run(loaded({ ...UNO_LED, parts: [UNO_LED.parts[1]] }), { type: "autoWire" });
  assert.deepEqual(s.notice, notice("warn", "noBoardForWire"));
  assert.equal(s.design.wires.length, 0);
});

test("autoWire wires one part, then all, then reports nothing left to do", () => {
  let s = run(loaded({ ...UNO_LED, parts: [UNO_LED.parts[1]] }), { type: "add", part: "arduino-uno" }, { type: "add", part: "button" });
  s = run(s, { type: "autoWire", id: "led-1" });
  assert.equal(s.design.wires.length, 3, "the LED's ground and its resistor's two");
  assert.ok(s.design.parts.some((p) => p.type === "resistor-220"), "the resistor was placed");
  assert.deepEqual(s.notice, notice("ok", "autoWired", { added: 3 }));
  s = run(s, { type: "autoWire" });
  assert.equal(s.design.wires.length, 5, "the button too");
  s = run(s, { type: "autoWire" });
  assert.deepEqual(s.notice, notice("ok", "autoWired", { added: 0 }));
  assert.equal(s.check.level, "green");
});

test("autoWire on a board wires every part to that board", () => {
  const s = run(loaded(), { type: "autoWire", id: "arduino-uno-1" });
  assert.equal(s.design.wires.length, 3);
  assert.ok(s.design.wires.filter((w) => w.to.part === "arduino-uno-1").length === 2, "the LED's signal goes through its resistor");
  assert.equal(s.check.level, "green");
});

test("autoWire of an unknown part does nothing", () => {
  const s = loaded();
  assert.equal(run(s, { type: "autoWire", id: "ghost" }), s);
});

test("autoWire reports pins it could not place, with their parts", () => {
  // An Uno has 12 + 6 usable signal pins: 8 HC-SR04 (2 signal pins each) overflow it
  let design = emptyDesign();
  design = addPart(design, "arduino-uno").design;
  for (let i = 0; i < 10; i++) design = addPart(design, "hc-sr04", { x: i * 8 }).design;
  const s = run(loaded(design), { type: "autoWire" });
  assert.equal(s.notice?.code, "autoWireMissing");
  const missing = s.notice?.args.missing as { part: string; pin: string }[];
  assert.ok(missing.length > 0);
  assert.ok(missing.every((m) => m.part.startsWith("hc-sr04-")));
});

test("removeWire and setQuery", () => {
  let s = run(loaded(), { type: "autoWire", id: "led-1" });
  s = run(s, { type: "removeWire", id: s.design.wires[0].id });
  assert.equal(s.design.wires.length, 2);
  assert.equal(run(s, { type: "removeWire", id: "nope" }), s);
  assert.equal(run(s, { type: "setQuery", query: "servo" }).query, "servo");
});

test("escape: cancels wiring, then deselects, then stops the simulation, then nothing", () => {
  let s = run(loaded(), { type: "autoWire" }, { type: "toggleSim" }, { type: "select", id: "led-1" }, { type: "pickPin", part: "led-1", pin: "SIG" });
  assert.equal(s.sim.running, true);
  s = run(s, { type: "escape" });
  assert.equal(s.wiring, null);
  assert.equal(s.selected, "led-1");
  s = run(s, { type: "escape" });
  assert.equal(s.selected, null);
  assert.equal(s.sim.running, true);
  s = run(s, { type: "escape" });
  assert.equal(s.sim.running, false);
  assert.equal(run(s, { type: "escape" }), s);
});

test("simulation: refused while something is red, then runs, ticks and stops", () => {
  // 5 V straight into GND: a short
  let s = loaded();
  s = run(s, { type: "pickPin", part: "led-1", pin: "GND" }, { type: "pickPin", part: "arduino-uno-1", pin: "5V" });
  s = run(s, { type: "pickPin", part: "led-1", pin: "GND" }, { type: "pickPin", part: "arduino-uno-1", pin: "GND" });
  assert.equal(s.check.level, "red");
  s = run(s, { type: "toggleSim" });
  assert.equal(s.sim.running, false);
  assert.deepEqual(s.notice, notice("error", "simBlocked"));
  s = run(s, { type: "removeWire", id: "w1" }, { type: "toggleSim" });
  assert.deepEqual(s.sim, { running: true, t: 0 });
  assert.equal(s.notice, null);
  s = run(s, { type: "tick", dt: 250 }, { type: "tick", dt: 250 });
  assert.equal(s.sim.t, 500);
  s = run(s, { type: "toggleSim" });
  assert.deepEqual(s.sim, { running: false, t: 0 });
  assert.equal(run(s, { type: "tick", dt: 100 }).sim.t, 0, "no ticks while stopped");
});

test("tick ignores bad deltas", () => {
  const s = run(loaded(), { type: "toggleSim" });
  assert.equal(run(s, { type: "tick", dt: 0 }), s);
  assert.equal(run(s, { type: "tick", dt: -5 }), s);
  assert.equal(run(s, { type: "tick", dt: Number.NaN }), s);
});

test("a running simulation stops when a change makes the circuit red", () => {
  let s = run(loaded(), { type: "toggleSim" });
  assert.equal(s.sim.running, true);
  // LED ground on the 5 V pin: the checker turns red at once
  s = run(s, { type: "pickPin", part: "led-1", pin: "GND" }, { type: "pickPin", part: "arduino-uno-1", pin: "5V" });
  assert.equal(s.check.level, "red");
  assert.deepEqual(s.sim, { running: false, t: 0 });
  assert.deepEqual(s.notice, notice("error", "simBlocked"));
});

test("enclosure: shown, exploded, hidden again (and explode resets)", () => {
  let s = run(loaded(), { type: "toggleEnclosure" });
  assert.deepEqual(s.enclosure, { visible: true, exploded: false });
  s = run(s, { type: "toggleExplode" });
  assert.equal(s.enclosure.exploded, true);
  s = run(s, { type: "toggleEnclosure" });
  assert.deepEqual(s.enclosure, { visible: false, exploded: false });
  assert.equal(run(s, { type: "toggleExplode" }), s, "explode needs the enclosure visible");
});

test("enclosure without a board says so, and hides when the board goes away", () => {
  const noBoard = loaded({ ...UNO_LED, parts: [UNO_LED.parts[1]] });
  assert.deepEqual(run(noBoard, { type: "toggleEnclosure" }).notice, notice("warn", "enclosureNoBoard"));
  const s = run(loaded(), { type: "toggleEnclosure" }, { type: "remove", id: "arduino-uno-1" });
  assert.deepEqual(s.enclosure, { visible: false, exploded: false });
});

test("notify and clearNotice", () => {
  const n = notice("error", "exportFailed");
  const s = run(loaded(), { type: "notify", notice: n });
  assert.equal(s.notice, n);
  assert.equal(run(s, { type: "clearNotice" }).notice, null);
  const clean = loaded();
  assert.equal(run(clean, { type: "clearNotice" }), clean);
});

test("the reducer never mutates its input", () => {
  const s = loaded();
  const before = JSON.stringify(s);
  run(s, { type: "add", part: "led" }, { type: "autoWire" }, { type: "rotate", id: "led-1" }, { type: "remove", id: "led-1" });
  assert.equal(JSON.stringify(s), before);
});

// --- The wiring guide ---
const SENSOR: Design = {
  version: 1,
  parts: [
    { id: "arduino-uno-1", type: "arduino-uno", x: 0, z: 0, rot: 0 },
    { id: "hc-sr04-1", type: "hc-sr04", x: 10, z: 0, rot: 0 },
  ],
  wires: [],
};

test("a new bench has no guide; startGuide opens it on the first step to do", () => {
  assert.equal(initBench().guide, null);
  const s = run(loaded(SENSOR), { type: "startGuide", part: "hc-sr04-1" });
  assert.deepEqual(s.guide, { part: "hc-sr04-1", step: 0 });
  assert.equal(s.selected, "hc-sr04-1");
});

test("startGuide ignores boards and unknown parts, and warns when there is nothing left to wire", () => {
  const s = loaded(SENSOR);
  assert.equal(run(s, { type: "startGuide", part: "arduino-uno-1" }), s);
  assert.equal(run(s, { type: "startGuide", part: "nope" }), s);
  const wired = run(s, { type: "autoWire", id: "hc-sr04-1" });
  const again = run(wired, { type: "startGuide", part: "hc-sr04-1" });
  assert.equal(again.guide, null);
  assert.deepEqual(again.notice, notice("warn", "guideNoSteps"));
  const lonely = loaded({ ...SENSOR, parts: [SENSOR.parts[1]] });
  assert.equal(run(lonely, { type: "startGuide", part: "hc-sr04-1" }).guide, null); // no board
});

test("next and prev move between steps; past the last one the guide ends with a notice", () => {
  let s = run(loaded(SENSOR), { type: "startGuide", part: "hc-sr04-1" });
  s = run(s, { type: "nextGuide" }, { type: "nextGuide" });
  assert.equal(s.guide?.step, 2);
  s = run(s, { type: "prevGuide" });
  assert.equal(s.guide?.step, 1);
  s = run(s, { type: "prevGuide" }, { type: "prevGuide" });
  assert.equal(s.guide?.step, 0);
  s = run(s, { type: "goGuide", step: 3 });
  assert.equal(s.guide?.step, 3);
  s = run(s, { type: "nextGuide" });
  assert.equal(s.guide, null);
  assert.deepEqual(s.notice, notice("ok", "guideDone"));
  assert.equal(run(s, { type: "nextGuide" }), s);
});

test("guideDo wires the current step; the guide moves on and ends when every pin is wired", () => {
  let s = run(loaded(SENSOR), { type: "startGuide", part: "hc-sr04-1" });
  s = run(s, { type: "guideDo" });
  assert.equal(s.design.wires.length, 1);
  assert.equal(s.guide?.step, 1); // moved on by itself
  s = run(s, { type: "guideDo" }, { type: "guideDo" });
  assert.equal(s.guide?.step, 3);
  s = run(s, { type: "guideDo" });
  assert.equal(s.design.wires.length, 4);
  assert.equal(s.guide, null);
  assert.deepEqual(s.notice, notice("ok", "guideDone"));
  assert.equal(s.check.parts["hc-sr04-1"], "green");
});

test("wiring a step by hand advances the guide too", () => {
  let s = run(loaded(SENSOR), { type: "startGuide", part: "hc-sr04-1" });
  s = run(s, { type: "pickPin", part: "hc-sr04-1", pin: "VCC" }, { type: "pickPin", part: "arduino-uno-1", pin: "5V" });
  assert.equal(s.design.wires.length, 1);
  assert.equal(s.guide?.step, 1);
});

test("the guide ends when its part goes, and Esc closes it after the wire in progress", () => {
  let s = run(loaded(SENSOR), { type: "startGuide", part: "hc-sr04-1" });
  assert.equal(run(s, { type: "remove", id: "hc-sr04-1" }).guide, null);
  s = run(s, { type: "pickPin", part: "hc-sr04-1", pin: "VCC" });
  s = run(s, { type: "escape" });
  assert.equal(s.wiring, null);
  assert.ok(s.guide);
  s = run(s, { type: "escape" });
  assert.equal(s.guide, null);
  assert.equal(s.selected, "hc-sr04-1");
  assert.equal(run(s, { type: "endGuide" }), s);
});

test("acceptSuggestions wires what suggestWires planned, for one part or all", () => {
  const two: Design = { ...UNO_LED, parts: [...UNO_LED.parts, { id: "button-1", type: "button", x: 20, z: 0, rot: 0 }] };
  const one = run(loaded(two), { type: "acceptSuggestions", part: "led-1" });
  assert.equal(one.design.wires.length, 3);
  assert.ok(one.design.parts.some((p) => p.type === "resistor-220"));
  assert.ok(one.design.wires.every((w) => w.from.part !== "button-1" && w.to.part !== "button-1"));
  assert.deepEqual(one.notice, notice("ok", "autoWired", { added: 3 }));
  const all = run(loaded(two), { type: "acceptSuggestions" });
  assert.equal(all.design.wires.length, 5);
  assert.deepEqual(all.design.wires, run(loaded(two), { type: "autoWire" }).design.wires);
  assert.deepEqual(run(all, { type: "acceptSuggestions" }).notice, notice("ok", "autoWired", { added: 0 }));
  assert.deepEqual(run(loaded({ ...two, parts: [two.parts[1]] }), { type: "acceptSuggestions" }).notice, notice("warn", "noBoardForWire"));
});

test("a catalog part clicked or dropped on the board never lands on top of another part", () => {
  const overlaps = (design: Design, id: string) => {
    const a = partBox(design.parts.find((p) => p.id === id)!);
    return design.parts.filter((p) => p.id !== id).some((p) => {
      const b = partBox(p);
      return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    });
  };
  for (const name of EXAMPLE_NAMES) {
    for (const spec of COMPONENTS) {
      // A click has no point; a drop can land right on the board's center
      for (const at of [undefined, { x: 0, z: 0 }]) {
        const s = run(loaded(exampleDesign(name)!), { type: "add", part: spec.id, at });
        const placed = s.selected;
        assert.ok(placed, `${name}/${spec.id}`);
        assert.equal(overlaps(s.design, placed), false, `${name}/${spec.id} at ${JSON.stringify(at)}`);
      }
    }
  }
});
