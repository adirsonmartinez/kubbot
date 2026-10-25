import test from "node:test";
import assert from "node:assert/strict";
import { checkDesign } from "../src/models/lab/circuit.ts";
import { parkingSensor } from "../src/models/lab/examples.ts";
import { partBox } from "../src/models/lab/layout.ts";

test("the example circuit is complete, green and has no overlapping parts", () => {
  const d = parkingSensor();
  assert.equal(d.parts.length, 5);
  assert.deepEqual(checkDesign(d).issues, []);
  const boxes = d.parts.map(partBox);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.z - b.z) * 2 >= a.d + b.d, `${d.parts[i].id} / ${d.parts[j].id}`);
  }
});
