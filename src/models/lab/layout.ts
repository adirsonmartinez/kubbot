// Where things are on the lab's bench (world units: 1 = 10 mm, y up). Pure: the 3D bench draws from it
// and the tests check it. A part lies flat at (x, z), turned rot quarter turns; its pins are header pins
// on its edges: a board has power and analog on the near edge (+z) and the rest on the far edge (-z), a
// part has all of them in one row on its near edge, in catalog order.

import { componentOf, type BoardPin, type PartPin } from "./catalog.ts";
import type { Design, PlacedPart, Wire } from "./circuit.ts";

export const MM = 0.1;
const PIN_INSET = 0.25; // from the edge, so the pin sits on the board
const PIN_HEIGHT = 0.12;

export type PinSpot = { pin: string; x: number; y: number; z: number };
export type Footprint = { x: number; z: number; w: number; d: number; h: number; rot: number };
export type WireKind = "power" | "gnd" | "bus" | "signal";

const NEAR_KINDS = new Set(["5v", "3v3", "vin", "gnd", "analog"]);
const nearEdge = (pin: BoardPin) => pin.kinds.some((k) => NEAR_KINDS.has(k)) && !pin.kinds.includes("pwm");

// Footprint of a part on the ground: center, width (x) and depth (z) after turning, and height
export function partBox(part: Pick<PlacedPart, "type" | "x" | "z" | "rot">): Footprint {
  const spec = componentOf(part.type);
  const [w, d, h] = (spec?.size ?? [10, 10, 10]).map((v) => v * MM);
  const turned = part.rot % 2 === 1;
  return { x: part.x, z: part.z, w: turned ? d : w, d: turned ? w : d, h, rot: part.rot };
}

// Turns a local point (x across, z deep, centered on the part) by rot quarter turns. A part group in
// three.js matches it with rotation.y = -rot * PI / 2.
export function turn(x: number, z: number, rot: number): [number, number] {
  for (let i = 0; i < rot; i++) [x, z] = [-z, x];
  return [x, z];
}

export function pinSpots(part: Pick<PlacedPart, "type" | "x" | "z" | "rot">): PinSpot[] {
  const spec = componentOf(part.type);
  if (!spec) return [];
  const [w, d, h] = spec.size.map((v) => v * MM);
  const rows: (BoardPin | PartPin)[][] =
    spec.kind === "board" ? [spec.pins.filter(nearEdge), spec.pins.filter((p) => !nearEdge(p))] : [spec.pins, []];
  const top = Math.min(h, 0.3) + PIN_HEIGHT;
  return rows.flatMap((row, r) =>
    row.map((pin, i) => {
      const span = w - PIN_INSET * 2;
      const lx = row.length === 1 ? 0 : -span / 2 + (span * i) / (row.length - 1);
      const lz = (r === 0 ? 1 : -1) * (d / 2 - PIN_INSET);
      const [x, z] = turn(lx, lz, part.rot);
      return { pin: pin.id, x: part.x + x, y: top, z: part.z + z };
    }),
  );
}

export function pinSpot(part: Pick<PlacedPart, "type" | "x" | "z" | "rot">, pinId: string): PinSpot | null {
  return pinSpots(part).find((s) => s.pin === pinId) ?? null;
}

// A free spot for a new part. Asked for (x, z) it keeps that spot (snapped to 0.5) when nothing is there;
// otherwise, or with no point at all, it looks around the anchor (the point, or the first board when none
// is given) for the closest spot that leaves a gap, preferring the front (+z). The result is a compact
// cluster around the board instead of a long row. Pure and deterministic: ties break by z then x.
const GAP = 0.6;
const STEP = 0.5;
const REACH = 40; // how far from the anchor to look (world units)
const snapHalf = (v: number) => Math.round(v * 2) / 2;

export function freeSpot(design: Design, type: string, x?: number, z?: number): { x: number; z: number } {
  const boxes = design.parts.map(partBox);
  const first = design.parts.find((p) => componentOf(p.type)?.kind === "board") ?? design.parts[0];
  const ax = snapHalf(x ?? first?.x ?? 0);
  const az = snapHalf(z ?? first?.z ?? 0);
  if (!componentOf(type)) return { x: ax, z: az };
  const probe = partBox({ type, x: 0, z: 0, rot: 0 });
  const free = (px: number, pz: number) =>
    !boxes.some((b) => Math.abs(px - b.x) * 2 < probe.w + b.w + GAP && Math.abs(pz - b.z) * 2 < probe.d + b.d + GAP);
  if (x !== undefined && z !== undefined && free(ax, az)) return { x: ax, z: az };
  if (!boxes.length) return { x: ax, z: az };
  let best: { x: number; z: number; cost: number } | null = null;
  const n = Math.round(REACH / STEP);
  for (let iz = -n; iz <= n; iz++) {
    for (let ix = -n; ix <= n; ix++) {
      const px = ax + ix * STEP;
      const pz = az + iz * STEP;
      const dz = pz - az;
      const cost = Math.hypot(px - ax, dz) + (dz < 0 ? 1.5 : 0);
      if (best && cost >= best.cost - 1e-9) continue;
      if (free(px, pz)) best = { x: px, z: pz, cost };
    }
  }
  if (best) return { x: best.x, z: best.z };
  return { x: ax + REACH, z: az };
}

// What a wire carries, for its color
export function wireKind(design: Design, wire: Wire): WireKind {
  const kinds = [wire.from, wire.to].flatMap((end) => {
    const part = design.parts.find((p) => p.id === end.part);
    const pin = (componentOf(part?.type)?.pins as (BoardPin | PartPin)[] | undefined)?.find((p) => p.id === end.pin);
    return pin ? ("kinds" in pin ? pin.kinds : pin.accepts) : [];
  }) as string[];
  if (kinds.includes("gnd")) return "gnd";
  if (kinds.some((k) => k === "5v" || k === "3v3" || k === "vin")) return "power";
  if (kinds.some((k) => k === "sda" || k === "scl")) return "bus";
  return "signal";
}
