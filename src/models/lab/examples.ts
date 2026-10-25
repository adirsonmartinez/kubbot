// Ready-made circuits to try the lab with one click. Built with the same pure functions a person uses,
// so an example is always a valid, checker-green design.

import { addPart, autoWire, emptyDesign, type Design } from "./circuit.ts";

// The parking sensor: something comes close, the servo turns, the LED lights and the screen shows how far
export function parkingSensor(): Design {
  let d = emptyDesign();
  const place: [string, number, number][] = [
    ["arduino-uno", 0, 0],
    ["hc-sr04", 0, 6],
    ["servo-sg90", 6, 0],
    ["led", 5, 4],
    ["oled-128x64", -6, 3],
  ];
  for (const [type, x, z] of place) d = addPart(d, type, { x, z }).design;
  for (const p of d.parts) if (p.type !== "arduino-uno") d = autoWire(d, p.id).design;
  return d;
}
