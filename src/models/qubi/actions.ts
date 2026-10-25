// What Qubi's hands-on controls offer, as pure logic (no React, no three.js): the action menu he opens when
// tapped, the question he asks when dropped on a part, and where a drag-and-throw ends up. The view
// (views/scene/lab/qubi) draws and animates; the orchestrator maps each action key to a chat prompt or tool.

import type { PlacedPart } from "../lab/circuit.ts";
import { partBox } from "../lab/layout.ts";

export type Vec2 = { x: number; z: number };

// The menu on his bubble (tap). `explain` is only offered when a part is selected.
export const MENU_KEYS = ["call", "ideas", "check", "wireAll", "simulate", "enclosure"] as const;
// What he can do with the part he was dropped on
export const PART_KEYS = ["explain", "connect", "rotate", "remove"] as const;

export type QubiActionKey = (typeof MENU_KEYS)[number] | (typeof PART_KEYS)[number];

// One entry of a menu: `part` is set for the ones about a part
export type QubiAction = { key: QubiActionKey; part?: string };

export const isActionKey = (value: unknown): value is QubiActionKey =>
  typeof value === "string" && ((MENU_KEYS as readonly string[]).includes(value) || (PART_KEYS as readonly string[]).includes(value));

// The tap menu: the general jobs, then «explain» for the selected part, when there is one
export function menuActions(ctx: { selectedPart?: string | null }): QubiAction[] {
  const list: QubiAction[] = MENU_KEYS.map((key) => ({ key }));
  if (ctx.selectedPart) list.push({ key: "explain", part: ctx.selectedPart });
  return list;
}

// What he asks after landing on a part
export function partActions(part: string): QubiAction[] {
  return PART_KEYS.map((key) => ({ key, part }));
}

// --- Where he lands ---------------------------------------------------------------------------------

// The part of a bench, as the ground it covers (centered, after turning)
export type QubiPart = Pick<PlacedPart, "id" | "type" | "x" | "z" | "rot">;
export type DropBox = { id: string; x: number; z: number; w: number; d: number };

export function dropBoxes(parts: readonly QubiPart[]): DropBox[] {
  return parts.map((part) => {
    const box = partBox(part);
    return { id: part.id, x: box.x, z: box.z, w: box.w, d: box.d };
  });
}

export const DROP_REACH = 0.8; // a drop this close to a part's edge still counts as on it

// The part under a ground point: the smallest one it is inside (a sensor lying on a big board wins over the
// board), else the nearest one within `reach` of its edge. null: empty bench.
export function partAtPoint(point: Vec2, boxes: readonly DropBox[], reach = DROP_REACH): string | null {
  let best: { id: string; tier: number; score: number } | null = null;
  for (const box of boxes) {
    const dx = Math.abs(point.x - box.x) - box.w / 2;
    const dz = Math.abs(point.z - box.z) - box.d / 2;
    const inside = dx <= 0 && dz <= 0;
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    if (!inside && outside > reach) continue;
    const found = inside ? { tier: 0, score: box.w * box.d } : { tier: 1, score: outside };
    if (!best || found.tier < best.tier || (found.tier === best.tier && found.score < best.score)) best = { id: box.id, ...found };
  }
  return best?.id ?? null;
}

// --- Throwing ---------------------------------------------------------------------------------------

export const THROW = {
  minSpeed: 14, // units per second: slower than this is a drop, not a throw
  seconds: 0.25, // a throw carries velocity x this
  maxDistance: 14,
  limit: 60, // the bench's edge (LabBench's LIMIT)
  windowMs: 90, // the last moves that make the velocity
} as const;

export type PointerSample = { x: number; z: number; t: number }; // ground point and time in ms

// Velocity (units per second) of the last moves
export function velocityOf(samples: readonly PointerSample[], windowMs: number = THROW.windowMs): Vec2 {
  const last = samples.at(-1);
  if (!last) return { x: 0, z: 0 };
  const first = samples.find((s) => last.t - s.t <= windowMs);
  const seconds = first ? (last.t - first.t) / 1000 : 0;
  if (!first || seconds < 0.01) return { x: 0, z: 0 };
  return { x: (last.x - first.x) / seconds, z: (last.z - first.z) / seconds };
}

export type Drop = {
  land: Vec2; // where he comes down (the hand's spot, or where the throw carries him)
  thrown: boolean;
  part: string | null; // the part he goes to; null: he stays on the empty bench
  center: Vec2 | null; // that part's middle
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Where letting go at `at` with `velocity` ends: a throw flies on; he goes to the part under where he lands,
// or, if the throw lands on nothing, to the one under the hand
export function resolveDrop(at: Vec2, velocity: Vec2, boxes: readonly DropBox[]): Drop {
  const speed = Math.hypot(velocity.x, velocity.z);
  const thrown = speed >= THROW.minSpeed;
  let dx = thrown ? velocity.x * THROW.seconds : 0;
  let dz = thrown ? velocity.z * THROW.seconds : 0;
  const length = Math.hypot(dx, dz);
  if (length > THROW.maxDistance) {
    dx *= THROW.maxDistance / length;
    dz *= THROW.maxDistance / length;
  }
  const land = { x: clamp(at.x + dx, -THROW.limit, THROW.limit), z: clamp(at.z + dz, -THROW.limit, THROW.limit) };
  const part = partAtPoint(land, boxes) ?? (thrown ? partAtPoint(at, boxes) : null);
  const box = part ? boxes.find((b) => b.id === part) : undefined;
  return { land, thrown, part, center: box ? { x: box.x, z: box.z } : null };
}

// How long a throw flies, in ms
export const throwMs = (distance: number): number => Math.round(clamp(distance * 60, 450, 1100));
