import { test } from "node:test";
import assert from "node:assert/strict";
import { colorHex, enclosureFacts, partChips, partName, reviewCounts, reviewRows } from "../src/views/components/lab/labText.ts";
import { COMPONENTS, componentOf } from "../src/models/lab/catalog.ts";

test("colorHex pads and trims to six digits", () => {
  assert.equal(colorHex(0x1f6fa8), "#1f6fa8");
  assert.equal(colorHex(0xff), "#0000ff");
});

test("partName reads the copy and falls back to the id", () => {
  assert.equal(partName("led"), "LED");
  assert.equal(partName("nada"), "nada");
});

test("partChips: board shows its logic voltage, parts show volts and mA, all show pins", () => {
  const uno = componentOf("arduino-uno")!;
  assert.deepEqual(partChips(uno), ["5 V", `${uno.pins.length} pines`]);
  const servo = componentOf("servo-sg90")!;
  const chips = partChips(servo);
  assert.ok(chips.some((c) => c.endsWith("V")));
  assert.ok(chips.some((c) => c.endsWith("mA")));
  assert.ok(chips.at(-1)!.endsWith("pines"));
});

test("every catalog item gets chips and a name", () => {
  for (const c of COMPONENTS) {
    assert.ok(partChips(c).length >= 1, c.id);
    assert.notEqual(partName(c.id), c.id, `${c.id} has no copy`);
  }
});

test("reviewRows puts red first, keeps order inside a level and drops parts not on the bench", () => {
  const rows = reviewRows(
    [
      { level: "yellow", key: "missing", part: "led-1", text: "a" },
      { level: "red", key: "short", part: null, text: "b" },
      { level: "yellow", key: "level", part: "gone-1", text: "c" },
      { level: "red", key: "overvoltage", part: "led-1", text: "d" },
    ],
    new Set(["led-1"]),
  );
  assert.deepEqual(rows.map((r) => r.text), ["b", "d", "a", "c"]);
  assert.deepEqual(rows.map((r) => r.part), [null, "led-1", "led-1", null]);
  assert.equal(new Set(rows.map((r) => r.id)).size, 4);
  const counts = reviewCounts(rows);
  assert.equal(counts.red, 2);
  assert.equal(counts.yellow, 2);
  assert.equal(counts.text, "2 peligros · 2 por revisar");
});

test("enclosureFacts reads size and print estimate, and is null with no data", () => {
  assert.equal(enclosureFacts(null), null);
  assert.equal(enclosureFacts({ ok: false }), null);
  const facts = enclosureFacts({ ok: true, size: { w: 80.4, d: 60.2, h: 30 }, printMinutes: 90, grams: 24.3 });
  assert.equal(facts?.size, "80 × 60 × 30 mm");
  assert.equal(facts?.print, "Unas 1,5 h de impresión · 24 g de PLA");
});
