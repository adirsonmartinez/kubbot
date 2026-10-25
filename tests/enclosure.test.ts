import test from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS, componentOf } from "../src/models/lab/catalog.ts";
import { addPart, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { MM, partBox } from "../src/models/lab/layout.ts";
import {
  DEFAULTS, enclosureFor, printEstimate, solidTriangles, solidVolume, toScad, toStl, triangleNormal,
  type Enclosure, type Solid, type Triangle, type Vec3,
} from "../src/models/lab/enclosure.ts";
import { FEATURES, featuresOf } from "../src/models/lab/enclosureFeatures.ts";

type Item = [string, number?, number?, number?];
const bench = (...items: Item[]): Design => items.reduce((d, [type, x = 0, z = 0, rot = 0]) => addPart(d, type, { x, z, rot }).design, emptyDesign());
const compact = () => bench(["arduino-uno", 0, 0], ["hc-sr04", 0, -6.5]);
const signedVolume = (tris: Triangle[]) =>
  tris.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
type Box = { min: Vec3; max: Vec3 };
const overlap = (a: Box, b: Box) => [0, 1, 2].reduce((v, i) => v * Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])), 1);
const aabb = (s: Solid): Box =>
  s.kind === "cylinder" ? { min: [s.center[0] - s.r, s.center[1], s.center[2] - s.r], max: [s.center[0] + s.r, s.center[1] + s.h, s.center[2] + s.r] } : s;
const noOverlaps = (e: Enclosure, label = "") => {
  const boxes = e.solids.map(aabb);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(overlap(boxes[i], boxes[j]) < 1e-6, `${label} solids ${i} and ${j} overlap`);
};

function readStl(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const tris: { normal: Vec3; v: Triangle; attr: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 84 + i * 50;
    const f = (k: number) => view.getFloat32(at + k * 4, true);
    tris.push({ normal: [f(0), f(1), f(2)], v: [[f(3), f(4), f(5)], [f(6), f(7), f(8)], [f(9), f(10), f(11)]], attr: view.getUint16(at + 48, true) });
  }
  return { count, tris, header: new Uint8Array(buffer, 0, 80) };
}

test("a box is 12 triangles with outward normals and its exact volume", () => {
  const box: Solid = { kind: "box", min: [1, 2, 3], max: [11, 7, 6], group: "base", tag: "floor" };
  const tris = solidTriangles(box);
  assert.equal(tris.length, 12);
  assert.ok(Math.abs(signedVolume(tris) - 150) < 1e-9);
  assert.equal(solidVolume(box), 150);
  const c = [6, 4.5, 4.5];
  for (const [a, b, d] of tris) {
    const n = triangleNormal(a, b, d);
    const mid = [0, 1, 2].map((i) => (a[i] + b[i] + d[i]) / 3 - c[i]);
    assert.ok(n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > 0, "normal points away from the center");
  }
});

test("cylinders and rings enclose their volume and stay watertight", () => {
  const solids: Solid[] = [
    { kind: "cylinder", center: [5, 2, -3], r: 3, h: 4, segments: 24, group: "base", tag: "standoff" },
    { kind: "cylinder", center: [5, 2, -3], r: 3, rInner: 1.6, h: 4, segments: 24, group: "base", tag: "standoff" },
  ];
  for (const solid of solids) {
    const tris = solidTriangles(solid);
    assert.equal(tris.length, solid.kind === "cylinder" && solid.rInner ? 24 * 8 : 24 * 4);
    assert.ok(Math.abs(signedVolume(tris) - solidVolume(solid)) < 1e-6, "outward windings");
    // every edge is used once in each direction
    const key = (p: Vec3) => p.map((v) => v.toFixed(6)).join(",");
    const edges = new Map<string, number>();
    for (const t of tris) {
      for (let i = 0; i < 3; i++) {
        const e = `${key(t[i])}>${key(t[(i + 1) % 3])}`;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    }
    for (const [e, n] of edges) {
      const [a, b] = e.split(">");
      assert.equal(n, 1, `edge ${e} once`);
      assert.equal(edges.get(`${b}>${a}`), 1, `edge ${e} has a partner`);
    }
  }
});

test("no board, no box", () => {
  for (const d of [emptyDesign(), bench(["led"]), null, undefined]) {
    const e = enclosureFor(d);
    assert.equal(e.ok, false);
    assert.equal(e.reason, "noBoard");
    assert.deepEqual(e.solids, []);
    assert.equal(e.standoffs, 0);
    assert.equal(toStl(e).byteLength, 84, "an empty STL is just the header and the count");
  }
});

test("the box wraps every part footprint with clearance, in mm", () => {
  const d = bench(["arduino-uno", 0, 0], ["hc-sr04", 8, 0], ["servo-sg90", -8, 4, 1], ["oled-128x64", 0, 7.5]);
  const e = enclosureFor(d);
  assert.ok(e.ok);
  const c = DEFAULTS.clearance;
  for (const part of d.parts) {
    const b = partBox(part);
    const min = [(b.x - b.w / 2) / MM, (b.z - b.d / 2) / MM];
    const max = [(b.x + b.w / 2) / MM, (b.z + b.d / 2) / MM];
    assert.ok(e.inner.min[0] <= min[0] - c + 1e-6 && e.inner.min[2] <= min[1] - c + 1e-6, `${part.id} min`);
    assert.ok(e.inner.max[0] >= max[0] + c - 1e-6 && e.inner.max[2] >= max[1] + c - 1e-6, `${part.id} max`);
    const spec = componentOf(part.type)!;
    assert.ok(e.inner.max[1] >= (spec.kind === "board" ? 4 : 0) + 2 + spec.size[2] + c - 1e-6, `${part.id} height`);
  }
  // walls are 2 mm around the cavity, the floor 2 mm, the lid 2 mm on top
  assert.ok(Math.abs(e.size.w - (e.inner.max[0] - e.inner.min[0] + 2 * DEFAULTS.wall)) < 1e-6);
  assert.ok(Math.abs(e.size.d - (e.inner.max[2] - e.inner.min[2] + 2 * DEFAULTS.wall)) < 1e-6);
  assert.ok(Math.abs(e.size.h - (e.wallsTop + DEFAULTS.lid)) < 1e-6);
  assert.equal(e.inner.min[1], DEFAULTS.floor);
  // the solids span exactly the outer box
  const all = e.solids.map(aabb);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(Math.min(...all.map((s) => s.min[i])) - e.outer.min[i]) < 1e-6);
    assert.ok(Math.abs(Math.max(...all.map((s) => s.max[i])) - e.outer.max[i]) < 1e-6);
  }
});

test("options change the wall, floor, lid and clearance; bad values fall back", () => {
  const thin = enclosureFor(compact());
  const thick = enclosureFor(compact(), { wall: 3, clearance: 4 });
  assert.ok(thick.size.w > thin.size.w + 5);
  assert.equal(thick.config.wall, 3);
  assert.equal(enclosureFor(compact(), { wall: -5 }).config.wall, 1);
  assert.equal(enclosureFor(compact(), { wall: 1e6 }).config.wall, 10, "capped");
  for (const bad of ["x", null, undefined, NaN, "", {}, []]) assert.equal(enclosureFor(compact(), { wall: bad }).config.wall, DEFAULTS.wall, `${String(bad)}`);
  assert.equal(enclosureFor(compact(), { wall: "3" }).config.wall, 3);
});

test("a board gets one M3 standoff ring under each of its holes", () => {
  for (const board of COMPONENTS.filter((c) => c.kind === "board")) {
    const e = enclosureFor(bench([board.id, 3, -2]));
    const posts = e.solids.filter((s) => s.tag === "standoff");
    assert.equal(posts.length, board.holes.length, board.id);
    assert.equal(e.standoffs, board.holes.length);
    for (const p of posts) {
      assert.equal(p.kind, "cylinder");
      if (p.kind !== "cylinder") continue;
      assert.equal(p.r, 3);
      assert.equal(p.rInner, 1.6);
      assert.equal(p.center[1], DEFAULTS.floor, "stands on the floor");
      assert.equal(p.group, "base");
      assert.ok(p.center[0] - 3 >= e.inner.min[0] && p.center[0] + 3 <= e.inner.max[0], "inside the box");
      assert.ok(p.center[2] - 3 >= e.inner.min[2] && p.center[2] + 3 <= e.inner.max[2], "inside the box");
    }
  }
  assert.equal(enclosureFor(bench(["arduino-uno"], ["arduino-nano", 12, 0])).standoffs, 8);
});

test("standoffs follow the board when it turns, under its real holes", () => {
  const at = (rot: number) =>
    enclosureFor(bench(["arduino-uno", 0, 0, rot])).solids.flatMap((s) => (s.kind === "cylinder" && s.tag === "standoff" ? [s.center] : []));
  const [a, b] = [at(0), at(1)];
  // the first hole [14, 2.5] sits at local (-20.3, +24.2): a quarter turn sends it to (-24.2, -20.3)
  assert.deepEqual([a[0][0], a[0][2]], [-20.3, 24.2]);
  assert.deepEqual([b[0][0], b[0][2]], [-24.2, -20.3]);
  // every post is a hole of the board, for every rotation and every board
  for (const board of COMPONENTS.filter((c) => c.kind === "board")) {
    if (board.kind !== "board") continue;
    for (const rot of [0, 1, 2, 3]) {
      const posts = enclosureFor(bench([board.id, 0, 0, rot])).solids.flatMap((s) => (s.kind === "cylinder" ? [s.center] : []));
      const [w, d] = board.size;
      const corners = posts.map(([x, , z]) => {
        // undo the turn: a quarter turn is (x, z) -> (-z, x), so the inverse is (x, z) -> (z, -x)
        let lx = x, lz = z;
        for (let i = 0; i < rot; i++) [lx, lz] = [lz, -lx];
        return [Math.round((lx + w / 2) * 100) / 100, Math.round((d / 2 - lz) * 100) / 100];
      });
      assert.deepEqual(corners, board.holes, `${board.id} rot ${rot}`);
    }
  }
});

test("the USB opening goes on the wall the port faces, and follows the rotation", () => {
  const usbOf = (rot: number) => enclosureFor(bench(["arduino-uno", 0, 0, rot])).cutouts.find((c) => c.label === "usb")!;
  assert.equal(usbOf(0).wall, "west");
  assert.equal(usbOf(1).wall, "north");
  assert.equal(usbOf(2).wall, "east");
  assert.equal(usbOf(3).wall, "south");
  const usb = usbOf(0);
  assert.equal(usb.shape, "rect");
  assert.ok(usb.shape === "rect" && usb.max[2] - usb.min[2] >= 12, "wider than the plug");
  assert.ok(usb.shape === "rect" && usb.min[1] >= DEFAULTS.floor + DEFAULTS.standoff, "above the board");
});

test("the USB opening sits where the plug is on the board edge", () => {
  // Uno rot 0: USB center 38.1 mm up the drawing from the bottom edge: z = 53.4/2 - 38.1 = -11.4
  const usb = enclosureFor(bench(["arduino-uno", 0, 0])).cutouts.find((c) => c.label === "usb")!;
  assert.ok(usb.shape === "rect");
  if (usb.shape !== "rect") return;
  assert.ok(Math.abs((usb.min[2] + usb.max[2]) / 2 + 11.4) < 1e-6);
  // turned half a turn it sits on the other side of the center, on the east wall
  const turned = enclosureFor(bench(["arduino-uno", 0, 0, 2])).cutouts.find((c) => c.label === "usb")!;
  assert.ok(turned.shape === "rect" && turned.wall === "east");
  if (turned.shape === "rect") assert.ok(Math.abs((turned.min[2] + turned.max[2]) / 2 - 11.4) < 1e-6);
});

test("a port too far from its wall uses the nearest one", () => {
  // a part to the west of the Uno leaves its USB side far from the west wall
  const e = enclosureFor(bench(["arduino-uno", 0, 0], ["battery-aa4", -12, 0]));
  assert.notEqual(e.cutouts.find((c) => c.label === "usb")!.wall, "west");
});

test("the HC-SR04 facing a wall gets two round eyes of 8 mm on it", () => {
  const sides: Record<number, string> = { 0: "north", 1: "east", 2: "south", 3: "west" };
  for (const [rot, wall] of Object.entries(sides)) {
    const e = enclosureFor(bench(["arduino-uno", 0, 0], ["hc-sr04", 0, 0, Number(rot)]));
    const eyes = e.cutouts.filter((c) => c.label === "eyes");
    assert.equal(eyes.length, 2, `rot ${rot}`);
    assert.ok(eyes.every((c) => c.shape === "round" && c.r === 8 && c.wall === wall), `rot ${rot} on the ${wall} wall`);
    // the wall has real openings: no wall solid covers an eye's center
    for (const eye of eyes) {
      if (eye.shape !== "round") continue;
      const covered = e.solids.filter((s) => s.tag === wall).some((s) => s.kind === "box" && [0, 1, 2].every((i) => eye.center[i] > s.min[i] && eye.center[i] < s.max[i]));
      assert.equal(covered, false, "an eye is open");
    }
  }
  const [a, b] = enclosureFor(compact()).cutouts.filter((c) => c.label === "eyes");
  assert.ok(a.shape === "round" && b.shape === "round");
  if (a.shape === "round" && b.shape === "round") assert.ok(Math.abs(Math.abs(a.center[0] - b.center[0]) - 26) < 1e-6, "eyes 26 mm apart");
});

test("lid windows, the PIR dome and vents open the lid, not the walls", () => {
  const e = enclosureFor(bench(["arduino-uno", 0, 0], ["oled-128x64", 9, 0], ["pir", -9, 0], ["relay", 0, 7]));
  const on = (label: string) => e.cutouts.filter((c) => c.label === label);
  assert.equal(on("screen").length, 1);
  assert.equal(on("dome").length, 1);
  assert.equal(on("vents").length, 4 + 4);
  assert.ok(e.cutouts.filter((c) => ["screen", "dome", "vents"].includes(c.label)).every((c) => c.wall === "lid"));
  const dome = on("dome")[0];
  assert.ok(dome.shape === "round" && dome.r === 11);
  // the lid plate is carved: no plate box covers the dome's center or the window's center
  const plates = e.solids.filter((s) => s.tag === "plate");
  const covers = (p: Vec3) => plates.some((s) => s.kind === "box" && p[0] > s.min[0] && p[0] < s.max[0] && p[2] > s.min[2] && p[2] < s.max[2]);
  assert.equal(covers((dome as { center: Vec3 }).center), false);
  const w = on("screen")[0];
  assert.ok(w.shape === "rect");
  if (w.shape === "rect") assert.equal(covers([(w.min[0] + w.max[0]) / 2, 0, (w.min[2] + w.max[2]) / 2]), false);
  // and a rotated window swaps its sides
  const turned = enclosureFor(bench(["arduino-uno", 0, 0], ["oled-128x64", 9, 0, 1])).cutouts.find((c) => c.label === "screen")!;
  assert.ok(turned.shape === "rect" && Math.abs(turned.max[0] - turned.min[0] - 14) < 1e-6 && Math.abs(turned.max[2] - turned.min[2] - 24) < 1e-6);
});

test("a battery leaves its cable through the nearest wall", () => {
  const e = enclosureFor(bench(["arduino-uno", 0, 0], ["battery-aa4", 12, 0]));
  assert.equal(e.cutouts.find((c) => c.label === "cable")!.wall, "east");
});

test("base and lid are both non-empty and the lid carries the lip", () => {
  const e = enclosureFor(compact());
  const base = e.solids.filter((s) => s.group === "base");
  const lid = e.solids.filter((s) => s.group === "lid");
  assert.ok(base.length > 0 && lid.length > 0);
  assert.equal(lid.filter((s) => s.tag === "lip").length, 4, "no opening near the edge: four frame pieces");
  assert.ok(base.some((s) => s.tag === "floor"));
  for (const w of ["north", "south", "east", "west"]) assert.ok(base.some((s) => s.tag === w), w);
  // the lip fits inside the cavity with play, and sits right under the plate
  for (const s of lid.filter((s) => s.tag === "lip")) {
    assert.ok(s.kind === "box");
    if (s.kind !== "box") continue;
    assert.ok(s.min[0] >= e.inner.min[0] + DEFAULTS.lipGap - 1e-6 && s.max[0] <= e.inner.max[0] - DEFAULTS.lipGap + 1e-6);
    assert.ok(s.min[2] >= e.inner.min[2] + DEFAULTS.lipGap - 1e-6 && s.max[2] <= e.inner.max[2] - DEFAULTS.lipGap + 1e-6);
    assert.equal(s.max[1], e.wallsTop);
  }
});

test("a lid opening near the edge also opens the lip under it", () => {
  // an LED at the edge of the bench: its 3.2 mm hole reaches into the lip's band
  const e = enclosureFor(bench(["arduino-uno", 0, 0], ["led", 0, -6.4]));
  const led = e.cutouts.find((c) => c.label === "led")!;
  assert.ok(led.shape === "round");
  const lips = e.solids.filter((s) => s.tag === "lip");
  assert.ok(lips.length > 4, "the lip is cut around the hole");
  const centre = (led as { center: Vec3 }).center;
  for (const s of lips) {
    assert.ok(s.kind === "box");
    if (s.kind === "box") assert.ok(!(centre[0] > s.min[0] && centre[0] < s.max[0] && centre[2] > s.min[2] && centre[2] < s.max[2]), "the hole center is clear");
  }
  noOverlaps(e, "led at the edge");
  // and the OpenSCAD cutter runs down through the lip too
  const scad = toScad(e);
  const line = scad.split("\n").find((l) => l.includes("led-1 led"))!;
  const h = Number(/h = ([\d.]+)/.exec(line)![1]);
  assert.ok(h > DEFAULTS.lid + DEFAULTS.lipHeight, `cutter height ${h} reaches the lip`);
});

test("solids touch but never overlap, and openings stay open", () => {
  const d = bench(["arduino-uno", 0, 0], ["hc-sr04", 0, -6.5], ["oled-128x64", 9, 0, 1], ["pir", -9, 0], ["battery-aa4", 0, 7.5, 2], ["relay", 9, 7.5]);
  const e = enclosureFor(d);
  noOverlaps(e);
  for (const c of e.cutouts.filter((x) => x.shape === "rect")) {
    if (c.shape !== "rect") continue;
    const same = e.solids.filter((s) => s.kind === "box" && (c.wall === "lid" ? s.tag === "plate" : s.tag === c.wall));
    for (const s of same) assert.ok(overlap(aabb(s), c) < 1e-6, `${c.id} is open`);
  }
  assert.ok(e.cutouts.length >= 8);
});

test("tiny clearance never puts a standoff through a wall", () => {
  for (const board of ["arduino-uno", "arduino-nano", "esp32-devkit", "pico"]) {
    const e = enclosureFor(bench([board, 0, 0]), { clearance: 0.5 });
    noOverlaps(e, board);
    for (const s of e.solids) {
      if (s.kind !== "cylinder") continue;
      assert.ok(s.center[0] - s.r >= e.inner.min[0] + 0.5 - 1e-6 && s.center[0] + s.r <= e.inner.max[0] - 0.5 + 1e-6, `${board} x`);
      assert.ok(s.center[2] - s.r >= e.inner.min[2] + 0.5 - 1e-6 && s.center[2] + s.r <= e.inner.max[2] - 0.5 + 1e-6, `${board} z`);
    }
  }
});

test("there is always room for the lip above the tallest part", () => {
  const e = enclosureFor(bench(["arduino-uno", 0, 0]), { clearance: 0.5, lipHeight: 4 });
  const tallest = Math.max(...e.parts.map((p) => p.max[1]));
  assert.ok(e.wallsTop >= tallest + 4 - 1e-6);
});

test("every solid has a positive size and finite numbers", () => {
  const e = enclosureFor(bench(["arduino-nano", 0, 0], ["lcd-1602-i2c", 0, 5], ["hc-sr04", 8, 0, 1], ["led", -6, 0]));
  for (const s of e.solids) {
    if (s.kind === "box") for (let i = 0; i < 3; i++) assert.ok(s.max[i] > s.min[i] && Number.isFinite(s.min[i]) && Number.isFinite(s.max[i]));
    else assert.ok(s.r > 0 && s.h > 0 && s.segments >= 3 && s.center.every(Number.isFinite));
    assert.ok(["base", "lid"].includes(s.group));
  }
});

test("toStl: valid binary STL with header, count, unit normals and no NaN", () => {
  const e = enclosureFor(compact());
  const buffer = toStl(e);
  assert.ok(buffer instanceof ArrayBuffer);
  const stl = readStl(buffer);
  const expected = e.solids.reduce((n, s) => n + solidTriangles(s).length, 0);
  assert.equal(stl.count, expected);
  assert.equal(buffer.byteLength, 84 + 50 * stl.count);
  assert.notEqual(new TextDecoder().decode(stl.header.slice(0, 5)), "solid", "a binary header must not look like ASCII STL");
  for (const t of stl.tris) {
    assert.ok(Math.abs(Math.hypot(...t.normal) - 1) < 1e-5, "unit normal");
    assert.ok([...t.normal, ...t.v.flat()].every(Number.isFinite), "no NaN");
    assert.equal(t.attr, 0);
    const n = triangleNormal(...t.v);
    assert.ok(n[0] * t.normal[0] + n[1] * t.normal[1] + n[2] * t.normal[2] > 0.999, "normal agrees with the winding");
  }
});

test("toStl: base and lid alone, side by side by default, z up", () => {
  const e = enclosureFor(compact());
  const all = readStl(toStl(e));
  const base = readStl(toStl(e, "base"));
  const lid = readStl(toStl(e, "lid"));
  assert.ok(base.count > 0 && lid.count > 0);
  assert.equal(all.count, base.count + lid.count);
  const bounds = (stl: ReturnType<typeof readStl>) =>
    [0, 1, 2].map((i) => [Math.min(...stl.tris.flatMap((t) => t.v.map((p) => p[i]))), Math.max(...stl.tris.flatMap((t) => t.v.map((p) => p[i])))]);
  const [bx, by, bz] = bounds(base);
  const [lx, ly, lz] = bounds(lid);
  assert.ok(Math.abs(bx[0]) < 1e-3 && Math.abs(by[0]) < 1e-3 && Math.abs(bz[0]) < 1e-3, "base sits on the bed at the origin");
  assert.ok(Math.abs(bz[1] - e.wallsTop) < 1e-3, "base height");
  assert.ok(Math.abs(bx[1] - e.size.w) < 1e-3 && Math.abs(by[1] - e.size.d) < 1e-3);
  assert.ok(Math.abs(lz[0]) < 1e-3 && Math.abs(lz[1] - (DEFAULTS.lid + DEFAULTS.lipHeight)) < 1e-3, "lid flipped: plate on the bed, lip up");
  assert.ok(Math.abs(lx[0]) < 1e-3 && Math.abs(ly[0]) < 1e-3);
  // in the combined file the lid is moved beside the base
  const [ax] = bounds(all);
  assert.ok(ax[1] > e.size.w * 1.9, "two pieces side by side");
  // the volume of the combined file matches the solids (outward windings, all pieces)
  const volume = all.tris.reduce((s, t) => s + signedVolume([t.v]), 0);
  assert.ok(Math.abs(volume - e.volume) / e.volume < 1e-3, "STL volume = enclosure volume");
  // assembled keeps everything in one frame
  const joined = readStl(toStl(e, null, { assembled: true }));
  assert.equal(joined.count, all.count);
  assert.ok(Math.max(...joined.tris.flatMap((t) => t.v.map((p) => p[2]))) - e.size.h < 1e-3);
});

test("toStl: the base is the same shape as the bench seen from the top (north is +y of the bed)", () => {
  // the USB wall is west (x = 0 in the file); the HC-SR04 eyes are on the north wall (-z), the far side (high y)
  const e = enclosureFor(compact());
  const base = readStl(toStl(e, "base"));
  const wallTop = base.tris.filter((t) => t.v.every((p) => Math.abs(p[1] - e.size.d) < 1e-3));
  assert.ok(wallTop.length > 0, "the north wall's outer face is at y = depth");
  const eyes = e.cutouts.filter((c) => c.label === "eyes");
  assert.equal(eyes.every((c) => c.wall === "north"), true);
});

test("toScad: OpenSCAD with modules, difference, cutouts and balanced brackets", () => {
  const e = enclosureFor(compact());
  const scad = toScad(e);
  assert.match(scad, /module base\(\)/);
  assert.match(scad, /module lid\(\)/);
  assert.ok((scad.match(/difference\(\)/g) ?? []).length >= 3);
  assert.match(scad, /cube\(/);
  assert.match(scad, /cylinder\(/);
  assert.match(scad, /translate\(/);
  assert.ok(!/NaN|undefined|Infinity/.test(scad));
  for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
    assert.equal(scad.split(open).length, scad.split(close).length, `${open}${close} balanced`);
  }
  assert.equal((scad.match(/\$fn = 24/g) ?? []).length, 8, "a ring (two cylinders) per standoff");
  assert.equal((scad.match(/hc-sr04-1 eyes/g) ?? []).length, 2);
  assert.match(toScad(enclosureFor(emptyDesign())), /^\/\//);
});

test("toScad: every standoff and cutout of the model is in the file", () => {
  const e = enclosureFor(bench(["arduino-uno", 0, 0], ["oled-128x64", 9, 0], ["hc-sr04", 0, -6.5, 1]));
  const scad = toScad(e);
  for (const c of e.cutouts) assert.ok(scad.includes(`// ${c.part} ${c.label}`), c.id);
  assert.equal((scad.match(/\/\/ [\w-]+ [\w]+$/gm) ?? []).length, e.cutouts.length);
});

test("print estimate grows with the box and is documented in grams and minutes", () => {
  const small = enclosureFor(bench(["arduino-nano"]));
  const big = enclosureFor(bench(["arduino-uno", 0, 0], ["lcd-1602-i2c", 0, 8], ["relay", 9, 0]));
  for (const e of [small, big]) {
    assert.ok(Number.isInteger(e.printMinutes) && e.printMinutes > 0);
    assert.ok(e.grams > 0 && e.volume > 0);
  }
  assert.ok(big.grams > small.grams && big.printMinutes > small.printMinutes);
  // plastic = volume * 0.84 (2 mm walls: 1.6 mm of shell + 20 % infill in the rest), PLA 1.24 g/cm3
  const got = printEstimate(10000, 20, 2);
  assert.equal(got.grams, Math.round(((10000 * 0.84) / 1000) * 1.24 * 10) / 10);
  assert.ok(Math.abs(small.grams - Math.round(((small.volume * 0.84) / 1000) * 1.24 * 10) / 10) < 0.11);
});

test("the features table only names real parts and well-formed features", () => {
  for (const [type, list] of Object.entries(FEATURES)) {
    assert.ok(componentOf(type), type);
    assert.equal(featuresOf(type), list);
    for (const f of list) {
      assert.ok(["port", "eyes", "window", "hole", "vents"].includes(f.kind), `${type} ${f.kind}`);
      assert.ok(f.label, type);
    }
  }
  assert.deepEqual(featuresOf("nope"), []);
  assert.deepEqual(featuresOf("constructor"), [], "inherited object keys are not features");
  assert.ok(featuresOf("arduino-uno").some((f) => f.label === "usb"));
  for (const c of COMPONENTS.filter((c) => c.kind === "board")) assert.ok(featuresOf(c.id).some((f) => f.label === "usb"), `${c.id} has a USB`);
});

test("every feature sits inside its part's size", () => {
  for (const [type, list] of Object.entries(FEATURES)) {
    const [w, d] = componentOf(type)!.size;
    for (const f of list) {
      if (f.kind === "port" && f.side !== "auto") assert.ok(f.along >= 0 && f.along <= (f.side === "left" || f.side === "right" ? d : w), `${type} ${f.label}`);
      if (f.kind === "window") assert.ok(f.w <= w && f.d <= d, `${type} ${f.label} fits`);
      if (f.kind === "hole") assert.ok(Math.abs(f.offset[0]) + f.r <= w / 2 + 1.5 && Math.abs(f.offset[1]) + f.r <= d / 2 + 1.5, `${type} ${f.label} fits (a small flange may stick out)`);
      if (f.kind === "vents") assert.ok(Math.abs(f.offset[0]) + ((f.count - 1) / 2) * f.pitch + f.w / 2 <= w / 2 + 1e-6, `${type} ${f.label} fits`);
    }
  }
});

test("every catalog part fits in a box without breaking it", () => {
  for (const c of COMPONENTS.filter((c) => c.kind === "part")) {
    for (const rot of [0, 1, 2, 3]) {
      const e = enclosureFor(bench(["arduino-uno", 0, 0], [c.id, 0, 0, rot]));
      assert.ok(e.ok, c.id);
      noOverlaps(e, `${c.id} rot ${rot}`);
      const stl = readStl(toStl(e));
      assert.ok(stl.tris.every((t) => Number.isFinite(t.normal[0]) && Math.abs(Math.hypot(...t.normal) - 1) < 1e-5), c.id);
    }
  }
});

test("a crowded bench stays a clean, bounded model", () => {
  // every part of the catalog around two boards, at every rotation: nothing overlaps and the STL size matches
  const parts = COMPONENTS.filter((c) => c.kind === "part");
  const items: Item[] = [["arduino-uno", 0, 0], ["esp32-devkit", 0, 14, 1], ...parts.map((p, i): Item => [p.id, (i % 6) * 9 - 22, -10 - Math.floor(i / 6) * 9, i % 4])];
  const e = enclosureFor(bench(...items));
  assert.ok(e.ok);
  noOverlaps(e, "crowded");
  const stl = toStl(e);
  assert.equal(stl.byteLength, 84 + 50 * e.solids.reduce((n, s) => n + solidTriangles(s).length, 0));
});
