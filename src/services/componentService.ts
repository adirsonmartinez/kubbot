// The component catalog. Placeholders for now: swap this for the real catalog.

import type { MapComponent } from "@/models/component";

const PLACEHOLDER_COUNT = 8;

export function listComponents(): MapComponent[] {
  return Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({
    id: `c${i + 1}`,
    name: `Componente ${i + 1}`,
  }));
}
