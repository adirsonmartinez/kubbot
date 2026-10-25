// What the bench's pieces share: the eased pose of every part (wires and labels read it), the
// commands of the view model (always the latest ones) and a way to turn a screen point into the floor.

import { createContext, useContext } from "react";
import { pinSpots } from "@/models/lab/layout";
import { benchPoint, localToBench, type Box, type Vec3 } from "./wireCurve";

// Where a part is drawn right now (it eases toward the design: drags, turns, drops)
export type PartPose = { x: number; z: number; y: number; angle: number; w: number; d: number; h: number; shown: boolean };

export class PoseStore {
  private poses = new Map<string, PartPose>();
  private cache: { version: number; boxes: Box[] } = { version: -1, boxes: [] };
  version = 0; // bumps whenever any pose changes

  get(id: string) {
    return this.poses.get(id);
  }

  set(id: string, pose: PartPose) {
    this.poses.set(id, pose);
    this.version++;
  }

  delete(id: string) {
    if (this.poses.delete(id)) this.version++;
  }

  // World position of a point given in a part's own frame
  pinWorld(id: string, local: Vec3): Vec3 | null {
    const pose = this.poses.get(id);
    return pose ? benchPoint(local, pose, pose.y) : null;
  }

  // The parts as boxes for wires to clear (rebuilt only when something moved)
  obstacles(): Box[] {
    if (this.cache.version !== this.version) {
      this.cache = {
        version: this.version,
        boxes: [...this.poses].filter(([, p]) => p.shown).map(([id, p]) => ({ id, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h + p.y })),
      };
    }
    return this.cache.boxes;
  }
}

export type BenchActions = {
  select: (id: string | null) => void;
  move: (id: string, at: { x: number; z: number }) => void;
  moveEnd: () => void;
  pickPin: (part: string, pin: string) => void;
  hoverPin: (part: string | null, pin: string | null) => void;
  hovered: () => { part: string; pin: string } | null;
  isWiring: () => boolean;
  removeWire: (id: string) => void;
};

export type BenchContextValue = {
  poses: PoseStore;
  actions: BenchActions;
  groundAt: (clientX: number, clientY: number) => { x: number; z: number } | null;
};

export const BenchContext = createContext<BenchContextValue | null>(null);

export function useBench(): BenchContextValue {
  const value = useContext(BenchContext);
  if (!value) throw new Error("useBench must be used inside LabBench");
  return value;
}

// --- Pins ---

// Where each pin is in its part's own frame (the part unturned and at the origin)
const localPins = new Map<string, Map<string, Vec3>>();
export function localPin(type: string, pin: string): Vec3 | null {
  let spots = localPins.get(type);
  if (!spots) {
    spots = new Map(pinSpots({ type, x: 0, z: 0, rot: 0 }).map((s) => [s.pin, { x: s.x, y: s.y, z: s.z }]));
    localPins.set(type, spots);
  }
  return spots.get(pin) ?? null;
}

// A pin's world position as drawn now (the part may be mid-drag, mid-turn or still falling in); before the
// part has a pose, where the design puts it
export function pinPosition(poses: PoseStore, part: { id: string; type: string; x: number; z: number; rot: number }, pin: string): Vec3 | null {
  const local = localPin(part.type, pin);
  if (!local) return null;
  return poses.pinWorld(part.id, local) ?? localToBench(local, part);
}

// The mouse cursor over the canvas ("" gives it back to the map's own styles)
export function setCursor(canvas: HTMLElement, value: string) {
  canvas.style.cursor = value;
}
