// The component catalog. The rest of the slots are placeholders until more components exist.

import type { MapComponent } from "@/models/component";

const CATALOG: MapComponent[] = [{ id: "button", name: "Button", kind: "button" }];

const SLOTS = 8;

export function listComponents(): MapComponent[] {
  const placeholders = Array.from({ length: SLOTS - CATALOG.length }, (_, i) => ({
    id: `slot${i + 1}`,
    name: "Próximamente",
    kind: null,
  }));
  return [...CATALOG, ...placeholders];
}
