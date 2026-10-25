// Components that can be placed on the map. No React, no I/O.

export type ComponentKind = "button";

export type MapComponent = {
  id: string;
  name: string;
  kind: ComponentKind | null; // null: an empty catalog slot
};

// Grid cells per side each component covers on the map
const FOOTPRINT: Record<ComponentKind, number> = {
  button: 3,
};

export function footprintOf(kind: ComponentKind): number {
  return FOOTPRINT[kind];
}
