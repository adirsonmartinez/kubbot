import test from "node:test";
import assert from "node:assert/strict";
import { addPart, autoWire, emptyDesign } from "../src/models/lab/circuit.ts";
import { freeSpot, partBox, pinSpot, pinSpots, turn, wireKind } from "../src/models/lab/layout.ts";
import { componentOf } from "../src/models/lab/catalog.ts";

test("every pin of every part has a spot on its edges, inside the footprint", () => {
  for (const type of ["arduino-uno", "esp32-devkit", "hc-sr04", "led", "servo-sg90"]) {
    for (const rot of [0, 1, 2, 3]) {
      const part = { type, x: 3, z: -2, rot };
      const box = partBox(part);
      const spots = pinSpots(part);
      assert.equal(spots.length, componentOf(type)!.pins.length, type);
      for (const s of spots) {
        assert.ok(Math.abs(s.x - 3) <= box.w / 2 + 1e-9 && Math.abs(s.z + 2) <= box.d / 2 + 1e-9, `${type} ${rot} ${s.pin}`);
      }
    }
  }
});

test("turning: a quarter turn swaps width and depth and moves pins around the center", () => {
  assert.deepEqual(turn(1, 0, 1), [-0, 1]);
  const flat = partBox({ type: "arduino-uno", x: 0, z: 0, rot: 0 });
  const turned = partBox({ type: "arduino-uno", x: 0, z: 0, rot: 1 });
  assert.deepEqual([turned.w, turned.d], [flat.d, flat.w]);
  const a = pinSpot({ type: "led", x: 0, z: 0, rot: 0 }, "SIG")!;
  const b = pinSpot({ type: "led", x: 0, z: 0, rot: 2 }, "SIG")!;
  assert.ok(Math.abs(a.x + b.x) < 1e-9 && Math.abs(a.z + b.z) < 1e-9, "half a turn mirrors it");
});

test("a new part never lands on top of another one", () => {
  const d = addPart(emptyDesign(), "arduino-uno").design;
  const spot = freeSpot(d, "hc-sr04", 0, 0);
  const uno = partBox(d.parts[0]);
  const probe = partBox({ type: "hc-sr04", ...spot, rot: 0 });
  const apart = Math.abs(spot.x - uno.x) * 2 >= probe.w + uno.w || Math.abs(spot.z - uno.z) * 2 >= probe.d + uno.d;
  assert.ok(apart);
});

test("a free spot is kept as asked, snapped to half a unit", () => {
  const d = addPart(emptyDesign(), "arduino-uno").design;
  assert.deepEqual(freeSpot(d, "led", 20.3, -14.1), { x: 20.5, z: -14 });
  assert.deepEqual(freeSpot(emptyDesign(), "led"), { x: 0, z: 0 });
});

test("with no point, a new part goes in front of the first board, close to it", () => {
  const d = addPart(emptyDesign(), "arduino-uno", { x: 6, z: -3 }).design;
  const spot = freeSpot(d, "hc-sr04");
  assert.ok(spot.z > -3, "in front (+z)");
  assert.ok(Math.abs(spot.x - 6) <= 1, "centered on the board");
  assert.ok(spot.z - -3 < 8, "close");
});

test("free spots are deterministic, on the half-unit grid, with a gap", () => {
  const types = ["hc-sr04", "pir", "dht22", "led", "servo-sg90", "oled-128x64", "buzzer", "button", "relay", "potentiometer"];
  const build = () => types.reduce((d, t) => addPart(d, t, freeSpot(d, t)).design, addPart(emptyDesign(), "arduino-uno").design);
  const a = build();
  assert.deepEqual(build().parts, a.parts);
  for (const p of a.parts) {
    assert.equal(p.x * 2, Math.round(p.x * 2));
    assert.equal(p.z * 2, Math.round(p.z * 2));
  }
  for (let i = 0; i < a.parts.length; i++) {
    for (let j = i + 1; j < a.parts.length; j++) {
      const p = partBox(a.parts[i]);
      const q = partBox(a.parts[j]);
      const clear = Math.abs(p.x - q.x) * 2 >= p.w + q.w + 0.6 - 1e-9 || Math.abs(p.z - q.z) * 2 >= p.d + q.d + 0.6 - 1e-9;
      assert.ok(clear, `${a.parts[i].id} and ${a.parts[j].id} overlap`);
    }
  }
});

test("ten parts make a compact cluster, not a row", () => {
  const types = ["hc-sr04", "pir", "dht22", "led", "servo-sg90", "oled-128x64", "buzzer", "button", "relay", "potentiometer"];
  const d = types.reduce((acc, t) => addPart(acc, t, freeSpot(acc, t)).design, addPart(emptyDesign(), "arduino-uno").design);
  const boxes = d.parts.map(partBox);
  const w = Math.max(...boxes.map((b) => b.x + b.w / 2)) - Math.min(...boxes.map((b) => b.x - b.w / 2));
  const dd = Math.max(...boxes.map((b) => b.z + b.d / 2)) - Math.min(...boxes.map((b) => b.z - b.d / 2));
  assert.ok(Math.max(w, dd) / Math.min(w, dd) < 2.2, `shape ${w} x ${dd}`);
  assert.ok(w < 32 && dd < 32, `size ${w} x ${dd}`);
});

test("wire kinds: power, ground, bus and signal", () => {
  let d = addPart(addPart(addPart(emptyDesign(), "arduino-uno").design, "oled-128x64", { x: 9 }).design, "led", { x: -9 }).design;
  d = autoWire(autoWire(d, "oled-128x64-1").design, "led-1").design;
  const kinds = new Set(d.wires.map((w) => wireKind(d, w)));
  assert.deepEqual([...kinds].sort(), ["bus", "gnd", "power", "signal"]);
});
