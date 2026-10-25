// Loads manifold-3d (Apache-2.0, WASM) once and lazily, in the browser and in Node. No network: the browser
// reads /manifold.wasm from our own public/ folder (a copy of node_modules/manifold-3d/manifold.wasm, keep it
// in step when the package version changes); Node finds the wasm next to the package.

import type { ManifoldToplevel } from "manifold-3d";

let loading: Promise<ManifoldToplevel | null> | null = null;

// -> the ready module, or null when the WASM could not be loaded (callers fall back to the plain STL)
export function loadManifold(): Promise<ManifoldToplevel | null> {
  loading ??= (async () => {
    try {
      const { default: Module } = await import("manifold-3d");
      const browser = typeof window !== "undefined";
      const wasm = await Module(browser ? { locateFile: () => "/manifold.wasm" } : undefined);
      wasm.setup();
      return wasm;
    } catch {
      loading = null; // a later try may work (offline blip, cache)
      return null;
    }
  })();
  return loading;
}
