// Ready-made circuits to try the lab with one click (and for Qubi to load). Built with the same pure
// functions a person uses, so an example is always a valid, checker-green design with no overlapping
// parts. Add one by writing its layout in LAYOUTS and its name in EXAMPLE_NAMES; the tests check both.

import { addPart, autoWire, emptyDesign, type Design } from "./circuit.ts";

type Place = [type: string, x: number, z: number];

// Parts laid out around the first one (the board), every other part wired to it by the lab's own rules
function build(place: Place[]): Design {
  let d = emptyDesign();
  for (const [type, x, z] of place) d = addPart(d, type, { x, z }).design;
  const board = d.parts[0]?.id;
  for (const p of d.parts) if (p.id !== board) d = autoWire(d, p.id).design;
  return d;
}

// The parking sensor: something comes close, the servo turns, the LED lights and the screen shows how far
export function parkingSensor(): Design {
  return build([
    ["arduino-uno", 0, 0],
    ["hc-sr04", 0, 6],
    ["servo-sg90", 6, 0],
    ["led", 5, 4],
    ["oled-128x64", -6, 3],
  ]);
}

// The weather station: the DHT22 reads temperature and humidity and the screen shows them
export function weatherStation(): Design {
  return build([
    ["arduino-uno", 0, 0],
    ["dht22", 5, 5.5],
    ["oled-128x64", -5.5, 3],
  ]);
}

// The plant waterer: the soil sensor feels the dryness, the relay switches the pump and the LED warns
export function plantWaterer(): Design {
  return build([
    ["arduino-uno", 0, 0],
    ["soil", 0, 5.5],
    ["relay", 7.5, 1],
    ["led", -5.5, 4],
  ]);
}

// The first project: a light that follows a button. The LED gets its 220 Ω resistor from "Conectar solo"
export function blinkButton(): Design {
  return build([
    ["arduino-uno", 0, 0],
    ["button", -5, 4.5],
    ["led", 4, 4.5],
  ]);
}

export const EXAMPLES = { parkingSensor, weatherStation, plantWaterer, blinkButton } as const;
export type ExampleName = keyof typeof EXAMPLES;
export const EXAMPLE_NAMES = Object.keys(EXAMPLES) as ExampleName[];

// An example by name, or null when there is none with that name
export function exampleDesign(name: unknown): Design | null {
  return typeof name === "string" && Object.hasOwn(EXAMPLES, name) ? EXAMPLES[name as ExampleName]() : null;
}
