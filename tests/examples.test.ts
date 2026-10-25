import test from "node:test";
import assert from "node:assert/strict";
import { checkDesign } from "../src/models/lab/circuit.ts";
import { EXAMPLES, EXAMPLE_NAMES, exampleDesign, plantWaterer, weatherStation } from "../src/models/lab/examples.ts";
import { partBox } from "../src/models/lab/layout.ts";

const typesOf = (name: keyof typeof EXAMPLES) => EXAMPLES[name]().parts.map((p) => p.type).sort();

test("every example is complete, green and has no overlapping parts", () => {
  assert.ok(EXAMPLE_NAMES.length >= 3);
  for (const name of EXAMPLE_NAMES) {
    const d = EXAMPLES[name]();
    assert.ok(d.parts.length >= 3, name);
    assert.ok(d.wires.length >= d.parts.length - 1, `${name} is wired`);
    assert.deepEqual(checkDesign(d).issues, [], name);
    assert.equal(checkDesign(d).level, "green", name);
    const boxes = d.parts.map(partBox);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.z - b.z) * 2 >= a.d + b.d, `${name}: ${d.parts[i].id} / ${d.parts[j].id}`);
    }
  }
});

test("the parking sensor has five parts and the LED's resistor", () => {
  assert.equal(EXAMPLES.parkingSensor().parts.length, 6);
});

test("the weather station is a board, a DHT22 and an OLED screen", () => {
  assert.deepEqual(typesOf("weatherStation"), ["arduino-uno", "dht22", "oled-128x64"]);
  assert.equal(weatherStation().wires.length, 7); // 3 for the sensor, 4 for the screen
});

test("the plant waterer is a board, a soil sensor, a relay and an LED", () => {
  assert.deepEqual(typesOf("plantWaterer"), ["arduino-uno", "led", "relay", "resistor-220", "soil"]);
  assert.equal(plantWaterer().wires.length, 9); // soil 3, relay 3, led 3 (its resistor takes two)
});

test("examples are fresh designs each time and are found by name only", () => {
  assert.notEqual(exampleDesign("weatherStation"), exampleDesign("weatherStation"));
  for (const bad of ["", "nope", "__proto__", "toString", 3, null, undefined, {}]) assert.equal(exampleDesign(bad), null);
});
