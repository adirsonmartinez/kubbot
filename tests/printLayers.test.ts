import test from "node:test";
import assert from "node:assert/strict";
import { addPart, emptyDesign } from "../src/models/lab/circuit.ts";
import { enclosureFor, type Enclosure } from "../src/models/lab/enclosure.ts";
import { layersOf, printPlan } from "../src/models/lab/printLayers.ts";

const bench = (...types: string[]) =>
  types.reduce((d, type, i) => addPart(d, type, { x: i * 8, z: 0 }).design, emptyDesign());

function makeEnclosure(types: string[]): Enclosure {
  return enclosureFor(bench(...types));
}

test("no board returns empty layers", () => {
  const e = enclosureFor(null);
  assert.deepEqual(layersOf(e), []);
  const p = printPlan(e);
  assert.equal(p.layers.length, 0);
  assert.equal(p.totalMinutes, 0);
  assert.equal(p.grams, 0);
});

test("every solid box produces a rectangular layer feature", () => {
  const e = makeEnclosure(["arduino-uno", "hc-sr04"]);
  assert.ok(e.ok);
  const allLayers = layersOf(e);
  assert.ok(allLayers.length > 0);

  // Every layer must have at least one feature
  for (const layer of allLayers) {
    assert.ok(layer.features.length > 0, `layer at y=${layer.y}`);
    // Features are either rects or rings
    for (const f of layer.features) {
      assert.ok(f.kind === "rect" || f.kind === "ring");
    }
  }
});

test("layer count matches enclosure height / layerMm", () => {
  const e = makeEnclosure(["arduino-uno"]);
  const normal = layersOf(e, 0.6);
  const fine = layersOf(e, 0.2);

  assert.ok(fine.length > normal.length, "finer layers = more layers");
  // Ratio should be roughly 3:1 (0.6 vs 0.2)
  const ratio = fine.length / normal.length;
  assert.ok(ratio >= 2.8 && ratio <= 3.2, `ratio ${ratio.toFixed(1)} is ~3`);
});

test("layer heights are multiples of layerMm", () => {
  const e = makeEnclosure(["arduino-uno"]);
  const layer = 0.3;
  const allLayers = layersOf(e, layer);

  assert.ok(allLayers.length > 0);
  for (const l of allLayers) {
    const remainder = Math.round((l.y / layer - Math.round(l.y / layer)) * 1e6) / 1e6;
    assert.ok(Math.abs(remainder) < 0.001, `y=${l.y} is a multiple of ${layer}`);
  }
});

test("layer heights are non-decreasing", () => {
  const e = makeEnclosure(["arduino-uno", "relay"]);
  const allLayers = layersOf(e);

  for (let i = 1; i < allLayers.length; i++) {
    assert.ok(allLayers[i].y >= allLayers[i - 1].y, `layers ${i-1} and ${i}`);
  }
});

test("standoffs appear as ring features", () => {
  const e = makeEnclosure(["arduino-uno"]);
  const allLayers = layersOf(e);

  // A standoff is a cylinder (ring when rInner > 0). Find any layer with ring features
  const ringLayers = allLayers.filter((l) => l.features.some((f) => f.kind === "ring"));
  assert.ok(ringLayers.length > 0, "standoffs produce ring layers");
  for (const rl of ringLayers) {
    for (const f of rl.features) {
      if (f.kind === "ring") {
        assert.ok(f.r === 3, "standoff radius is 3mm");
        assert.equal(f.rInner, 1.6, "standoff inner hole is 1.6mm");
      }
    }
  }
});

test("floor is the bottom-most layer, covering the full footprint", () => {
  const e = makeEnclosure(["arduino-uno"]);
  const allLayers = layersOf(e);

  const first = allLayers[0];
  assert.ok(first.y < 0.1, `first layer at y=${first.y}, close to 0`);

  // The floor is the first feature (unshifted into solids)
  const rect = first.features.find((f): f is { kind: "rect"; x0: number; x1: number; z0: number; z1: number } =>
    f.kind === "rect"
  );
  assert.ok(rect, "first layer has a rect feature");
  if (rect && rect.kind === "rect") {
    // The rect should span the full outer width and depth
    assert.ok(rect.x1 - rect.x0 >= e.size.w * 0.5, "rect covers most of the box width");
    assert.ok(rect.z1 - rect.z0 >= e.size.d * 0.5, "rect covers most of the box depth");
  }
});

test("printPlan returns enclosure estimates", () => {
  const e = makeEnclosure(["arduino-uno", "hc-sr04"]);
  const plan = printPlan(e);

  assert.ok(plan.layers.length > 0);
  assert.ok(plan.totalMinutes > 0, "printTime is positive");
  assert.ok(plan.grams > 0, "grams is positive");
  assert.ok(Number.isInteger(plan.totalMinutes), "printTime is an integer");
  assert.ok(plan.grams >= 0, "grams is non-negative");
});

test("printPlan minutes and grams match enclosure values", () => {
  const e = makeEnclosure(["arduino-uno"]);
  const plan = printPlan(e);

  assert.equal(plan.totalMinutes, e.printMinutes, "minutes match enclosure");
  assert.equal(plan.grams, e.grams, "grams match enclosure");
});

test("layers with 0.2mm are roughly 3x those at 0.6mm", () => {
  const e = makeEnclosure(["arduino-uno", "oled-128x64"]);
  const coarse = layersOf(e, 0.6);
  const fine = layersOf(e, 0.2);

  assert.ok(fine.length > coarse.length * 2.5);
  assert.ok(fine.length < coarse.length * 3.5);
});