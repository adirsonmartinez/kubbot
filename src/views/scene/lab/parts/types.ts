// Shared types for the lab's procedural parts (see index.ts for the public API).
import type * as THREE from "three";
import type { Component } from "../../../../models/lab/catalog.ts";

// A pin position in millimetres, local to the part's footprint centre (what a builder sees)
export type SpotMm = { pin: string; x: number; y: number; z: number };

// How the generic code around a builder draws the pin housing under the pin posts
export type PinOptions = {
  housing: "strips" | "singles" | "none";
  base: number; // top of the PCB (mm), where the housing and the posts start
  colors: Record<string, number>; // optional colour per pin id
};

// Anything three.js can free
export type Disposable = { dispose(): void };

// What a builder receives. It draws into `body` (millimetres) and may return `{ sim }`.
export type PartContext = {
  spec: Component;
  body: THREE.Group;
  spots: SpotMm[];
  pinOptions: PinOptions;
  own: <T extends Disposable>(resource: T) => T; // freed by dispose()
  tick: (fn: (t: number, dt: number) => void) => void; // runs on every update()
};

// A live simulation state, already checked to be an object and not dead. Fields are read with the helpers
// below, so a missing or odd value never throws.
export type SimInput = Record<string, unknown>;

export type Builder = (ctx: PartContext) => { sim?: (state: SimInput | null) => void } | void;

export const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
export const flag = (value: unknown): boolean => value === true;
export const textLines = (value: unknown): [string, string] | null => {
  if (!Array.isArray(value)) return null;
  return [String(value[0] ?? ""), String(value[1] ?? "")];
};
