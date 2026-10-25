import test from "node:test";
import assert from "node:assert/strict";
import { addPart, connect, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { partBox, pinSpot } from "../src/models/lab/layout.ts";
import {
  bubbleFromReply,
  directorReducer,
  fillTemplate,
  initialDirector,
  nextDeadline,
  pickLine,
  TIMING,
  type DirectorContext,
  type DirectorCopy,
  type DirectorEvent,
  type DirectorState,
} from "../src/models/qubi/director.ts";
import type { QubiTask } from "../src/models/qubi/types.ts";

const copy: DirectorCopy = {
  thinking: "pienso",
  tools: { lab_add_part: "pongo", lab_connect: "cable" },
  toolDefault: "a la obra",
  toolFailed: "no salió",
  done: "listo",
  doneFailed: "pendiente",
  error: "uy",
  planned: "plan de {n}",
  step: "Paso {i} de {n}: {text}",
  stepFailed: "paso {i} mal",
  cancelled: "ahí lo dejo",
};

let design: Design = emptyDesign();
design = addPart(design, "arduino-uno", { x: 0, z: 0 }).design;
design = addPart(design, "hc-sr04", { x: 6, z: 4 }).design;
design = addPart(design, "led", { x: -5, z: 3 }).design;
design = connect(design, { part: "hc-sr04-1", pin: "TRIG" }, { part: "arduino-uno-1", pin: "D7" }).design;

let clock = 1000;
const run = (state: DirectorState, event: DirectorEvent, extra: Partial<DirectorContext> = {}, at = (clock += 100)): DirectorState =>
  directorReducer(state, event, { design, now: at, copy, ...extra });
const feed = (events: DirectorEvent[], state = initialDirector()) => events.reduce((s, e) => run(s, e), state);

test("thinking: he thinks, looks focused and says so", () => {
  const s = run(initialDirector(), { type: "thinking" });
  assert.equal(s.activity, "thinking");
  assert.equal(s.expression, "focused");
  assert.equal(s.bubble, "pienso");
  assert.equal(s.gesture?.name, "think");
  assert.equal(s.busy, true);
});

test("a tool that touches a part sends him to that part, working", () => {
  const s = run(initialDirector(), { type: "toolStart", name: "lab_move", input: { part: "led-1", x: 1, z: 1 } });
  const box = partBox(design.parts.find((p) => p.id === "led-1")!);
  assert.deepEqual(s.target, { x: box.x, z: box.z, part: "led-1" });
  assert.equal(s.activity, "working");
  assert.equal(s.gesture?.name, "work");
  assert.equal(s.bubble, "a la obra", "a tool without a line uses the default");
});

test("lab_connect goes to the 'from' pin", () => {
  const s = run(initialDirector(), { type: "toolStart", name: "lab_connect", input: { from: "hc-sr04-1.TRIG", to: "arduino-uno-1.D7" } });
  const spot = pinSpot(design.parts.find((p) => p.id === "hc-sr04-1")!, "TRIG")!;
  assert.deepEqual(s.target, { x: spot.x, z: spot.z, part: "hc-sr04-1" });
  assert.equal(s.bubble, "cable");
});

test("a pin that does not exist falls back to the part, a part that does not exist keeps him where he is", () => {
  const box = partBox(design.parts[1]);
  const a = run(initialDirector(), { type: "toolStart", name: "lab_connect", input: { from: "hc-sr04-1.NOPE", to: "x.y" } });
  assert.deepEqual(a.target, { x: box.x, z: box.z, part: "hc-sr04-1" });
  const b = run(a, { type: "toolStart", name: "lab_connect", input: { from: "ghost-9.A", to: "x.y" } });
  assert.deepEqual(b.target, a.target);
});

test("lab_add_part: goes to the new part named in the result", () => {
  const start = run(initialDirector(), { type: "toolStart", name: "lab_add_part", input: { type: "led", near: "hc-sr04-1" } });
  assert.equal(start.target?.part, "hc-sr04-1");
  const end = run(start, { type: "toolEnd", name: "lab_add_part", input: { type: "led" }, ok: true, part: "led-1" });
  const box = partBox(design.parts.find((p) => p.id === "led-1")!);
  assert.deepEqual(end.target, { x: box.x, z: box.z, part: "led-1" });
  assert.equal(end.pending, null);
});

test("a part that the design does not show yet is walked to as soon as it does", () => {
  const stale = emptyDesign();
  const start = run(initialDirector(), { type: "toolStart", name: "lab_add_part", input: { type: "led" } }, { design: stale });
  const end = run(start, { type: "toolEnd", name: "lab_add_part", input: { type: "led" }, ok: true, part: "led-1" }, { design: stale });
  assert.deepEqual(end.pending, { part: "led-1" });
  assert.deepEqual(run(end, { type: "design" }, { design: stale }).pending, { part: "led-1" }, "still waiting while it is missing");
  const later = run(end, { type: "design" });
  assert.equal(later.pending, null);
  assert.equal(later.target?.part, "led-1");
});

test("lab_auto_wire all and whole-bench tools go to the board", () => {
  for (const name of ["lab_load_example", "lab_clear", "lab_simulate", "lab_make_sketch"]) {
    const s = run(initialDirector(), { type: "toolStart", name, input: {} });
    assert.equal(s.target?.part, "arduino-uno-1", name);
  }
  assert.equal(run(initialDirector(), { type: "toolStart", name: "lab_auto_wire", input: { part: "all" } }).target?.part, "arduino-uno-1");
  assert.equal(run(initialDirector(), { type: "toolStart", name: "lab_auto_wire", input: { part: "led-1" } }).target?.part, "led-1");
});

test("reading tools make him think, not walk; lab_focus points", () => {
  const s = run(initialDirector(), { type: "toolStart", name: "lab_view", input: {} });
  assert.equal(s.activity, "thinking");
  assert.equal(s.target, null);
  assert.equal(run(s, { type: "toolStart", name: "lab_focus", input: { part: "led-1" } }).gesture?.name, "point");
});

test("lab_move ends at the new spot", () => {
  const s = run(initialDirector(), { type: "toolEnd", name: "lab_move", input: { part: "led-1", x: 9, z: -2 }, ok: true });
  assert.deepEqual(s.target, { x: 9, z: -2, part: "led-1" });
});

test("a failed tool worries him and he shrugs at the end; success celebrates", () => {
  let s = feed([
    { type: "thinking" },
    { type: "toolStart", name: "lab_connect", input: { from: "hc-sr04-1.TRIG", to: "arduino-uno-1.D7" } },
    { type: "toolEnd", name: "lab_connect", input: {}, ok: false },
  ]);
  assert.equal(s.expression, "worried");
  assert.equal(s.bubble, "no salió");
  s = run(s, { type: "done" });
  assert.equal(s.gesture?.name, "shrug");
  assert.equal(s.bubble, "pendiente");
  assert.equal(s.busy, false);

  const ok = feed([
    { type: "thinking" },
    { type: "toolStart", name: "lab_add_part", input: { type: "led" } },
    { type: "toolEnd", name: "lab_add_part", input: { type: "led" }, ok: true, part: "led-1" },
    { type: "done" },
  ]);
  assert.equal(ok.gesture?.name, "celebrate");
  assert.equal(ok.expression, "happy");
  assert.equal(ok.bubble, "listo");
});

test("a new turn forgets the last turn's failure", () => {
  let s = feed([{ type: "thinking" }, { type: "toolEnd", name: "lab_connect", input: {}, ok: false }, { type: "done" }]);
  s = feed([{ type: "thinking" }, { type: "toolStart", name: "lab_add_part", input: { type: "led" } }, { type: "toolEnd", name: "lab_add_part", input: {}, ok: true, part: "led-1" }, { type: "done" }], s);
  assert.equal(s.gesture?.name, "celebrate");
});

test("a plain chat turn does not celebrate or shrug", () => {
  const s = feed([{ type: "thinking" }, { type: "reply", text: "Claro que sí." }, { type: "done" }]);
  assert.notEqual(s.gesture?.name, "celebrate");
  assert.notEqual(s.gesture?.name, "shrug");
});

test("the reply's first sentence is the bubble and it survives the end of the turn", () => {
  const s = feed([
    { type: "thinking" },
    { type: "toolStart", name: "lab_add_part", input: { type: "led" } },
    { type: "toolEnd", name: "lab_add_part", input: {}, ok: true, part: "led-1" },
    { type: "reply", text: "Puse el LED junto al sensor. Después lo conecto al pin 7 para que prenda." },
    { type: "done" },
  ]);
  assert.equal(s.bubble, "Puse el LED junto al sensor.");
  assert.equal(s.activity, "talking");
  assert.ok(s.bubbleUntil !== null && s.restAt !== null);
});

test("bubbleFromReply: first sentence, no markdown, about 90 characters", () => {
  assert.equal(bubbleFromReply("**¡Listo!** Conecté los cables."), "¡Listo! Conecté los cables.");
  assert.equal(bubbleFromReply("Usa el pin 3.3V para el sensor. Luego mide."), "Usa el pin 3.3V para el sensor.");
  assert.equal(bubbleFromReply("- Primero esto\n- luego aquello"), "Primero esto luego aquello");
  assert.equal(bubbleFromReply("   "), "");
  const long = bubbleFromReply("palabra ".repeat(40));
  assert.ok(long.length <= 90 && long.endsWith("…"), long);
  assert.equal(bubbleFromReply("Esto no tiene punto final y es corto"), "Esto no tiene punto final y es corto");
});

test("an empty reply changes nothing", () => {
  const s = initialDirector();
  assert.equal(run(s, { type: "reply", text: "  " }), s);
});

test("he returns to idle after a few seconds, and the bubble goes away, only when the turn ended", () => {
  let s = feed([{ type: "thinking" }, { type: "toolStart", name: "lab_add_part", input: { type: "led" } }]);
  assert.equal(run(s, { type: "tick", now: s.lastAt + 1000 }), s, "busy: no tick moves him (until stale)");
  s = feed([{ type: "thinking" }, { type: "reply", text: "Hola, pana." }, { type: "done" }]);
  const early = run(s, { type: "tick", now: s.lastAt + 10 });
  assert.equal(early.bubble, "Hola, pana.");
  assert.equal(early.activity, "talking");
  const late = run(s, { type: "tick", now: s.lastAt + TIMING.bubbleMaxMs + 100 });
  assert.equal(late.bubble, null);
  assert.equal(late.activity, "idle");
  assert.equal(late.expression, "neutral");
  assert.equal(nextDeadline(late), null);
  assert.ok((nextDeadline(s) ?? 0) > s.lastAt);
});

test("a turn that never ends is dropped after a while", () => {
  const s = feed([{ type: "thinking" }]);
  const gone = run(s, { type: "tick", now: s.lastAt + TIMING.staleMs + 5 });
  assert.equal(gone.busy, false);
  assert.equal(gone.activity, "idle");
  assert.equal(gone.bubble, null);
});

test("the target stays after the idle return so he does not walk back", () => {
  const s = feed([{ type: "toolStart", name: "lab_move", input: { part: "led-1" } }, { type: "done" }]);
  const idle = run(s, { type: "tick", now: s.lastAt + 20000 });
  assert.equal(idle.target?.part, "led-1");
});

test("error: worried, shrug, short line", () => {
  const s = feed([{ type: "thinking" }, { type: "error" }]);
  assert.equal(s.busy, false);
  assert.equal(s.expression, "worried");
  assert.equal(s.gesture?.name, "shrug");
  assert.equal(s.bubble, "uy");
});

test("call events: listening, talking and back to idle", () => {
  let s = run(initialDirector(), { type: "call", status: "on", listening: true });
  assert.equal(s.activity, "listening");
  s = run(s, { type: "call", status: "on", speaking: true });
  assert.equal(s.activity, "talking");
  s = run(s, { type: "call", status: "on", listening: true });
  assert.equal(s.activity, "listening");
  s = run(s, { type: "call", status: "off" });
  assert.equal(s.activity, "idle");
});

test("during a call he rests listening, not idle", () => {
  let s = run(initialDirector(), { type: "call", status: "on", listening: true });
  s = feed([{ type: "thinking" }, { type: "reply", text: "Sí." }, { type: "done" }], s);
  const rest = run(s, { type: "tick", now: s.lastAt + 20000 });
  assert.equal(rest.activity, "listening");
});

test("a call that is still connecting does not make him listen", () => {
  assert.equal(run(initialDirector(), { type: "call", status: "connecting", listening: true }).activity, "idle");
});

test("greet: waves with a line, unless he is busy", () => {
  const s = run(initialDirector(), { type: "greet", text: "¡Epa, pana!" });
  assert.equal(s.bubble, "¡Epa, pana!");
  assert.equal(s.gesture?.name, "wave");
  assert.equal(s.expression, "happy");
  const busy = feed([{ type: "thinking" }], initialDirector());
  assert.equal(run(busy, { type: "greet", text: "hola" }), busy);
});

test("plan and step lines come from the copy and the active task", () => {
  const task: QubiTask = { id: "task-1", goal: "g", state: "working", steps: [{ text: "Poner la placa", state: "doing" }, { text: "Conectar", state: "pending" }] };
  const p = run(initialDirector(), { type: "plan", goal: "g", steps: ["a", "b"] });
  assert.equal(p.bubble, "plan de 2");
  const s = run(p, { type: "step", index: 0, state: "doing" }, { task });
  assert.equal(s.bubble, "Paso 1 de 2: Poner la placa");
  assert.equal(s.activity, "working");
  const f = run(s, { type: "step", index: 1, state: "failed" }, { task });
  assert.equal(f.bubble, "paso 2 mal");
  assert.equal(f.expression, "worried");
  assert.equal(run(f, { type: "done" }).gesture?.name, "shrug");
});

test("cancel: he stops, says so and rests", () => {
  const s = run(feed([{ type: "thinking" }]), { type: "cancel" });
  assert.equal(s.busy, false);
  assert.equal(s.bubble, "ahí lo dejo");
});

test("the same gesture replays because `at` changes", () => {
  const a = run(initialDirector(), { type: "toolStart", name: "lab_add_part", input: { type: "led" } });
  const b = run(a, { type: "toolStart", name: "lab_add_part", input: { type: "led" } });
  assert.equal(b.gesture?.name, a.gesture?.name);
  assert.notEqual(b.gesture?.at, a.gesture?.at);
});

test("helpers: templates and picking a line", () => {
  assert.equal(fillTemplate("Paso {i} de {n} {x}", { i: 1, n: 3 }), "Paso 1 de 3 {x}");
  assert.equal(pickLine(["a", "b", "c"], 0), "a");
  assert.equal(pickLine(["a", "b", "c"], 0.999), "c");
  assert.equal(pickLine([], 0.5), null);
});
