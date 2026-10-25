import test from "node:test";
import assert from "node:assert/strict";
import { fitsView, frameBoxes, screenOf, type Box3, type FrameOptions } from "../src/models/lab/framing.ts";

const base: FrameOptions = {
  azimuth: Math.PI / 4,
  elevation: (44 * Math.PI) / 180,
  width: 1600,
  height: 1000,
  insets: { left: 0, right: 0, top: 0, bottom: 0 },
};
const box = (x: number, z: number, w = 10, d = 6, h = 2): Box3 => ({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });

test("with no panels, a centered box is looked at straight on", () => {
  const f = frameBoxes([box(0, 0, 10, 6, 0)], base)!;
  assert.ok(Math.abs(f.x) < 0.3 && Math.abs(f.z) < 0.3, JSON.stringify(f));
});

test("the target moves so the content sits between the panels", () => {
  const boxes = [box(0, 0, 10, 6, 0)];
  const insets = { left: 400, right: 400, top: 0, bottom: 0 };
  const f = frameBoxes(boxes, { ...base, insets })!;
  // equal panels on both sides keep it centered
  assert.ok(Math.abs(f.x) < 0.3 && Math.abs(f.z) < 0.3);
  const right = frameBoxes(boxes, { ...base, insets: { ...insets, left: 0 } })!;
  // the chat covers the right: the content must appear left of the middle, so the camera looks to the right of it
  const [sx] = screenOf(right.x, 0, right.z, base.azimuth, base.elevation);
  assert.ok(sx > 0.5, `looks right of the box: ${sx}`);
  assert.ok(fitsView(boxes, right, { ...base, insets: { ...insets, left: 0 } }));
});

test("fitting leaves the boxes inside the free area, zooming out for a big spread", () => {
  const boxes = [box(-30, -10), box(30, 14, 20, 12, 6)];
  const opts = { ...base, insets: { left: 330, right: 404, top: 0, bottom: 90 } };
  const f = frameBoxes(boxes, opts)!;
  assert.ok(fitsView(boxes, f, opts, 0));
  assert.ok(f.zoom < 1);
  const small = frameBoxes([box(0, 0)], opts)!;
  assert.ok(small.zoom > f.zoom);
});

test("fitsView says no when a box is under the chat", () => {
  const opts = { ...base, insets: { left: 0, right: 404, top: 0, bottom: 0 } };
  assert.equal(fitsView([box(0, 0)], { x: -30, z: 30, zoom: 1 }, opts), false);
  assert.equal(fitsView([box(0, 0)], { x: 0, z: 0, zoom: 1 }, { ...base, insets: { ...opts.insets, right: 0 } }), true);
});

test("nothing to frame, nothing to do", () => {
  assert.equal(frameBoxes([], base), null);
  assert.equal(frameBoxes([box(0, 0)], { ...base, width: 0 }), null);
});
