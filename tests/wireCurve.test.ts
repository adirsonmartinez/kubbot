import test from "node:test";
import assert from "node:assert/strict";
import { ARC, CLEARANCE, benchPoint, localToBench, partAngle, pointAlong, spreadStep, wireCurve, wireLength } from "../src/views/scene/lab/wireCurve.ts";
import type { Box } from "../src/views/scene/lab/wireCurve.ts";
import { flowsBackwards } from "../src/views/scene/lab/wireFlow.ts";
import { pinSpots, wireKind } from "../src/models/lab/layout.ts";
import { addPart, connect, emptyDesign } from "../src/models/lab/circuit.ts";

const A = { x: -2, y: 0.42, z: 1 };
const B = { x: 3, y: 0.3, z: -1.5 };
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test("wireCurve: the ends are exactly the two pins", () => {
  const pts = wireCurve(A, B);
  assert.deepEqual(pts[0], A);
  assert.deepEqual(pts.at(-1), B);
  assert.equal(pts.length, ARC.segments + 1);
});

test("wireCurve: the middle rises above both ends", () => {
  const pts = wireCurve(A, B);
  const apex = Math.max(...pts.map((p) => p.y));
  assert.ok(apex > A.y + 0.2 && apex > B.y + 0.2);
  assert.ok(pts[Math.floor(pts.length / 2)].y > Math.max(A.y, B.y));
});

test("wireCurve: a longer wire arcs higher, up to a cap", () => {
  const apex = (b: { x: number; y: number; z: number }) => Math.max(...wireCurve({ x: 0, y: 0.4, z: 0 }, b).map((p) => p.y));
  assert.ok(apex({ x: 6, y: 0.4, z: 0 }) > apex({ x: 1, y: 0.4, z: 0 }));
  assert.ok(apex({ x: 200, y: 0.4, z: 0 }) <= 0.4 + ARC.max + 1e-9);
});

test("wireCurve: deterministic", () => {
  assert.deepEqual(wireCurve(A, B, { index: 3 }), wireCurve(A, B, { index: 3 }));
});

test("wireCurve: parallel wires shift sideways by index, ends stay put", () => {
  const a = { x: 0, y: 0.4, z: 0 };
  const b = { x: 4, y: 0.4, z: 0 };
  const mid = (index: number) => wireCurve(a, b, { index })[ARC.segments / 2];
  assert.ok(close(mid(0).z, 0));
  assert.ok(mid(1).z > 0.05);
  assert.ok(mid(2).z < -0.05);
  assert.ok(Math.abs(mid(3).z) > Math.abs(mid(1).z));
  assert.deepEqual(wireCurve(a, b, { index: 2 })[0], a);
  assert.deepEqual(wireCurve(a, b, { index: 2 }).at(-1), b);
  assert.deepEqual([0, 1, 2, 3, 4].map(spreadStep), [0, 1, -1, 2, -2]);
});

test("wireCurve: two pins one above the other still give a finite arc", () => {
  const pts = wireCurve({ x: 1, y: 0.2, z: 1 }, { x: 1, y: 0.5, z: 1 });
  assert.ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
});

// --- Clearing the parts under the wire ---

const a = { x: 0, y: 0.42, z: 0 };
const b = { x: 8, y: 0.42, z: 0 };
const inside = (p: { x: number; z: number }, o: Box) => Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.z - o.z) <= o.d / 2;

test("wireCurve: no obstacles gives the same arc as before", () => {
  assert.deepEqual(wireCurve(a, b, { obstacles: [] }), wireCurve(a, b));
});

test("wireCurve: the arc passes above a tall part between its ends", () => {
  const tower: Box = { id: "servo-1", x: 4, z: 0, w: 2.3, d: 1.2, h: 2.9 };
  const free = wireCurve(a, b);
  assert.ok(free.some((p) => inside(p, tower) && p.y < tower.h), "without help it cuts through");
  const cleared = wireCurve(a, b, { obstacles: [tower] });
  for (const p of cleared) if (inside(p, tower)) assert.ok(p.y >= tower.h + CLEARANCE.up - 1e-9, `y=${p.y}`);
  assert.deepEqual(cleared[0], a);
  assert.deepEqual(cleared.at(-1), b);
});

test("wireCurve: the parts the wire starts and ends on are skipped, and far parts change nothing", () => {
  const own: Box = { id: "uno-1", x: 0, z: 0, w: 6.8, d: 5.3, h: 1.5 };
  const far: Box = { id: "led-1", x: 4, z: 20, w: 0.5, d: 0.5, h: 0.9 };
  assert.deepEqual(wireCurve(a, b, { obstacles: [own, far], skip: ["uno-1"] }), wireCurve(a, b));
});

test("wireCurve: a part crowding a pin does not make the wire fly away", () => {
  const near: Box = { id: "x", x: 0.4, z: 0.3, w: 1, d: 1, h: 3 };
  const pts = wireCurve(a, b, { obstacles: [near] });
  assert.ok(Math.max(...pts.map((p) => p.y)) <= a.y + CLEARANCE.cap + 1e-9);
});

test("wireCurve: sideways spread does not break clearing", () => {
  const tower: Box = { x: 4, z: 0.2, w: 1, d: 1, h: 2 };
  for (const index of [0, 1, 2, 3]) {
    for (const p of wireCurve(a, b, { index, obstacles: [tower] })) {
      if (inside(p, tower)) assert.ok(p.y >= tower.h + CLEARANCE.up - 1e-9);
    }
  }
});

// --- Along the wire ---

test("pointAlong: ends, middle and wrap-around", () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }];
  assert.equal(wireLength(line), 3);
  assert.deepEqual(pointAlong(line, 0), { x: 0, y: 0, z: 0 });
  assert.deepEqual(pointAlong(line, 1), { x: 3, y: 0, z: 0 });
  assert.ok(close(pointAlong(line, 0.5).x, 1.5));
  assert.ok(close(pointAlong(line, 1.25).x, 0.75));
  assert.ok(close(pointAlong(line, -0.25).x, 2.25));
});

// --- Placing a part's points ---

test("partAngle + localToBench place a part pin where layout says it is (every turn)", () => {
  for (const type of ["arduino-uno", "hc-sr04", "servo-sg90"]) {
    const local = pinSpots({ type, x: 0, z: 0, rot: 0 });
    for (let rot = 0; rot < 4; rot++) {
      const part = { type, x: 2.5, z: -1.5, rot };
      pinSpots(part).forEach((w, i) => {
        const p = localToBench(local[i], part);
        assert.ok(close(p.x, w.x, 1e-6) && close(p.z, w.z, 1e-6) && close(p.y, w.y, 1e-6), `${type} rot ${rot} ${w.pin}`);
      });
    }
  }
  assert.ok(close(partAngle(1), -Math.PI / 2));
});

test("benchPoint: lift only moves y, and a half turn mirrors the offset", () => {
  const p = benchPoint({ x: 1, y: 0.4, z: 2 }, { x: 5, z: 5, angle: Math.PI }, 0.22);
  assert.ok(close(p.x, 4, 1e-9) && close(p.z, 3, 1e-9) && close(p.y, 0.62, 1e-9));
});

// --- Particle direction ---

test("flowsBackwards: power goes board -> part, ground and sensor signals come back", () => {
  let design = emptyDesign();
  const uno = addPart(design, "arduino-uno");
  design = uno.design;
  const led = addPart(design, "led", { x: 8 });
  design = led.design;
  const sonar = addPart(design, "hc-sr04", { x: -8 });
  design = sonar.design;
  const wire = (from: { part: string; pin: string }, to: { part: string; pin: string }) => {
    const r = connect(design, from, to);
    design = r.design;
    return design.wires.find((w) => w.id === r.id)!;
  };
  const kindOf = (w: ReturnType<typeof wire>) => wireKind(design, w);
  const boardFirst = wire({ part: uno.id!, pin: "5V" }, { part: sonar.id!, pin: "VCC" });
  assert.equal(kindOf(boardFirst), "power");
  assert.equal(flowsBackwards(design, boardFirst, "power"), false);
  const partFirst = wire({ part: sonar.id!, pin: "VCC" }, { part: uno.id!, pin: "3V3" });
  assert.equal(flowsBackwards(design, partFirst, "power"), true);
  const gnd = wire({ part: uno.id!, pin: "GND" }, { part: led.id!, pin: "GND" });
  assert.equal(flowsBackwards(design, gnd, "gnd"), true);
  const echo = wire({ part: sonar.id!, pin: "ECHO" }, { part: uno.id!, pin: "D2" });
  assert.equal(flowsBackwards(design, echo, "signal"), false);
  const out = wire({ part: uno.id!, pin: "D3" }, { part: led.id!, pin: "SIG" });
  assert.equal(flowsBackwards(design, out, "signal"), false);
  const boardToBoard = { id: "x", from: { part: uno.id!, pin: "5V" }, to: { part: uno.id!, pin: "GND" } };
  assert.equal(flowsBackwards(design, boardToBoard, "power"), false);
});
