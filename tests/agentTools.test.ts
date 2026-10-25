import test from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS } from "../src/models/lab/catalog.ts";
import { emptyDesign, checkDesign, type Design } from "../src/models/lab/circuit.ts";
import { AGENT_TOOLS, AGENT_TOOL_NAMES, applyAgentTool, benchContext, parsePinRef, resultText } from "../src/models/lab/agentTools.ts";

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

test("the schemas: nine tools, unique names, valid object schemas", () => {
  assert.equal(AGENT_TOOLS.length, 9);
  assert.equal(new Set(AGENT_TOOL_NAMES).size, 9);
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
    ["lab_add_part", { type: "led" }],
    ["lab_connect", { from: "led-1.SIG", to: "arduino-uno-1.D3" }],
    ["lab_connect", { from: "led-1.GND", to: "arduino-uno-1.GND" }],
  ]);
  assert.equal(design.wires.length, 2);
  assert.equal(outcomes[2].result.ok, true);
  assert.deepEqual(outcomes[2].action, { kind: "connect", wire: "w1", from: { part: "led-1", pin: "SIG" }, to: { part: "arduino-uno-1", pin: "D3" } });
  assert.equal((outcomes[3].result.check as { level: string }).level, "green");
});

test("lab_connect: refusals are explained", () => {
  const { design } = run([uno(), ["lab_add_part", { type: "led" }], ["lab_connect", { from: "led-1.SIG", to: "arduino-uno-1.D3" }]]);
  const dup = applyAgentTool(design, "lab_connect", { from: "arduino-uno-1.D3", to: "led-1.SIG" });
  assert.equal(dup.result.error, "duplicate");
  assert.match(String(dup.result.meaning), /already/);
  const same = applyAgentTool(design, "lab_connect", { from: "led-1.SIG", to: "led-1.SIG" });
  assert.equal(same.result.error, "same");
  const noPart = applyAgentTool(design, "lab_connect", { from: "ghost.SIG", to: "arduino-uno-1.D3" });
  assert.equal(noPart.result.error, "unknown_part");
  assert.deepEqual(noPart.result.parts, ["arduino-uno-1", "led-1"]);
  const noPin = applyAgentTool(design, "lab_connect", { from: "led-1.NOPE", to: "arduino-uno-1.D3" });
  assert.equal(noPin.result.error, "unknown_pin");
  assert.deepEqual(noPin.result.pins, ["SIG", "GND"]);
  const badRef = applyAgentTool(design, "lab_connect", { from: "led-1", to: "arduino-uno-1.D3" });
  assert.equal(badRef.result.error, "bad_pin_ref");
  for (const out of [dup, same, noPart, noPin, badRef]) {
    assert.equal(out.design, design);
    assert.equal(out.action, undefined);
  }
});

test("lab_connect: a dangerous wire is drawn but the result says RED with the issue", () => {
  const { design, outcomes } = run([
    uno(),
    ["lab_add_part", { type: "led" }],
    ["lab_connect", { from: "led-1.GND", to: "arduino-uno-1.5V" }],
    ["lab_connect", { from: "arduino-uno-1.5V", to: "arduino-uno-1.GND" }],
  ]);
  assert.equal(design.wires.length, 2);
  const result = outcomes[3].result as unknown as { check: { level: string; issues: { key: string; meaning: string }[] }; verdict: string };
  assert.equal(result.check.level, "red");
  assert.ok(result.check.issues.some((i) => i.key === "short" && i.meaning.length > 10));
  assert.match(result.verdict, /^RED/);
  assert.equal(checkDesign(design).level, "red");
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
  const { design } = run([uno(), ["lab_add_part", { type: "led" }], ["lab_auto_wire", { part: "all" }]]);
  assert.equal(design.wires.length, 2);
  const noWire = applyAgentTool(design, "lab_remove", { wire: "w1" });
  assert.equal(noWire.design.wires.length, 1);
  assert.deepEqual(noWire.action, { kind: "remove", wire: "w1" });
  const noPart = applyAgentTool(design, "lab_remove", { part: "led-1" });
  assert.equal(noPart.design.parts.length, 1);
  assert.equal(noPart.design.wires.length, 0);
  assert.equal(applyAgentTool(design, "lab_remove", {}).result.error, "give_one");
  assert.equal(applyAgentTool(design, "lab_remove", { part: "led-1", wire: "w1" }).result.error, "give_one");
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
  const red = run([uno(), ["lab_add_part", { type: "led" }], ["lab_connect", { from: "led-1.GND", to: "arduino-uno-1.5V" }], ["lab_connect", { from: "arduino-uno-1.5V", to: "arduino-uno-1.GND" }]]).design;
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
    new Array(WIRE_LIMITS.messages + 1).fill({ role: "user", content: "x" })]) {
    assert.equal(sanitizeAgentMessages(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
  const long = sanitizeAgentMessages([{ role: "user", content: "a".repeat(WIRE_LIMITS.text * 2) }]);
  assert.equal((long![0].content as string).length, WIRE_LIMITS.text);
  const cleaned = sanitizeAgentMessages([{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x", evil: 1 }] }]);
  assert.deepEqual(cleaned![0].content, [{ type: "tool_result", tool_use_id: "t", content: "x" }]);
});
