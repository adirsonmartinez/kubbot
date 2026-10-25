// Which way the particles run along a wire (pure, tested in tests/wireCurve.test.ts). Relative imports
// with the .ts extension so Node can run the test without the bundler's aliases.

import { componentOf } from "../../../models/lab/catalog.ts";
import type { Design, Wire } from "../../../models/lab/circuit.ts";
import type { WireKind } from "../../../models/lab/layout.ts";

// Particles go from the wire's first end to its last, unless this says otherwise. Power and buses
// go from the board to the part, ground comes back, a sensor's signal goes to the board and an
// actuator's comes from it.
export function flowsBackwards(design: Design, wire: Wire, kind: WireKind): boolean {
  const typeOf = (id: string) => componentOf(design.parts.find((p) => p.id === id)?.type);
  const from = typeOf(wire.from.part);
  const to = typeOf(wire.to.part);
  const fromBoard = from?.kind === "board";
  const toBoard = to?.kind === "board";
  if (fromBoard === toBoard) return false;
  const part = fromBoard ? to : from;
  const towardBoard = kind === "gnd" || (kind === "signal" && (part?.category === "sensors" || part?.category === "inputs"));
  return towardBoard ? fromBoard : toBoard;
}
