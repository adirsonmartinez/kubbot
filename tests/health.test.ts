import test from "node:test";
import assert from "node:assert/strict";
import { healthOf } from "../src/models/lab/health.ts";
import { checkDesign, emptyDesign, type Check } from "../src/models/lab/circuit.ts";

// Helpers ---------------------------------------------------------------

const design = (...types: string[]) => {
  let d = emptyDesign();
  for (let i = 0; i < types.length; i++) d = { ...d, parts: [...d.parts, { id: `${i + 1}`, type: types[i], x: i * 8, z: 0, rot: 0 }] };
  return d;
};

const check = (issues: Check["issues"]): Check => ({ level: issues.some((i) => i.level === "red") ? "red" : issues.some((i) => i.level === "yellow") ? "yellow" : "green", issues, parts: {}, budget: [] });

// Tests -----------------------------------------------------------------

test("healthOf: no parts → score 100, green, zero everything", () => {
  const d = emptyDesign();
  const c = checkDesign(d);
  const h = healthOf(c, d);
  assert.equal(h.score, 100);
  assert.equal(h.level, "green");
  assert.equal(h.red, 0);
  assert.equal(h.yellow, 0);
  assert.equal(h.parts, 0);
  assert.equal(h.wires, 0);
  assert.deepEqual(h.budget, []);
});

test("healthOf: perfect wiring → score 100, green", () => {
  // DHT22 wired to power, ground and a signal pin (DATA is the signal pin name)
  const d = { ...emptyDesign(), parts: [{ id: "dht-1", type: "dht22", x: 0, z: 0, rot: 0 }, { id: "a-1", type: "arduino-uno", x: 8, z: 0, rot: 0 }], wires: [{ id: "w1", from: { part: "dht-1", pin: "VCC" }, to: { part: "a-1", pin: "5V" } }, { id: "w2", from: { part: "dht-1", pin: "GND" }, to: { part: "a-1", pin: "GND" } }, { id: "w3", from: { part: "dht-1", pin: "DATA" }, to: { part: "a-1", pin: "D2" } }] };
  const c = checkDesign(d);
  const h = healthOf(c, d);
  assert.equal(h.score, 100);
  assert.equal(h.level, "green");
  assert.equal(h.red, 0);
  assert.equal(h.yellow, 0);
});

test("healthOf: red issues lower score by 15 each", () => {
  const c = check([
    { level: "red", key: "short", part: "p-1", pin: "VCC" },
    { level: "red", key: "mixedPower", part: "p-2", pin: "GND" },
  ]);
  const d = design("led");
  const h = healthOf(c, d);
  assert.equal(h.red, 2);
  assert.equal(h.yellow, 0);
  assert.equal(h.score, 70); // 100 - 30
  assert.equal(h.level, "red");
});

test("healthOf: yellow issues lower score by 5 each", () => {
  const c = check([
    { level: "yellow", key: "missing", part: "p-1", pin: "VCC" },
    { level: "yellow", key: "missing", part: "p-2", pin: "GND" },
  ]);
  const d = design("led");
  const h = healthOf(c, d);
  assert.equal(h.red, 0);
  assert.equal(h.yellow, 2);
  assert.equal(h.score, 90); // 100 - 10
  assert.equal(h.level, "yellow");
});

test("healthOf: mixed red + yellow", () => {
  const c = check([
    { level: "red", key: "short", part: "p-1", pin: "VCC" },
    { level: "yellow", key: "missing", part: "p-2", pin: "SIG" },
    { level: "yellow", key: "budget", part: "p-3", usedMa: 600, budgetMa: 500 },
  ]);
  const d = design("led");
  // 1 red (-15) + 2 yellow (-10) = 75
  const h = healthOf(c, d);
  assert.equal(h.score, 75);
  assert.equal(h.red, 1);
  assert.equal(h.yellow, 2);
  assert.equal(h.level, "red");
});

test("healthOf: score clamped to 0 when many issues", () => {
  const reds = Array.from({ length: 10 }, (_, i) => ({ level: "red" as const, key: "short" as const, part: `p-${i}`, pin: "V" }));
  const yellows = Array.from({ length: 10 }, (_, i) => ({ level: "yellow" as const, key: "missing" as const, part: `p-${i}`, pin: "G" }));
  const c = check([...reds, ...yellows]);
  const d = design("led");
  const h = healthOf(c, d);
  assert.equal(h.score, 0);
  assert.equal(h.red, 10);
  assert.equal(h.yellow, 10);
});

test("healthOf: budget array per board", () => {
  const c = check([]);
  const d = design("arduino-uno", "servo-sg90");
  // Manually set budget so the checker reports usage
  const result = healthOf({ ...c, budget: [{ board: "arduino-uno-1", usedMa: 350, budgetMa: 500 }] }, d);
  assert.equal(result.budget.length, 1);
  assert.equal(result.budget[0].board, "arduino-uno-1");
  assert.equal(result.budget[0].usedMa, 350);
  assert.equal(result.budget[0].budgetMa, 500);
  assert.equal(result.budget[0].ratio, 350 / 500);
});

test("healthOf: ratio is 0 when budgetMa is 0", () => {
  const c = check([]);
  const d = design("led");
  const h = healthOf({ ...c, budget: [{ board: "a-1", usedMa: 0, budgetMa: 0 }] }, d);
  assert.equal(h.budget[0].ratio, 0);
});