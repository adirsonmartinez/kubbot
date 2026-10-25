// Print-layer geometry: slice enclosure solids into 3D-printer layers.
// Pure, no DOM, no three.js. Types are used by the view to draw layers.
//
//   layersOf(enclosure, layerMm = 0.6) -> Layer[]
//   printPlan(enclosure) -> { layers, totalMinutes, grams }
//

import type { Enclosure, Solid } from "./enclosure.ts";

export type RectFeature = { kind: "rect"; x0: number; x1: number; z0: number; z1: number };
export type RingFeature = { kind: "ring"; cx: number; cz: number; r: number; rInner?: number };
export type LayerFeature = RectFeature | RingFeature;
export type Layer = { y: number; features: LayerFeature[] };

// Cross-section of one solid at a given Y.
function sliceSolid(solid: Solid, y: number): LayerFeature | null {
  if (solid.kind === "box") {
    if (solid.min[1] <= y && y <= solid.max[1]) {
      return { kind: "rect", x0: solid.min[0], x1: solid.max[0], z0: solid.min[2], z1: solid.max[2] };
    }
  } else if (solid.kind === "cylinder") {
    if (solid.center[1] <= y && y <= solid.center[1] + solid.h) {
      return { kind: "ring", cx: solid.center[0], cz: solid.center[2], r: solid.r, rInner: solid.rInner };
    }
  }
  return null;
}

// Slice the enclosure into horizontal layers at `layerMm` intervals.
// Each layer holds the features (rects and rings) that exist at that height.
// Layers with no features are skipped.
export function layersOf(enclosure: Enclosure, layerMm = 0.6): Layer[] {
  if (!enclosure.ok) return [];

  const layers: Layer[] = [];
  const minY = enclosure.outer.min[1];
  const maxY = enclosure.outer.max[1];

  for (let y = minY; y <= maxY + 1e-9; y += layerMm) {
    const features: LayerFeature[] = [];

    for (const solid of enclosure.solids) {
      const slice = sliceSolid(solid, y);
      if (slice) features.push(slice);
    }

    if (features.length > 0) {
      layers.push({ y: Math.round(y * 1000) / 1000, features });
    }
  }

  return layers;
}

// Print plan: all layers plus estimated time and mass.
// Reuses the enclosure's own printEstimate (from printMinutes / grams).
export function printPlan(enclosure: Enclosure): { layers: Layer[]; totalMinutes: number; grams: number } {
  const layers = layersOf(enclosure);
  return {
    layers,
    totalMinutes: enclosure.printMinutes,
    grams: enclosure.grams,
  };
}