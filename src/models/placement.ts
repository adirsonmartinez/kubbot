// Components placed on the map, each covering a square of grid cells. No React, no I/O.

import type { GroundPoint } from "./camera";
import { type ComponentKind, footprintOf } from "./component";

// A grid cell by its integer corner: the cell spans [x, x + 1) × [z, z + 1)
export type Cell = { x: number; z: number };

// A square of cells: from `cell` (its lowest corner), `size` cells per side
export type Area = { cell: Cell; size: number };

export type Placement = Area & {
  id: string;
  kind: ComponentKind;
};

let nextId = 0;

// The area a component of this kind covers when centered on a ground point
export function areaAt(point: GroundPoint, kind: ComponentKind): Area {
  const size = footprintOf(kind);
  return {
    cell: { x: Math.round(point.x - size / 2), z: Math.round(point.z - size / 2) },
    size,
  };
}

export function areaCenter({ cell, size }: Area): GroundPoint {
  return { x: cell.x + size / 2, z: cell.z + size / 2 };
}

export function sameArea(a: Area | null, b: Area | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.size === b.size && a.cell.x === b.cell.x && a.cell.z === b.cell.z)
  );
}

function overlaps(a: Area, b: Area): boolean {
  return (
    a.cell.x < b.cell.x + b.size &&
    b.cell.x < a.cell.x + a.size &&
    a.cell.z < b.cell.z + b.size &&
    b.cell.z < a.cell.z + a.size
  );
}

export function isFree(placements: Placement[], area: Area): boolean {
  return !placements.some((p) => overlaps(p, area));
}

// Taken areas are left alone: the same list comes back
export function place(placements: Placement[], kind: ComponentKind, area: Area): Placement[] {
  if (!isFree(placements, area)) return placements;
  return [...placements, { id: `p${++nextId}`, kind, ...area }];
}
