import test from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS } from "../src/models/lab/catalog.ts";
import { emptyDesign, checkDesign, connect, type Design } from "../src/models/lab/circuit.ts";
import {
  AGENT_TOOLS,
  AGENT_TOOL_NAMES,
  PLAN_LIMITS,
  applyAgentTool,
  benchContext,
  parsePinRef,
  parsePlanInput,
  newTask,
  parseStepInput,
  quickRule,
  resultText,
  taskState,
  toolPart,
  updateTask,
  type QuickCopy,
} from "../src/models/lab/agentTools.ts";
import { EXAMPLE_NAMES } from "../src/models/lab/examples.ts";
import { partBox } from "../src/models/lab/layout.ts";
import { simulate } from "../src/models/lab/simulation.ts";

// Runs a list of tool calls in order, returning the final design and every outcome
function run(calls: [string, unknown][], start: Design = emptyDesign()) {
  let design = start;
  const outcomes = calls.map(([name, input]) => {
    const out = applyAgentTool(design, name, input);
    design = out.design;
    return out;
  });
  return { design, outcomes };
}
const uno = (): [string, unknown] => ["lab_add_part", { type: "arduino-uno" }];

test("the schemas: sixteen tools, unique names, valid object schemas", () => {
  assert.equal(AGENT_TOOLS.length, 16);
  assert.equal(new Set(AGENT_TOOL_NAMES).size, 16);
  for (const t of AGENT_TOOLS) {
    assert.match(t.name, /^lab_[a-z_]+$/);
    assert.ok(t.description.length > 20);
    assert.equal(t.input_schema.type, "object");
    assert.equal(t.input_schema.additionalProperties, false);
    for (const r of t.input_schema.required ?? []) assert.ok(r in t.input_schema.properties, `${t.name}.${r}`);
  }
});

test("bad input never throws and never changes the design", () => {
  const base = run([uno()]).design;
  const junk: unknown[] = [undefined, null, 0, "x", [], {}, { type: 5 }, { from: {}, to: [] }, { part: {} }, { part: "a", wire: "b" }, { x: NaN }, Symbol.for("s")];
  for (const name of [...AGENT_TOOL_NAMES, "nope", "", "__proto__"]) {
    for (const input of junk) {
      const out = applyAgentTool(base, name, input);
      assert.equal(typeof out.result.ok, "boolean", `${name}`);
      if (!out.result.ok) assert.equal(out.design, base, `${name} must not change the design when it fails`);
      assert.doesNotThrow(() => resultText(out.result));
    }
  }
  assert.doesNotThrow(() => applyAgentTool(base, "lab_add_part", { type: "led", near: 5, rot: "x", x: Infinity, z: 3 }));
});

test("lab_catalog lists every part, or one section, with compact board pins", () => {
  const all = applyAgentTool(emptyDesign(), "lab_catalog", {}).result.parts as { id: string; kind: string; pinsBySignal?: Record<string, string[]> }[];
  assert.equal(all.length, COMPONENTS.length);
  const uno = all.find((p) => p.id === "arduino-uno")!;
  assert.equal(uno.kind, "board");
  assert.ok(uno.pinsBySignal!.pwm.includes("D3"));
  assert.deepEqual(uno.pinsBySignal!.sda, ["A4"]);
  const sensors = applyAgentTool(emptyDesign(), "lab_catalog", { category: "sensors" }).result.parts as { category: string }[];
  assert.ok(sensors.length > 0 && sensors.every((p) => p.category === "sensors"));
  assert.equal(applyAgentTool(emptyDesign(), "lab_catalog", { category: "magic" }).result.error, "unknown_category");
});

test("lab_add_part: places known parts, refuses unknown ones, reports ids and an action", () => {
  const { design, outcomes } = run([uno(), ["lab_add_part", { type: "hc-sr04" }], ["lab_add_part", { type: "hc-sr04" }]]);
  assert.deepEqual(design.parts.map((p) => p.id), ["arduino-uno-1", "hc-sr04-1", "hc-sr04-2"]);
  assert.equal(outcomes[1].result.id, "hc-sr04-1");
  assert.deepEqual(outcomes[1].action, { kind: "add", part: "hc-sr04-1", type: "hc-sr04" });
  // Parts do not pile on top of each other
  const [a, b] = [design.parts[1], design.parts[2]];
  assert.ok(a.x !== b.x || a.z !== b.z);

  const refused = applyAgentTool(design, "lab_add_part", { type: "flux-capacitor" });
  assert.equal(refused.result.error, "unknown_part_type");
  assert.ok((refused.result.validTypes as string[]).includes("led"));
  assert.equal(refused.design, design);
  assert.equal(refused.action, undefined);

  assert.equal(applyAgentTool(design, "lab_add_part", { type: "led", near: "ghost" }).result.error, "unknown_near");
  assert.equal(applyAgentTool(design, "lab_add_part", {}).result.error, "unknown_part_type");
});

test("lab_add_part: honours near and explicit x and z", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "led", x: 30, z: 4 }]]);
  const led = design.parts[1];
  assert.ok(Math.abs(led.x - 30) < 1 && led.z === 4);
  const near = run([uno(), ["lab_add_part", { type: "led", near: "arduino-uno-1" }]]).design.parts[1];
  assert.ok(near.x !== 0 || near.z !== 0, "not on top of the board");
  assert.ok(Math.hypot(near.x, near.z) < 10, "close to it");
});

test("lab_connect: wires pins, parses dotted refs, and includes the checker verdict", () => {
  const { design, outcomes } = run([
    uno(),
    ["lab_add_part", { type: "button" }],
    ["lab_connect", { from: "button-1.SIG", to: "arduino-uno-1.D3" }],
    ["lab_connect", { from: "button-1.GND", to: "arduino-uno-1.GND" }],
  ]);
  assert.equal(design.wires.length, 2);
  assert.equal(outcomes[2].result.ok, true);
  assert.deepEqual(outcomes[2].action, { kind: "connect", wire: "w1", from: { part: "button-1", pin: "SIG" }, to: { part: "arduino-uno-1", pin: "D3" } });
  assert.equal((outcomes[3].result.check as { level: string }).level, "green");
});

test("lab_connect: refusals are explained", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "button" }], ["lab_connect", { from: "button-1.SIG", to: "arduino-uno-1.D3" }]]);
  const dup = applyAgentTool(design, "lab_connect", { from: "arduino-uno-1.D3", to: "button-1.SIG" });
  assert.equal(dup.result.error, "duplicate");
  assert.match(String(dup.result.meaning), /already/);
  const same = applyAgentTool(design, "lab_connect", { from: "button-1.SIG", to: "button-1.SIG" });
  assert.equal(same.result.error, "same");
  const noPart = applyAgentTool(design, "lab_connect", { from: "ghost.SIG", to: "arduino-uno-1.D3" });
  assert.equal(noPart.result.error, "unknown_part");
  assert.deepEqual(noPart.result.parts, ["arduino-uno-1", "button-1"]);
  const noPin = applyAgentTool(design, "lab_connect", { from: "button-1.NOPE", to: "arduino-uno-1.D3" });
  assert.equal(noPin.result.error, "unknown_pin");
  assert.deepEqual(noPin.result.pins, ["SIG", "GND"]);
  const badRef = applyAgentTool(design, "lab_connect", { from: "button-1", to: "arduino-uno-1.D3" });
  assert.equal(badRef.result.error, "bad_pin_ref");
  for (const out of [dup, same, noPart, noPin, badRef]) {
    assert.equal(out.design, design);
    assert.equal(out.action, undefined);
  }
});

test("lab_connect: a wire that adds a red issue is NOT drawn and comes back with the rule and the fix", () => {
  const { design, outcomes } = run([
    uno(),
    ["lab_add_part", { type: "button" }],
    ["lab_connect", { from: "button-1.GND", to: "arduino-uno-1.5V" }],
  ]);
  assert.equal(design.wires.length, 0, "the short is not drawn");
  const out = outcomes[2];
  assert.equal(out.result.ok, false);
  assert.equal(out.result.error, "rejected_by_checker");
  const rejection = out.result.rejection as { code: string; rule: string; message: string; fix: string };
  assert.equal(rejection.code, "R1");
  assert.equal(rejection.rule, "short");
  assert.ok(rejection.message.length > 10 && rejection.fix.length > 10);
  assert.equal(out.action, undefined);
  assert.equal(out.design, outcomes[1].design);
});

// The demo's key moment: the AI proposes, the checker rejects, Qubi corrects
test("demo: a bare LED is rejected (R4) with the fix, then resistor + wiring through it turns green", () => {
  let design = run([uno(), ["lab_add_part", { type: "led" }]]).design;
  // 1. the model proposes the LED straight on D13
  const bare = applyAgentTool(design, "lab_connect", { from: "led-1.SIG", to: "arduino-uno-1.D13" });
  assert.equal(bare.result.ok, false);
  assert.equal(bare.result.error, "rejected_by_checker");
  const rejection = bare.result.rejection as { code: string; rule: string; message: string; fix: string };
  assert.equal(rejection.code, "R4");
  assert.equal(rejection.rule, "ledNoResistor");
  assert.match(rejection.message, /resistor/i);
  assert.match(rejection.fix, /220/);
  assert.match(rejection.fix, /arduino-uno-1\.D13/, "the fix names the pin the model tried");
  assert.equal(bare.design, design, "nothing was drawn");
  assert.equal(bare.action, undefined);
  // The same wire the other way round is refused too
  assert.equal(applyAgentTool(design, "lab_connect", { from: "arduino-uno-1.D13", to: "led-1.SIG" }).result.error, "rejected_by_checker");
  // 2. Qubi corrects: a resistor, board pin -> A, B -> LED
  const fixed = run(
    [
      ["lab_add_part", { type: "resistor-220", near: "led-1" }],
      ["lab_connect", { from: "arduino-uno-1.D13", to: "resistor-220-1.A" }],
      ["lab_connect", { from: "resistor-220-1.B", to: "led-1.SIG" }],
      ["lab_connect", { from: "led-1.GND", to: "arduino-uno-1.GND" }],
    ],
    design,
  );
  assert.ok(fixed.outcomes.every((o) => o.result.ok === true));
  design = fixed.design;
  assert.equal((fixed.outcomes[3].result.check as { level: string }).level, "green");
  assert.equal(checkDesign(design).level, "green");
  assert.match(String(fixed.outcomes[3].result.verdict), /^GREEN/);
});

test("lab_connect and lab_add_part reject only when the red count grows", () => {
  const red = connect(run([uno(), ["lab_add_part", { type: "led" }]]).design, { part: "led-1", pin: "SIG" }, { part: "arduino-uno-1", pin: "D13" }).design;
  assert.equal(checkDesign(red).level, "red");
  // Already red: a harmless wire that adds no red is still drawn
  const more = applyAgentTool(red, "lab_connect", { from: "led-1.GND", to: "arduino-uno-1.GND" });
  assert.equal(more.result.ok, true);
  // A second bare LED on another pin is one more red: refused
  const withLed = applyAgentTool(red, "lab_add_part", { type: "led" });
  assert.equal(withLed.result.ok, true, "placing a part alone is not red");
  const again = applyAgentTool(withLed.design, "lab_connect", { from: "led-2.SIG", to: "arduino-uno-1.D12" });
  assert.equal((again.result.rejection as { code: string }).code, "R4");
  // A second servo on the board's 5 V crosses the supply budget (R14) and is refused with the battery advice
  const servos = run([uno(), ["lab_add_part", { type: "servo-sg90" }], ["lab_add_part", { type: "servo-sg90" }], ["lab_connect", { from: "servo-sg90-1.VCC", to: "arduino-uno-1.5V" }]]).design;
  const second = applyAgentTool(servos, "lab_connect", { from: "servo-sg90-2.VCC", to: "arduino-uno-1.5V" });
  const r14 = second.result.rejection as { code: string; fix: string };
  assert.equal(r14.code, "R14");
  assert.match(r14.fix, /battery-aa4/);
  assert.equal(second.design, servos);
  // Placing a second display of the same type is fine until both sit on the bus (R10 is refused on the wire)
  const displays = run([uno(), ["lab_add_part", { type: "oled-128x64" }], ["lab_add_part", { type: "oled-128x64" }], ["lab_auto_wire", { part: "oled-128x64-1" }]]).design;
  const sda = applyAgentTool(displays, "lab_connect", { from: "oled-128x64-2.SDA", to: "arduino-uno-1.A4" });
  assert.equal((sda.result.rejection as { code: string }).code, "R10");
});

test("lab_auto_wire on an LED places its resistor and says so", () => {
  const { design, outcomes } = run([uno(), ["lab_add_part", { type: "led" }], ["lab_auto_wire", { part: "led-1" }]]);
  assert.deepEqual(outcomes[2].result.partsAdded, ["resistor-220-1"]);
  assert.equal(outcomes[2].result.wiresAdded, 3);
  assert.equal(design.parts.filter((p) => p.type === "resistor-220").length, 1);
  assert.equal((outcomes[2].result.check as { level: string }).level, "green");
});

test("the demo prompt is reachable with the tools: Uno + LED + resistor + button, green, and the LED follows the button", () => {
  const { design, outcomes } = run([
    uno(),
    ["lab_add_part", { type: "led" }],
    ["lab_add_part", { type: "resistor-220", near: "led-1" }],
    ["lab_add_part", { type: "button" }],
    ["lab_connect", { from: "arduino-uno-1.D8", to: "resistor-220-1.A" }],
    ["lab_connect", { from: "resistor-220-1.B", to: "led-1.SIG" }],
    ["lab_connect", { from: "led-1.GND", to: "arduino-uno-1.GND" }],
    ["lab_connect", { from: "button-1.SIG", to: "arduino-uno-1.D2" }],
    ["lab_connect", { from: "button-1.GND", to: "arduino-uno-1.GND" }],
    ["lab_simulate", {}],
  ]);
  assert.ok(outcomes.every((o) => o.result.ok === true));
  assert.equal(checkDesign(design).level, "green");
  assert.deepEqual(outcomes[9].action, { kind: "simulate" });
  assert.equal(simulate(design, 100).parts["led-1"].kind, "led");
  assert.deepEqual(simulate(design, 100).parts["led-1"], { kind: "led", on: true });
  assert.deepEqual(simulate(design, 1500).parts["led-1"], { kind: "led", on: false });
  // ...and the ready-made example is the same circuit
  const loaded = applyAgentTool(emptyDesign(), "lab_load_example", { name: "blinkButton" });
  assert.equal(loaded.result.ok, true);
  assert.equal(checkDesign(loaded.design).level, "green");
});

test("lab_auto_wire: one part, all parts, errors", () => {
  const { design, outcomes } = run([
    uno(),
    ["lab_add_part", { type: "hc-sr04" }],
    ["lab_add_part", { type: "servo-sg90" }],
    ["lab_auto_wire", { part: "hc-sr04-1" }],
    ["lab_auto_wire", { part: "all" }],
  ]);
  assert.deepEqual(outcomes[3].action, { kind: "autoWire", wires: 4, missing: [] });
  assert.equal(outcomes[4].result.wiresAdded, 3);
  const check = checkDesign(design);
  assert.notEqual(check.level, "red");
  assert.deepEqual(design.wires.length, 7);
  assert.ok(["green", "yellow"].includes((outcomes[4].result.check as { level: string }).level));

  assert.equal(applyAgentTool(design, "lab_auto_wire", { part: "arduino-uno-1" }).result.error, "is_board");
  assert.equal(applyAgentTool(design, "lab_auto_wire", { part: "ghost" }).result.error, "unknown_part");
  assert.equal(applyAgentTool(emptyDesign(), "lab_auto_wire", { part: "all" }).result.error, "no_board");
  const onlyBoard = run([uno()]).design;
  assert.equal(applyAgentTool(onlyBoard, "lab_auto_wire", { part: "all" }).result.error, "nothing_to_wire");
});

test("lab_auto_wire is idempotent: a second run adds nothing", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "pir" }], ["lab_auto_wire", { part: "all" }]]);
  const again = applyAgentTool(design, "lab_auto_wire", { part: "all" });
  assert.equal(again.result.wiresAdded, 0);
  assert.equal(again.design.wires.length, design.wires.length);
});

test("lab_remove: a part takes its wires, a wire stays alone, bad calls are refused", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "button" }], ["lab_auto_wire", { part: "all" }]]);
  assert.equal(design.wires.length, 2);
  const noWire = applyAgentTool(design, "lab_remove", { wire: "w1" });
  assert.equal(noWire.design.wires.length, 1);
  assert.deepEqual(noWire.action, { kind: "remove", wire: "w1" });
  const noPart = applyAgentTool(design, "lab_remove", { part: "button-1" });
  assert.equal(noPart.design.parts.length, 1);
  assert.equal(noPart.design.wires.length, 0);
  assert.equal(applyAgentTool(design, "lab_remove", {}).result.error, "give_one");
  assert.equal(applyAgentTool(design, "lab_remove", { part: "button-1", wire: "w1" }).result.error, "give_one");
  assert.equal(applyAgentTool(design, "lab_remove", { part: "ghost" }).result.error, "unknown_part");
  assert.equal(applyAgentTool(design, "lab_remove", { wire: "w99" }).result.error, "unknown_wire");
});

test("lab_view: description, parts, wires and the check, with issue meanings", () => {
  const { outcomes } = run([uno(), ["lab_add_part", { type: "hc-sr04" }], ["lab_view", {}]]);
  const view = outcomes[2].result as unknown as { description: string; parts: unknown[]; check: { level: string; issues: { key: string; meaning: string }[] } };
  assert.match(view.description, /hc-sr04-1/);
  assert.equal(view.parts.length, 2);
  assert.equal(view.check.level, "yellow");
  assert.ok(view.check.issues.every((i) => i.meaning));
  assert.equal(outcomes[2].action, undefined);
});

test("simulate, enclosure and sketch: gated by a board (and simulate by red), then ask the UI to act", () => {
  for (const [name, kind] of [["lab_simulate", "simulate"], ["lab_make_enclosure", "enclosure"], ["lab_make_sketch", "sketch"]] as const) {
    assert.equal(applyAgentTool(emptyDesign(), name, {}).result.error, "no_board");
    const ok = run([uno(), ["lab_add_part", { type: "led" }], ["lab_auto_wire", { part: "all" }], [name, {}]]).outcomes[3];
    assert.equal(ok.result.ok, true);
    assert.deepEqual(ok.action, { kind });
  }
  // The tools refuse red wiring, so a red bench is built with the circuit functions
  const base = run([uno(), ["lab_add_part", { type: "led" }]]).design;
  const red = connect(base, { part: "led-1", pin: "GND" }, { part: "arduino-uno-1", pin: "5V" }).design;
  const blocked = applyAgentTool(red, "lab_simulate", {});
  assert.equal(blocked.result.error, "blocked_by_red");
  assert.equal(blocked.action, undefined);
  // Enclosure and sketch are not blocked by red (the sketch itself leaves flagged parts out)
  assert.equal(applyAgentTool(red, "lab_make_enclosure", {}).result.ok, true);
});

test("details providers add data to the make tools and cannot break them", () => {
  const design = run([uno()]).design;
  const ok = applyAgentTool(design, "lab_make_sketch", {}, { lab_make_sketch: () => ({ lines: 12 }) });
  assert.equal(ok.result.lines, 12);
  const bad = applyAgentTool(design, "lab_make_sketch", {}, {
    lab_make_sketch: () => {
      throw new Error("boom");
    },
  });
  assert.equal(bad.result.ok, true);
});

test("unknown tools are refused with the list of tools", () => {
  const out = applyAgentTool(emptyDesign(), "rm_rf", {});
  assert.equal(out.result.error, "unknown_tool");
  assert.deepEqual(out.result.tools, AGENT_TOOL_NAMES);
});

test("parsePinRef: dotted strings and objects", () => {
  assert.deepEqual(parsePinRef("hc-sr04-1.TRIG"), { part: "hc-sr04-1", pin: "TRIG" });
  assert.deepEqual(parsePinRef("battery-aa4-1.+"), { part: "battery-aa4-1", pin: "+" });
  assert.deepEqual(parsePinRef({ part: "a", pin: "b" }), { part: "a", pin: "b" });
  for (const bad of ["", "a", ".b", "a.", 4, null, {}, { part: "a" }]) assert.equal(parsePinRef(bad), null);
});

test("benchContext: empty bench, wired bench, and issues listed", () => {
  assert.match(benchContext(emptyDesign()), /banco vacío/);
  const { design } = run([uno(), ["lab_add_part", { type: "hc-sr04" }]]);
  const ctx = benchContext(design);
  assert.match(ctx, /hc-sr04-1/);
  assert.match(ctx, /yellow missing/);
});

test("sanitizeAgentMessages: accepts a real history, rejects junk and prefill", async () => {
  const { sanitizeAgentMessages, WIRE_LIMITS } = await import("../src/models/lab/agentTools.ts");
  const good = [
    { role: "user", content: "hola" },
    { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t1", name: "lab_view", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
  ];
  assert.equal(sanitizeAgentMessages(good)?.length, 3);
  assert.equal(sanitizeAgentMessages([...good, { role: "assistant", content: "prefill" }]), null);
  for (const bad of [null, undefined, "x", [], {}, [{ role: "system", content: "x" }], [{ role: "user", content: "" }], [{ role: "user", content: [] }],
    [{ role: "user", content: [{ type: "image" }] }], [{ role: "user", content: [{ type: "tool_result", content: 3 }] }],
    new Array(WIRE_LIMITS.maxInput + 1).fill({ role: "user", content: "x" })]) {
    assert.equal(sanitizeAgentMessages(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
  const long = sanitizeAgentMessages([{ role: "user", content: "a".repeat(WIRE_LIMITS.text * 2) }]);
  assert.equal((long![0].content as string).length, WIRE_LIMITS.text);
  const cleaned = sanitizeAgentMessages([{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x", evil: 1 }] }]);
  assert.deepEqual(cleaned![0].content, [{ type: "tool_result", tool_use_id: "t", content: "x" }]);
});

// --- Move, rotate, focus ---

test("lab_move: moves a part (wires stay), snaps out of the way, and explains refusals", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "led" }], ["lab_auto_wire", { part: "all" }]]);
  const wires = design.wires.length;
  const moved = applyAgentTool(design, "lab_move", { part: "led-1", x: 20, z: 12 });
  assert.equal(moved.result.ok, true);
  assert.equal(moved.result.adjusted, false);
  assert.deepEqual(moved.action, { kind: "move", part: "led-1", x: 20, z: 12 });
  assert.deepEqual([moved.design.parts[1].x, moved.design.parts[1].z], [20, 12]);
  assert.equal(moved.design.wires.length, wires);

  // Asking for the board's own spot lands the part beside it, not on top
  const clash = applyAgentTool(design, "lab_move", { part: "led-1", x: 0, z: 0 });
  assert.equal(clash.result.ok, true);
  assert.equal(clash.result.adjusted, true);
  const [a, b] = clash.design.parts.map(partBox);
  assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.z - b.z) * 2 >= a.d + b.d);

  // A part is never "in its own way"
  const stay = applyAgentTool(design, "lab_move", { part: "led-1", x: design.parts[1].x, z: design.parts[1].z });
  assert.equal(stay.result.adjusted, false);

  assert.equal(applyAgentTool(design, "lab_move", { part: "ghost", x: 1, z: 1 }).result.error, "unknown_part");
  for (const bad of [{ part: "led-1" }, { part: "led-1", x: "3", z: 1 }, { part: "led-1", x: NaN, z: 1 }, { part: "led-1", x: 1, z: Infinity }]) {
    const out = applyAgentTool(design, "lab_move", bad);
    assert.equal(out.result.error, "bad_position");
    assert.equal(out.design, design);
  }
});

test("lab_rotate turns a quarter at a time and wraps", () => {
  const start = run([uno(), ["lab_add_part", { type: "led" }]]).design;
  const rots = [start];
  for (let i = 0; i < 4; i++) rots.push(applyAgentTool(rots[i], "lab_rotate", { part: "led-1" }).design);
  assert.deepEqual(rots.map((d) => d.parts[1].rot), [0, 1, 2, 3, 0]);
  const out = applyAgentTool(start, "lab_rotate", { part: "led-1" });
  assert.deepEqual(out.action, { kind: "rotate", part: "led-1", rot: 1 });
  assert.equal(applyAgentTool(start, "lab_rotate", { part: "ghost" }).result.error, "unknown_part");
  assert.equal(applyAgentTool(start, "lab_rotate", {}).design, start);
});

test("lab_focus changes nothing and reports where the part is", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "led", x: 20, z: 12 }]]);
  const out = applyAgentTool(design, "lab_focus", { part: "led-1" });
  assert.equal(out.design, design);
  assert.deepEqual(out.action, { kind: "focus", part: "led-1" });
  assert.deepEqual(out.result.at, { x: design.parts[1].x, z: design.parts[1].z });
  assert.equal(applyAgentTool(design, "lab_focus", { part: "ghost" }).result.error, "unknown_part");
  assert.equal(applyAgentTool(design, "lab_focus", { part: "ghost" }).action, undefined);
});

// --- Examples and clearing ---

test("lab_load_example: replaces the bench with each example, green, and refuses unknown names", () => {
  const busy = run([uno(), ["lab_add_part", { type: "led" }]]).design;
  for (const name of EXAMPLE_NAMES) {
    const out = applyAgentTool(busy, "lab_load_example", { name });
    assert.equal(out.result.ok, true, name);
    assert.deepEqual(out.action, { kind: "load", name });
    assert.equal(out.result.replacedParts, 2);
    assert.equal((out.result.check as { level: string }).level, "green", name);
    assert.match(String(out.result.verdict), /^GREEN/);
    assert.equal(checkDesign(out.design).level, "green");
    assert.notEqual(out.design, busy);
  }
  const weather = applyAgentTool(busy, "lab_load_example", { name: "weatherStation" });
  assert.deepEqual((weather.result.parts as { type: string }[]).map((p) => p.type).sort(), ["arduino-uno", "dht22", "oled-128x64"]);
  const plant = applyAgentTool(busy, "lab_load_example", { name: "plantWaterer" });
  assert.deepEqual((plant.result.parts as { type: string }[]).map((p) => p.type).sort(), ["arduino-uno", "led", "relay", "resistor-220", "soil"]);

  for (const bad of [{ name: "nope" }, { name: "__proto__" }, { name: 3 }, {}]) {
    const out = applyAgentTool(busy, "lab_load_example", bad);
    assert.equal(out.result.error, "unknown_example");
    assert.deepEqual(out.result.examples, EXAMPLE_NAMES);
    assert.equal(out.design, busy);
  }
  // The schema offers exactly the examples that exist
  const schema = AGENT_TOOLS.find((t) => t.name === "lab_load_example")!.input_schema.properties.name as { enum: string[] };
  assert.deepEqual(schema.enum, EXAMPLE_NAMES);
});

test("lab_clear empties the bench; an empty bench stays the same object", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "button" }], ["lab_auto_wire", { part: "all" }]]);
  const out = applyAgentTool(design, "lab_clear", {});
  assert.equal(out.design.parts.length + out.design.wires.length, 0);
  assert.deepEqual(out.action, { kind: "clear" });
  assert.equal(out.result.removedParts, 2);
  const again = applyAgentTool(out.design, "lab_clear", {});
  assert.equal(again.design, out.design);
  assert.equal(again.result.alreadyEmpty, true);
  assert.equal(again.action, undefined);
});

// --- Plan and steps ---

test("lab_plan: cleans the plan, bounds it, and reports an action without touching the bench", () => {
  const design = run([uno()]).design;
  const out = applyAgentTool(design, "lab_plan", { goal: "  Estación   del clima ", steps: ["Poner la placa", "", "  ", "Poner el sensor", 5, "Conectar todo"] });
  assert.equal(out.design, design);
  assert.deepEqual(out.action, { kind: "plan", goal: "Estación del clima", steps: ["Poner la placa", "Poner el sensor", "Conectar todo"] });
  assert.equal(out.result.steps, 3);

  const many = parsePlanInput({ goal: "g", steps: Array.from({ length: 30 }, (_, i) => `paso ${i}`) });
  assert.equal(many?.steps.length, PLAN_LIMITS.steps);
  assert.equal(parsePlanInput({ goal: "g".repeat(500), steps: ["a".repeat(500)] })?.goal.length, PLAN_LIMITS.goal);
  assert.equal(parsePlanInput({ goal: "g", steps: ["a".repeat(500)] })?.steps[0].length, PLAN_LIMITS.step);

  for (const bad of [{}, { goal: "g" }, { goal: "g", steps: [] }, { goal: "g", steps: [" ", 3] }, { goal: "", steps: ["a"] }, { goal: "g", steps: "a" }, null]) {
    const refused = applyAgentTool(design, "lab_plan", bad);
    assert.equal(refused.result.error, "bad_plan");
    assert.equal(refused.action, undefined);
  }
});

test("lab_step: a whole index from 0 and a known state", () => {
  const design = emptyDesign();
  assert.deepEqual(applyAgentTool(design, "lab_step", { index: 2, state: "done" }).action, { kind: "step", index: 2, state: "done" });
  assert.deepEqual(parseStepInput({ index: 0, state: "doing" }), { index: 0, state: "doing" });
  for (const bad of [{ index: -1, state: "done" }, { index: 1.5, state: "done" }, { index: "1", state: "done" }, { index: 1, state: "finished" }, { index: PLAN_LIMITS.steps, state: "done" }, { state: "done" }, {}]) {
    const out = applyAgentTool(design, "lab_step", bad);
    assert.equal(out.result.error, "bad_step");
    assert.equal(out.action, undefined);
  }
});

// --- Which part a call is about (where Qubi walks) ---

test("toolPart: the part a call worked on, the non-board end of a wire, nothing for 'all'", () => {
  const ok = (extra: Record<string, unknown>) => ({ ok: true, ...extra });
  assert.equal(toolPart("lab_add_part", { type: "led" }, ok({ id: "led-1" })), "led-1");
  for (const tool of ["lab_move", "lab_rotate", "lab_focus"]) assert.equal(toolPart(tool, {}, ok({ part: "led-1" })), "led-1");
  assert.equal(toolPart("lab_auto_wire", { part: "pir-1" }, ok({})), "pir-1");
  assert.equal(toolPart("lab_auto_wire", { part: "all" }, ok({})), undefined);
  const wire = ok({ from: { part: "arduino-uno-1", pin: "D3" }, to: { part: "led-1", pin: "SIG" } });
  assert.equal(toolPart("lab_connect", {}, wire), "led-1");
  assert.equal(toolPart("lab_connect", {}, ok({ from: { part: "led-1", pin: "SIG" }, to: { part: "arduino-uno-1", pin: "D3" } })), "led-1");
  assert.equal(toolPart("lab_connect", {}, ok({ from: { part: "arduino-uno-1", pin: "5V" }, to: { part: "arduino-uno-1", pin: "GND" } })), "arduino-uno-1");
  assert.equal(toolPart("lab_add_part", {}, { ok: false, id: "led-1" }), undefined);
  assert.equal(toolPart("lab_view", {}, ok({})), undefined);
  assert.equal(toolPart("lab_remove", { part: "led-1" }, ok({})), undefined);
});

// --- The task a plan becomes ---

test("tasks: planning, working, done, and failed only when nothing is left open", () => {
  const task = newTask("t1", "Estación", ["a", "b", "c"]);
  assert.equal(task.state, "planning");
  assert.deepEqual(task.steps.map((s) => s.state), ["pending", "pending", "pending"]);
  const doing = updateTask(task, 0, "doing")!;
  assert.equal(doing.state, "working");
  assert.equal(task.steps[0].state, "pending", "never mutates");
  let t = updateTask(doing, 0, "done")!;
  t = updateTask(t, 1, "failed")!;
  assert.equal(t.state, "working", "a step is still pending");
  t = updateTask(t, 1, "doing")!; // a retry
  assert.equal(t.state, "working");
  t = updateTask(updateTask(t, 1, "done")!, 2, "done")!;
  assert.equal(t.state, "done");
  const failed = updateTask(updateTask(updateTask(task, 0, "done")!, 1, "failed")!, 2, "done")!;
  assert.equal(failed.state, "failed");
  assert.equal(updateTask(task, 3, "done"), null);
  assert.equal(updateTask(task, -1, "done"), null);
  assert.equal(taskState([]), "planning");
});

// --- The rule-based shortcuts (no AI key) ---

const quickCopy: QuickCopy = {
  exampleName: (n) => `<${n}>`,
  loadingExample: (e) => `carga ${e}`,
  chooseExample: (l) => `elige ${l.join("|")}`,
  clearing: "limpio",
};

test("quickRule: clear the bench, load an example by name, list them, and leave the rest alone", () => {
  const calls = (m: string) => quickRule(m, quickCopy)?.toolCalls.map((c) => [c.name, c.input]);
  for (const m of ["limpia el banco", "Vacía la mesa", "quita todo", "borra todo del tablero", "empecemos desde cero", "empezar de nuevo"]) {
    assert.deepEqual(calls(m), [["lab_clear", {}]], m);
  }
  assert.deepEqual(calls("carga el ejemplo de la estación del clima"), [["lab_load_example", { name: "weatherStation" }]]);
  assert.deepEqual(calls("Arma una estación del clima"), [["lab_load_example", { name: "weatherStation" }]]);
  assert.deepEqual(calls("abre el ejemplo del riego"), [["lab_load_example", { name: "plantWaterer" }]]);
  assert.deepEqual(calls("hazme un sistema de riego"), [["lab_load_example", { name: "plantWaterer" }]]);
  assert.deepEqual(calls("carga el sensor de estacionamiento"), [["lab_load_example", { name: "parkingSensor" }]]);
  const list = quickRule("carga un ejemplo", quickCopy)!;
  assert.deepEqual(list.toolCalls, []);
  assert.match(list.text, /parkingSensor.*weatherStation.*plantWaterer/);
  // Not shortcuts: adding one part, removing one part, reading the clima without asking for a build
  for (const m of ["ponle un sensor de temperatura", "quita el sensor", "quita los cables", "qué clima hace", "revisa mis conexiones", "carga el código", ""]) {
    assert.equal(quickRule(m, quickCopy), null, m);
  }
});
