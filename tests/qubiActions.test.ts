import test from "node:test";
import assert from "node:assert/strict";
import {
  MENU_KEYS, PART_KEYS, THROW, dropBoxes, isActionKey, menuActions, partActions, partAtPoint, resolveDrop, throwMs, velocityOf,
  type DropBox,
} from "../src/models/qubi/actions.ts";
import { COMPONENTS } from "../src/models/lab/catalog.ts";

const boxes: DropBox[] = [
  { id: "board", x: 0, z: 0, w: 10, d: 6 },
  { id: "sensor", x: 2, z: 0, w: 2, d: 2 }, // lies on the board
  { id: "led", x: 12, z: 0, w: 2, d: 2 },
];

test("the tap menu lists the general jobs, plus explain only with a selected part", () => {
  assert.deepEqual(menuActions({}).map((a) => a.key), [...MENU_KEYS]);
  assert.deepEqual(menuActions({ selectedPart: null }).map((a) => a.key), [...MENU_KEYS]);
  const withPart = menuActions({ selectedPart: "led-1" });
  assert.equal(withPart.length, MENU_KEYS.length + 1);
  assert.deepEqual(withPart.at(-1), { key: "explain", part: "led-1" });
  assert.ok(withPart.slice(0, -1).every((a) => a.part === undefined));
});

test("the part question offers explain, connect, rotate and remove, all about that part", () => {
  const list = partActions("led-1");
  assert.deepEqual(list.map((a) => a.key), [...PART_KEYS]);
  assert.ok(list.every((a) => a.part === "led-1"));
  assert.ok(list.every((a) => isActionKey(a.key)));
  assert.equal(isActionKey("nope"), false);
  assert.equal(isActionKey(3), false);
});

test("a point is on the part it is inside; the smallest one wins when they overlap", () => {
  assert.equal(partAtPoint({ x: -3, z: 1 }, boxes), "board");
  assert.equal(partAtPoint({ x: 2, z: 0.5 }, boxes), "sensor");
  assert.equal(partAtPoint({ x: 12, z: 0 }, boxes), "led");
});

test("a point just outside a part's edge still counts, farther out it does not", () => {
  assert.equal(partAtPoint({ x: 13.5, z: 0 }, boxes), "led"); // 0.5 past the edge
  assert.equal(partAtPoint({ x: 0, z: 20 }, boxes), null);
  assert.equal(partAtPoint({ x: 8, z: 0 }, boxes), null); // 2 from the board's edge, 3 from the led's
  assert.equal(partAtPoint({ x: 0, z: 0 }, []), null);
  assert.equal(partAtPoint({ x: 6, z: 0 }, boxes, 2), "board"); // a bigger reach
});

test("between two parts, the nearer edge wins", () => {
  const two: DropBox[] = [
    { id: "a", x: 0, z: 0, w: 2, d: 2 },
    { id: "b", x: 3, z: 0, w: 2, d: 2 },
  ];
  assert.equal(partAtPoint({ x: 1.2, z: 0 }, two), "a");
  assert.equal(partAtPoint({ x: 1.9, z: 0 }, two), "b");
});

test("drop boxes follow the catalog footprint and the turn of each part", () => {
  const type = COMPONENTS.find((c) => c.size[0] !== c.size[1])?.id ?? COMPONENTS[0].id;
  const [straight] = dropBoxes([{ id: "p", type, x: 4, z: 5, rot: 0 }]);
  const [turned] = dropBoxes([{ id: "p", type, x: 4, z: 5, rot: 1 }]);
  assert.deepEqual([straight.x, straight.z], [4, 5]);
  assert.equal(straight.w, turned.d);
  assert.equal(straight.d, turned.w);
});

test("velocity comes from the last moves only", () => {
  assert.deepEqual(velocityOf([]), { x: 0, z: 0 });
  assert.deepEqual(velocityOf([{ x: 0, z: 0, t: 0 }]), { x: 0, z: 0 });
  const v = velocityOf([
    { x: -50, z: 0, t: 0 }, // too old
    { x: 0, z: 0, t: 1000 },
    { x: 3, z: -1.5, t: 1060 },
  ]);
  assert.ok(Math.abs(v.x - 50) < 1e-9 && Math.abs(v.z + 25) < 1e-9);
  // all in one instant: no velocity
  assert.deepEqual(velocityOf([{ x: 0, z: 0, t: 5 }, { x: 9, z: 9, t: 5 }]), { x: 0, z: 0 });
});

test("letting go slowly drops him where the hand is, on a part or on the empty bench", () => {
  const onPart = resolveDrop({ x: 12, z: 0.3 }, { x: 2, z: 1 }, boxes);
  assert.deepEqual(onPart, { land: { x: 12, z: 0.3 }, thrown: false, part: "led", center: { x: 12, z: 0 } });
  const onNothing = resolveDrop({ x: 6, z: 12 }, { x: 0, z: 0 }, boxes);
  assert.equal(onNothing.part, null);
  assert.equal(onNothing.center, null);
  assert.equal(onNothing.thrown, false);
  assert.deepEqual(onNothing.land, { x: 6, z: 12 });
});

test("a throw carries him on, and goes to the part where it lands", () => {
  const drop = resolveDrop({ x: 0, z: 10 }, { x: 40, z: -40 }, boxes); // speed 56: thrown, 10 units each way
  assert.equal(drop.thrown, true);
  assert.ok(Math.hypot(drop.land.x - 0, drop.land.z - 10) > 5);
  const straight = resolveDrop({ x: 4, z: 0 }, { x: 32, z: 0 }, boxes); // lands 8 later, x = 12: the led
  assert.equal(straight.part, "led");
  assert.deepEqual(straight.center, { x: 12, z: 0 });
});

test("a throw that lands on nothing falls back to the part under the hand", () => {
  const drop = resolveDrop({ x: 0, z: 0 }, { x: 0, z: 50 }, boxes);
  assert.equal(drop.thrown, true);
  assert.equal(drop.part, "board");
});

test("a throw never goes farther than the limit and stays on the bench", () => {
  const far = resolveDrop({ x: 0, z: 0 }, { x: 1000, z: 0 }, []);
  assert.ok(Math.abs(far.land.x - THROW.maxDistance) < 1e-9);
  const edge = resolveDrop({ x: 59, z: 0 }, { x: 1000, z: 0 }, []);
  assert.equal(edge.land.x, THROW.limit);
});

test("slower than the throw speed is only a drop", () => {
  const drop = resolveDrop({ x: 0, z: 0 }, { x: THROW.minSpeed - 1, z: 0 }, []);
  assert.equal(drop.thrown, false);
  assert.deepEqual(drop.land, { x: 0, z: 0 });
});

test("a throw flies for a brisk, bounded time", () => {
  assert.equal(throwMs(0), 450);
  assert.equal(throwMs(10), 600);
  assert.equal(throwMs(500), 1100);
});

test("the bench input asks LabBench's claim and every extra claimer, and keeps them apart", async () => {
  const { benchInput } = await import("../src/views/scene/lab/benchInput.ts");
  const ask = (x: number, y: number) => benchInput.claims?.(x, y);
  assert.equal(benchInput.claims, null);
  benchInput.claims = (x) => x < 10; // LabBench
  assert.equal(ask(5, 0), true);
  assert.equal(ask(50, 0), false);
  const drop = benchInput.claim((x) => x > 40); // Qubi
  assert.equal(ask(5, 0), true);
  assert.equal(ask(50, 0), true);
  assert.equal(ask(20, 0), false);
  benchInput.claims = null; // LabBench goes away: Qubi's claim stays
  assert.equal(ask(50, 0), true);
  assert.equal(ask(5, 0), false);
  drop();
  assert.equal(benchInput.claims, null);
});
