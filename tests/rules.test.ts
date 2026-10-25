import test from "node:test";
import assert from "node:assert/strict";
import { RULE_CODES, addPart, autoWire, boardPinsOf, checkDesign, connect, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { blinkButton } from "../src/models/lab/examples.ts";
import { guideSteps, suggestWires } from "../src/models/lab/guide.ts";
import { simulate } from "../src/models/lab/simulation.ts";
import { sketchFor } from "../src/models/lab/sketch.ts";
import { labCopy } from "../src/views/copy/lab.ts";
import { pinsCopy } from "../src/views/copy/pins.ts";

function bench(board: string, ...types: string[]): Design {
  let d = addPart(emptyDesign(), board).design;
  types.forEach((t, i) => (d = addPart(d, t, { x: 8 * (i + 1) }).design));
  return d;
}
function wires(d: Design, ...pairs: [string, string][]): Design {
  for (const [a, b] of pairs) {
    const [pa, pina] = a.split(".");
    const [pb, pinb] = b.split(".");
    d = connect(d, { part: pa, pin: pina }, { part: pb, pin: pinb }).design;
  }
  return d;
}
const issues = (d: Design) => checkDesign(d).issues.map((i) => `${i.code}:${i.key}`);

test("every issue carries its rule code", () => {
  const d = wires(bench("arduino-uno", "led"), ["led-1.SIG", "arduino-uno-1.D13"]);
  const check = checkDesign(d);
  assert.ok(check.issues.length > 0);
  for (const i of check.issues) assert.equal(i.code, RULE_CODES[i.key]);
  assert.equal(RULE_CODES.ledNoResistor, "R4");
  assert.equal(RULE_CODES.i2cDuplicate, "R10");
  assert.equal(RULE_CODES.externalPower, "R14");
  assert.equal(RULE_CODES.pinCurrent, "R15");
  assert.equal(RULE_CODES.strapping, "R7");
  assert.equal(RULE_CODES.inputOnly, "R8");
});

test("R4: a bare LED on a board pin is red; through the resistor it is green", () => {
  const bare = wires(bench("arduino-uno", "led"), ["led-1.SIG", "arduino-uno-1.D13"], ["led-1.GND", "arduino-uno-1.GND"]);
  const check = checkDesign(bare);
  assert.equal(check.level, "red");
  assert.deepEqual(check.issues.map((i) => [i.code, i.key, i.part, i.pin, i.boardPin]), [["R4", "ledNoResistor", "led-1", "SIG", "D13"]]);
  const safe = wires(bench("arduino-uno", "led", "resistor-220"), ["arduino-uno-1.D13", "resistor-220-1.A"], ["resistor-220-1.B", "led-1.SIG"], ["led-1.GND", "arduino-uno-1.GND"]);
  assert.equal(checkDesign(safe).level, "green");
  // The resistor's A alone does not make the LED safe: the LED's own signal is still on the board pin
  assert.deepEqual(issues(wires(bench("arduino-uno", "led", "resistor-220"), ["led-1.SIG", "arduino-uno-1.D13"])).filter((s) => s.startsWith("R4")), ["R4:ledNoResistor"]);
  // A resistor that is wired but on neither side of the LED's pin does not count either way
  assert.ok(!issues(wires(bench("arduino-uno", "led", "resistor-220"), ["resistor-220-1.B", "led-1.SIG"])).includes("R4:ledNoResistor"));
  assert.match(labCopy.check.issues.ledNoResistor(), /El LED no tiene resistencia: se puede quemar\. Usa 220 Ω\./);
});

test("the resistor passes the signal: the board pin reaches the LED through it", () => {
  const d = autoWire(bench("arduino-uno", "led"), "led-1").design;
  const links = boardPinsOf(d, "led-1");
  assert.ok(links.SIG && links.SIG.board === "arduino-uno-1" && /^D\d+$/.test(links.SIG.pin));
  assert.deepEqual(boardPinsOf(d, "resistor-220-1").A, links.SIG);
  // No wrongPin / pinShared / missing from the resistor's two ends
  assert.equal(checkDesign(d).level, "green");
});

test("autoWire of an LED places and wires its resistor next to it, once", () => {
  const start = bench("arduino-uno", "led");
  const done = autoWire(start, "led-1");
  assert.deepEqual(done.addedParts, ["resistor-220-1"]);
  assert.equal(done.added.length, 3);
  assert.deepEqual(done.missing, []);
  const led = done.design.parts.find((p) => p.id === "led-1")!;
  const resistor = done.design.parts.find((p) => p.id === "resistor-220-1")!;
  assert.ok(Math.hypot(led.x - resistor.x, led.z - resistor.z) < 6, "next to the LED");
  assert.equal(autoWire(done.design, "led-1").added.length, 0);
  assert.equal(autoWire(done.design, "led-1").addedParts.length, 0);
  // A free resistor on the bench is used instead of a new one
  const spare = autoWire(bench("arduino-uno", "led", "resistor-220"), "led-1");
  assert.deepEqual(spare.addedParts, []);
  assert.equal(spare.design.parts.length, 3);
  assert.equal(checkDesign(spare.design).level, "green");
  // Two LEDs get two resistors and two different pins
  const two = autoWire(autoWire(bench("arduino-uno", "led", "led"), "led-1").design, "led-2").design;
  assert.equal(two.parts.filter((p) => p.type === "resistor-220").length, 2);
  assert.equal(checkDesign(two).level, "green");
  // Autowiring the resistor on its own wires only its A
  const alone = autoWire(bench("arduino-uno", "resistor-220"), "resistor-220-1");
  assert.equal(alone.added.length, 1);
  assert.deepEqual(alone.missing, ["B"]);
  // On a 3.3 V board too
  assert.equal(checkDesign(autoWire(bench("esp32-devkit", "led"), "led-1").design).level, "green");
});

test("the guide and the suggestions include the resistor, with a reason for each step", () => {
  const d = bench("arduino-uno", "led");
  const steps = guideSteps(d, "led-1");
  // Ground first, then the signal: the resistor's two steps
  assert.deepEqual(steps.map((s) => [s.from.part, s.from.pin, s.to.part, s.reasonKey, s.done]), [
    ["led-1", "GND", "arduino-uno-1", "ground", false],
    ["resistor-220-1", "A", "arduino-uno-1", "resistorIn", false],
    ["resistor-220-1", "B", "led-1", "resistorOut", false],
  ]);
  for (const s of steps) {
    const reason = (pinsCopy.reasons as Record<string, (w: { pin: string; target: string }) => string>)[s.reasonKey];
    assert.ok(reason({ pin: s.from.pin, target: s.to.pin }).length > 10, s.reasonKey);
  }
  assert.equal(suggestWires(d).length, 3);
  // Once wired the same steps are done (the order keeps: resistor first)
  const wired = autoWire(d, "led-1").design;
  const after = guideSteps(wired, "led-1");
  assert.deepEqual(after.map((s) => s.done), [true, true, true]);
  assert.deepEqual(after.map((s) => s.reasonKey), ["ground", "resistorIn", "resistorOut"]);
  // Half way: the resistor placed and wired to the board, the LED still apart
  const half = wires(bench("arduino-uno", "led", "resistor-220"), ["resistor-220-1.A", "arduino-uno-1.D2"]);
  const halfSteps = guideSteps(half, "led-1");
  assert.deepEqual(halfSteps.map((s) => [s.reasonKey, s.done]), [["ground", false], ["resistorIn", true], ["resistorOut", false]]);
});

test("R10: two displays of the same type on one bus are red; two different types are fine", () => {
  const same = autoWire(autoWire(bench("arduino-uno", "oled-128x64", "oled-128x64"), "oled-128x64-1").design, "oled-128x64-2").design;
  const check = checkDesign(same);
  assert.equal(check.level, "red");
  assert.deepEqual(check.issues.filter((i) => i.key === "i2cDuplicate").map((i) => [i.code, i.part, i.board]), [["R10", "oled-128x64-2", "arduino-uno-1"]]);
  const mixed = autoWire(autoWire(bench("arduino-uno", "oled-128x64", "lcd-1602-i2c"), "oled-128x64-1").design, "lcd-1602-i2c-1").design;
  assert.equal(checkDesign(mixed).level, "green");
  // Only one of them wired: no clash yet
  assert.ok(!issues(autoWire(bench("arduino-uno", "oled-128x64", "oled-128x64"), "oled-128x64-1").design).includes("R10:i2cDuplicate"));
});

test("R14: servos on the board's 5 V whose peak is beyond what it gives are red; a battery fixes it", () => {
  const one = autoWire(bench("arduino-uno", "servo-sg90"), "servo-sg90-1").design;
  assert.equal(checkDesign(one).level, "green");
  const two = autoWire(autoWire(bench("arduino-uno", "servo-sg90", "servo-sg90"), "servo-sg90-1").design, "servo-sg90-2").design;
  const check = checkDesign(two);
  assert.equal(check.level, "red");
  const issue = check.issues.find((i) => i.key === "externalPower")!;
  assert.deepEqual([issue.code, issue.level, issue.board, issue.usedMa, issue.budgetMa], ["R14", "red", "arduino-uno-1", 1000, 500]);
  // Powered from the battery pack, with a common ground
  const fed = wires(
    bench("arduino-uno", "servo-sg90", "servo-sg90", "battery-aa4"),
    ["servo-sg90-1.SIG", "arduino-uno-1.D9"], ["servo-sg90-2.SIG", "arduino-uno-1.D10"],
    ["servo-sg90-1.VCC", "battery-aa4-1.+"], ["servo-sg90-2.VCC", "battery-aa4-1.+"],
    ["servo-sg90-1.GND", "arduino-uno-1.GND"], ["servo-sg90-2.GND", "arduino-uno-1.GND"], ["battery-aa4-1.-", "arduino-uno-1.GND"],
  );
  assert.equal(checkDesign(fed).level, "green");
});

test("R15: a buzzer straight on a pin pulls 30 mA: yellow with the numbers", () => {
  const d = autoWire(bench("arduino-uno", "buzzer"), "buzzer-1").design;
  const check = checkDesign(d);
  assert.equal(check.level, "yellow");
  const issue = check.issues.find((i) => i.key === "pinCurrent")!;
  assert.deepEqual([issue.code, issue.part, issue.usedMa, issue.budgetMa], ["R15", "buzzer-1", 30, 20]);
  // An LED behind its resistor is far under the limit
  assert.ok(!issues(autoWire(bench("arduino-uno", "led"), "led-1").design).some((s) => s.startsWith("R15")));
});

test("R7: an ESP32 boot pin in use is yellow", () => {
  const d = wires(bench("esp32-devkit", "led", "resistor-220"), ["resistor-220-1.A", "esp32-devkit-1.GPIO2"], ["resistor-220-1.B", "led-1.SIG"], ["led-1.GND", "esp32-devkit-1.GND"]);
  const check = checkDesign(d);
  assert.equal(check.level, "yellow");
  assert.deepEqual(check.issues.map((i) => [i.code, i.key, i.boardPin]), [["R7", "strapping", "GPIO2"]]);
  const gpio5 = wires(bench("esp32-devkit", "button"), ["button-1.SIG", "esp32-devkit-1.GPIO5"], ["button-1.GND", "esp32-devkit-1.GND"]);
  assert.deepEqual(issues(gpio5), ["R7:strapping"]);
  // Not on an Uno
  assert.equal(checkDesign(autoWire(bench("arduino-uno", "button"), "button-1").design).level, "green");
});

test("R8: an ESP32 input-only pin used as an output is red; reading from it is fine", () => {
  const out = wires(bench("esp32-devkit", "servo-sg90"), ["servo-sg90-1.SIG", "esp32-devkit-1.GPIO34"]);
  const bad = checkDesign(out).issues.find((i) => i.key === "inputOnly")!;
  assert.deepEqual([bad.code, bad.level, bad.boardPin], ["R8", "red", "GPIO34"]);
  const read = checkDesign(wires(bench("esp32-devkit", "button"), ["button-1.SIG", "esp32-devkit-1.GPIO34"]));
  assert.ok(!read.issues.some((i) => i.key === "inputOnly"));
});

test("autoWire on an ESP32 keeps its signals off the boot pins", () => {
  let d = bench("esp32-devkit", "button", "button", "button", "button", "button", "button", "button", "button");
  for (let n = 1; n <= 8; n++) d = autoWire(d, `button-${n}`).design;
  const used = d.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === "esp32-devkit-1" && e.pin.startsWith("GPIO")).map((e) => e.pin);
  assert.equal(used.length, 8);
  for (const boot of ["GPIO0", "GPIO2", "GPIO5", "GPIO12", "GPIO15"]) assert.ok(!used.includes(boot), boot);
  assert.ok(!issues(d).includes("R7:strapping"));
});

test("every new rule has its words in plain Spanish", () => {
  const text = labCopy.check.issues;
  for (const line of [text.ledNoResistor(), text.i2cDuplicate("OLED"), text.externalPower("Servo", 1000, 500), text.pinCurrent("Zumbador", "SIG", "D3"), text.strapping("LED", "SIG", "GPIO2"), text.inputOnly("Servo", "SIG", "GPIO34")]) {
    assert.ok(line.length > 20);
  }
  for (const key of ["ledNoResistor", "i2cDuplicate", "externalPower", "pinCurrent", "strapping", "inputOnly"] as const) assert.ok(labCopy.check.fixes[key].length > 10, key);
});

test("blinkButton: Uno, button, LED and resistor; green; the LED follows the button", () => {
  const d = blinkButton();
  assert.deepEqual(d.parts.map((p) => p.type).sort(), ["arduino-uno", "button", "led", "resistor-220"]);
  assert.equal(checkDesign(d).level, "green");
  const ids = { led: d.parts.find((p) => p.type === "led")!.id, button: d.parts.find((p) => p.type === "button")!.id };
  for (const [t, pressed] of [[0, true], [250, true], [1000, false], [2000, false], [3100, true]] as const) {
    const sim = simulate(d, t).parts;
    assert.deepEqual(sim[ids.button], { kind: "button", pressed });
    assert.deepEqual(sim[ids.led], { kind: "led", on: pressed }, `t=${t}`);
  }
  const resistor = simulate(d, 0).parts["resistor-220-1"];
  assert.ok(!resistor.dead);
  // The sketch reads the button and drives the LED on the pin behind its resistor; the resistor itself has no code
  const sketch = sketchFor(d);
  assert.equal(sketch.ok, true);
  assert.deepEqual(sketch.skipped, []);
  const pin = boardPinsOf(d, ids.led).SIG!.pin.slice(1);
  assert.match(sketch.code, new RegExp(`const int LED_1_SIG = ${pin};`));
  assert.match(sketch.code, /digitalRead\(BOTON_1_SIG\)/);
  assert.doesNotMatch(sketch.code, /PIEZA/);
});
