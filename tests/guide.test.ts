import test from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS, componentOf } from "../src/models/lab/catalog.ts";
import { addPart, autoWire, checkDesign, connect, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { compatiblePins, firstPending, guideSteps, pinAbilities, pinRole, pinStatuses, suggestWires, type ReasonKey } from "../src/models/lab/guide.ts";
import { pinsCopy } from "../src/views/copy/pins.ts";

function bench(...types: string[]): Design {
  let d = emptyDesign();
  types.forEach((t, i) => (d = addPart(d, t, { x: i * 10 }).design));
  return d;
}
const REF = (part: string, pin: string) => ({ part, pin });

test("every pin of every catalog part has a role", () => {
  for (const c of COMPONENTS) for (const p of c.pins) assert.ok(pinRole(c.id, p.id), `${c.id}.${p.id}`);
  assert.equal(pinRole("nope", "X"), null);
  assert.equal(pinRole("hc-sr04", "NOPE"), null);
});

test("roles of the sensors and the boards", () => {
  assert.equal(pinRole("hc-sr04", "TRIG"), "trigger");
  assert.equal(pinRole("hc-sr04", "ECHO"), "echo");
  assert.equal(pinRole("hc-sr04", "VCC"), "power");
  assert.equal(pinRole("hc-sr04", "GND"), "ground");
  assert.equal(pinRole("servo-sg90", "SIG"), "pwm");
  assert.equal(pinRole("soil", "AOUT"), "analog-in");
  assert.equal(pinRole("oled-128x64", "SDA"), "sda");
  assert.equal(pinRole("oled-128x64", "SCL"), "scl");
  assert.equal(pinRole("battery-aa4", "+"), "vin");
  assert.equal(pinRole("battery-aa4", "-"), "ground");
  assert.equal(pinRole("button", "SIG"), "signal-in");
  assert.equal(pinRole("relay", "IN"), "signal-out");
  assert.equal(pinRole("l298n", "ENA"), "pwm");
  assert.equal(pinRole("arduino-uno", "5V"), "board-5v");
  assert.equal(pinRole("arduino-uno", "3V3"), "board-3v3");
  assert.equal(pinRole("arduino-uno", "VIN"), "board-vin");
  assert.equal(pinRole("arduino-uno", "GND"), "board-gnd");
  assert.equal(pinRole("arduino-uno", "D2"), "board-digital");
  assert.equal(pinRole("arduino-uno", "D3"), "board-pwm");
  assert.equal(pinRole("arduino-uno", "A0"), "board-analog");
  assert.equal(pinRole("arduino-uno", "A4"), "board-sda");
  assert.equal(pinRole("arduino-uno", "A5"), "board-scl");
  assert.equal(pinRole("esp32-devkit", "GPIO34"), "board-analog");
  assert.deepEqual(pinAbilities("arduino-uno", "A4"), ["analog", "digital", "sda"]);
  assert.deepEqual(pinAbilities("led", "SIG"), []);
});

test("the copy explains every part and every pin, and every reason key", () => {
  for (const c of COMPONENTS) {
    const text = pinsCopy.parts[c.id];
    assert.ok(text?.does, `${c.id} does`);
    if (c.kind === "part") for (const p of c.pins) assert.ok(text.pins[p.id]?.name && text.pins[p.id]?.does, `${c.id}.${p.id}`);
  }
  for (const c of COMPONENTS) for (const p of c.pins) {
    const role = pinRole(c.id, p.id)!;
    if (c.kind === "board") assert.ok((pinsCopy.board as Record<string, unknown>)[role], role);
    else assert.ok((pinsCopy.roles as Record<string, unknown>)[role], role);
  }
  const keys: ReasonKey[] = [
    "power-5v", "power-3v3", "power-3v3-logic", "power-vin", "ground", "signal-digital", "signal-pwm", "signal-analog", "bus-sda", "bus-scl",
    "fine", "special", "delicate", "levelShift", "budget", "partLink",
    "wrongKind", "signalToPart", "taken", "overvoltage", "undervoltage", "short", "mixedPower", "boardToBoard", "already",
  ];
  for (const k of keys) assert.equal(typeof pinsCopy.reasons[k]({ pin: "A", target: "B" }), "string", k);
  assert.match(pinsCopy.parts["hc-sr04"].pins.TRIG.does, /lance el sonido/);
  assert.match(pinsCopy.parts["hc-sr04"].pins.ECHO.does, /eco/i);
});

test("suggestWires is exactly what autoWire adds, and changes nothing", () => {
  const d = bench("arduino-uno", "hc-sr04", "led", "servo-sg90");
  const before = JSON.stringify(d);
  const planned = suggestWires(d);
  assert.equal(JSON.stringify(d), before);
  const wired = autoWire(autoWire(autoWire(d, "hc-sr04-1").design, "led-1").design, "servo-sg90-1");
  assert.deepEqual(
    planned.map((s) => [s.from, s.to]),
    wired.design.wires.map((w) => [w.from, w.to]),
  );
  assert.ok(planned.every((s) => s.reasonKey));
});

test("suggestions explain why: power, ground, signals by what the pin needs", () => {
  const d = bench("arduino-uno", "hc-sr04", "servo-sg90", "soil", "oled-128x64");
  const why = (part: string, pin: string, list = suggestWires(d)) => list.find((s) => s.from.part === part && s.from.pin === pin)?.reasonKey;
  assert.equal(why("hc-sr04-1", "VCC"), "power-5v");
  assert.equal(why("hc-sr04-1", "GND"), "ground");
  assert.equal(why("hc-sr04-1", "TRIG"), "signal-digital");
  assert.equal(why("servo-sg90-1", "SIG"), "signal-pwm");
  assert.equal(why("soil-1", "AOUT"), "signal-analog");
  assert.equal(why("oled-128x64-1", "SDA"), "bus-sda");
  assert.equal(why("oled-128x64-1", "SCL"), "bus-scl");
});

test("a 3.3 V board explains the 3.3 V pick, and the 5 V echo gets a divider note", () => {
  const d = bench("esp32-devkit", "oled-128x64", "hc-sr04");
  const list = suggestWires(d);
  assert.equal(list.find((s) => s.from.part === "oled-128x64-1" && s.from.pin === "VCC")?.reasonKey, "power-3v3-logic");
  assert.equal(list.find((s) => s.from.pin === "ECHO")?.noteKey, "levelDivider");
  assert.equal(list.find((s) => s.from.pin === "TRIG")?.noteKey, null);
  // The LED's signal goes through a resistor: board pin -> resistor A, resistor B -> LED
  const led = suggestWires(bench("arduino-uno", "led"));
  assert.deepEqual(led.slice(0, 2).map((s) => [s.from.part, s.from.pin, s.to.part, s.to.pin, s.reasonKey]), [
    ["resistor-220-1", "A", "arduino-uno-1", "D2", "resistorIn"],
    ["resistor-220-1", "B", "led-1", "SIG", "resistorOut"],
  ]);
});

test("suggestWires for a part, a board, nothing, or something that is not there", () => {
  const d = bench("arduino-uno", "led", "buzzer");
  assert.deepEqual(new Set(suggestWires(d, "led-1").map((s) => s.from.part)), new Set(["resistor-220-1", "led-1"]));
  assert.equal(suggestWires(d, "arduino-uno-1").length, suggestWires(d).length);
  assert.deepEqual(suggestWires(d, "nope"), []);
  assert.deepEqual(suggestWires(bench("led")), []); // no board: nothing to wire to
  assert.deepEqual(suggestWires(bench("arduino-uno")), []);
});

test("compatiblePins: the best pin is what autoWire chooses, the rest are ranked", () => {
  const d = bench("arduino-uno", "led", "hc-sr04");
  const list = compatiblePins(d, REF("hc-sr04-1", "TRIG"));
  const expected = suggestWires(d, "hc-sr04-1").find((s) => s.from.pin === "TRIG")!.to;
  const bests = list.filter((c) => c.fit === "best");
  assert.deepEqual(bests.map((c) => [c.part, c.pin]), [[expected.part, expected.pin]]);
  assert.equal(list[0].fit, "best");
  const rank = { best: 0, ok: 1, bad: 2 };
  assert.ok(list.every((c, i) => i === 0 || rank[list[i - 1].fit] <= rank[c.fit]));
  assert.ok(list.every((c) => c.part !== "hc-sr04-1")); // pins of the same part are left out
  assert.equal(list.length, componentOf("arduino-uno")!.pins.length + componentOf("led")!.pins.length);
});

test("compatiblePins marks as bad exactly what would make the checker complain", () => {
  const d = bench("arduino-uno", "led", "hc-sr04", "servo-sg90");
  for (const from of [REF("hc-sr04-1", "VCC"), REF("hc-sr04-1", "TRIG"), REF("servo-sg90-1", "SIG"), REF("led-1", "GND"), REF("arduino-uno-1", "D5")]) {
    const base = new Set(checkDesign(d).issues.map((i) => `${i.key}${i.part}${i.pin}`));
    for (const c of compatiblePins(d, from)) {
      const joined = connect(d, from, REF(c.part, c.pin));
      const fresh = checkDesign(joined.design).issues.filter((i) => !base.has(`${i.key}${i.part}${i.pin}`));
      const hard = fresh.some((i) => ["short", "mixedPower", "overvoltage", "undervoltage", "wrongPin", "pinShared", "ledNoResistor", "i2cDuplicate", "externalPower", "inputOnly"].includes(i.key));
      if (c.part === from.part) continue;
      const bothParts = componentOf(d.parts.find((p) => p.id === c.part)!.type)!.kind === "part" && componentOf(d.parts.find((p) => p.id === from.part)!.type)!.kind === "part";
      if (!bothParts) assert.equal(c.fit === "bad", hard, `${from.part}.${from.pin} -> ${c.part}.${c.pin} ${c.fit} ${c.reasonKey}`);
    }
  }
});

test("compatiblePins: concrete verdicts", () => {
  const d = bench("arduino-uno", "hc-sr04", "servo-sg90", "led");
  const verdict = (from: [string, string], to: [string, string]) => compatiblePins(d, REF(...from)).find((c) => c.part === to[0] && c.pin === to[1])!;
  assert.equal(verdict(["hc-sr04-1", "VCC"], ["arduino-uno-1", "5V"]).fit, "best");
  assert.equal(verdict(["hc-sr04-1", "VCC"], ["arduino-uno-1", "3V3"]).fit, "bad"); // needs 5 V
  assert.equal(verdict(["hc-sr04-1", "VCC"], ["arduino-uno-1", "D2"]).fit, "bad");
  assert.equal(verdict(["hc-sr04-1", "VCC"], ["arduino-uno-1", "GND"]).reasonKey, "wrongKind");
  assert.equal(verdict(["servo-sg90-1", "SIG"], ["arduino-uno-1", "D2"]).fit, "bad"); // no PWM there
  assert.equal(verdict(["servo-sg90-1", "SIG"], ["arduino-uno-1", "D3"]).fit, "best");
  assert.equal(verdict(["servo-sg90-1", "SIG"], ["arduino-uno-1", "D5"]).fit, "ok");
  assert.equal(verdict(["led-1", "SIG"], ["arduino-uno-1", "5V"]).fit, "bad");
  assert.equal(verdict(["led-1", "GND"], ["arduino-uno-1", "GND"]).fit, "best");
  assert.equal(verdict(["led-1", "SIG"], ["led-1", "SIG"] as [string, string])?.fit, undefined);
  // a 3.3 V part on a 5 V pin
  const e = bench("esp32-devkit", "dht22");
  assert.equal(compatiblePins(e, REF("dht22-1", "VCC")).find((c) => c.pin === "3V3")!.fit, "best");
  assert.equal(compatiblePins(e, REF("dht22-1", "VCC")).find((c) => c.pin === "5V")!.fit, "ok");
});

test("compatiblePins: a pin another part already uses is bad, and a board pin finds the part pin that wants it", () => {
  let d = bench("arduino-uno", "led", "buzzer");
  d = connect(d, REF("led-1", "SIG"), REF("arduino-uno-1", "D2")).design;
  const buzzer = compatiblePins(d, REF("buzzer-1", "SIG")).find((c) => c.pin === "D2")!;
  assert.deepEqual([buzzer.fit, buzzer.reasonKey], ["bad", "taken"]);
  const fromBoard = compatiblePins(bench("arduino-uno", "led"), REF("arduino-uno-1", "5V"));
  assert.ok(fromBoard.every((c) => c.part === "led-1"));
  assert.ok(fromBoard.every((c) => c.fit === "bad")); // a LED takes no power pin
  const d3 = compatiblePins(bench("arduino-uno", "led"), REF("arduino-uno-1", "D2"));
  // A bare LED on a board pin would be red (R4): the guide says so
  assert.deepEqual([d3.find((c) => c.pin === "SIG")!.fit, d3.find((c) => c.pin === "SIG")!.reasonKey], ["bad", "noResistor"]);
  assert.equal(d3.find((c) => c.pin === "GND")!.fit, "bad");
});

test("compatiblePins between parts: ground to ground and supply to supply only", () => {
  const d = bench("arduino-uno", "battery-aa4", "servo-sg90");
  const list = compatiblePins(d, REF("battery-aa4-1", "-"));
  assert.equal(list.find((c) => c.part === "servo-sg90-1" && c.pin === "GND")!.reasonKey, "partLink");
  assert.equal(list.find((c) => c.part === "servo-sg90-1" && c.pin === "SIG")!.fit, "bad");
  assert.equal(list.find((c) => c.part === "servo-sg90-1" && c.pin === "VCC")!.fit, "bad");
  assert.equal(compatiblePins(d, REF("battery-aa4-1", "+")).find((c) => c.part === "arduino-uno-1" && c.pin === "VIN")!.fit, "best");
});

test("a 3.3 V board makes the 5 V echo work but needs a divider; strapping pins are delicate", () => {
  const d = bench("esp32-devkit", "hc-sr04");
  const echo = compatiblePins(d, REF("hc-sr04-1", "ECHO"));
  assert.ok(echo.some((c) => c.reasonKey === "levelShift" || c.fit === "best"));
  const gpio12 = echo.find((c) => c.pin === "GPIO12")!;
  assert.ok(["delicate", "levelShift"].includes(gpio12.reasonKey));
});

test("compatiblePins of an unknown pin is empty", () => {
  assert.deepEqual(compatiblePins(bench("arduino-uno"), REF("nope", "X")), []);
});

test("guideSteps: power first, then ground, then signals; done steps are marked", () => {
  const d = bench("arduino-uno", "hc-sr04");
  let steps = guideSteps(d, "hc-sr04-1");
  assert.deepEqual(steps.map((s) => s.from.pin), ["VCC", "GND", "TRIG", "ECHO"]);
  assert.ok(steps.every((s) => !s.done));
  assert.deepEqual(steps.map((s) => s.reasonKey), ["power-5v", "ground", "signal-digital", "signal-digital"]);
  const first = steps[0];
  const wired = connect(d, first.from, first.to).design;
  steps = guideSteps(wired, "hc-sr04-1");
  assert.deepEqual(steps.map((s) => s.done), [true, false, false, false]);
  assert.equal(firstPending(steps), 1);
  assert.deepEqual(steps[0].to, first.to);
  // the whole part wired: all done, and firstPending is the last step
  const all = autoWire(d, "hc-sr04-1").design;
  const done = guideSteps(all, "hc-sr04-1");
  assert.ok(done.every((s) => s.done));
  assert.equal(firstPending(done), done.length - 1);
});

test("guideSteps: a battery wires + before -, a board or no board gives no steps", () => {
  const d = bench("arduino-uno", "battery-aa4");
  assert.deepEqual(guideSteps(d, "battery-aa4-1").map((s) => s.from.pin), ["+", "-"]);
  assert.deepEqual(guideSteps(d, "arduino-uno-1"), []);
  assert.deepEqual(guideSteps(bench("led"), "led-1"), []);
  assert.deepEqual(guideSteps(d, "nope"), []);
});

test("a step wired by hand to another pin counts as done and keeps that pin", () => {
  let d = bench("arduino-uno", "led");
  d = connect(d, REF("led-1", "SIG"), REF("arduino-uno-1", "D9")).design;
  const step = guideSteps(d, "led-1").find((s) => s.from.pin === "SIG")!;
  assert.equal(step.done, true);
  assert.equal(step.to.pin, "D9");
});

test("pinStatuses tells what each pin is wired to", () => {
  let d = bench("arduino-uno", "led");
  d = connect(d, REF("led-1", "GND"), REF("arduino-uno-1", "GND")).design;
  const status = pinStatuses(d, "led-1");
  assert.deepEqual(status.map((s) => [s.pin, s.role, s.wiredTo?.pin ?? null]), [["SIG", "signal-out", null], ["GND", "ground", "GND"]]);
  assert.deepEqual(pinStatuses(d, "nope"), []);
});
