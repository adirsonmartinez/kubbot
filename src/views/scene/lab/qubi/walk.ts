// Qubi's walking, as pure math (no three.js, no React): where he stops beside a part, how long a walk
// takes, how it eases, and how his legs, body and hop follow the ground he covers. Front = +z, so a heading
// is atan2(dx, dz). Units are the bench's world units.

export type Vec2 = { x: number; z: number };
export type Box2 = { x: number; z: number; w: number; d: number }; // a part's footprint, centered

export const STANDOFF = 1.5; // how far from the part's spot he stops
const BODY_MARGIN = 0.85; // air he keeps between his middle and any footprint
const PUSH_STEP = 0.25;
const PUSH_MAX = 12;
const ARRIVE_TOLERANCE = 0.3; // closer than this to where he would stop: he is already there
export const FRONT_VIEW = Math.PI / 4; // the isometric camera looks from +x +z: this faces it

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// In and out: slow start, fast middle, slow stop
export function ease(k: number): number {
  const t = clamp(k, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// Overshoots a little before settling (his pop-in)
export function easeOutBack(k: number): number {
  const t = clamp(k, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

// Moves `current` toward `goal`; the same at any frame rate. `speed` is 1/seconds.
export function damp(current: number, goal: number, dt: number, speed = 8): number {
  return current + (goal - current) * (1 - Math.exp(-speed * Math.max(0, dt)));
}

// `to` expressed as the angle nearest to `from` (so easing never spins the long way round)
export function angleTo(from: number, to: number): number {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Heading that makes a figure at `from` face `to`
export function yawToward(from: Vec2, to: Vec2, fallback = FRONT_VIEW): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.hypot(dx, dz) < 1e-6 ? fallback : Math.atan2(dx, dz);
}

const inside = (p: Vec2, b: Box2, margin: number) =>
  Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin;

export type Stop = { x: number; z: number; move: boolean };

// Where he stands to look at a part: `standoff` before its spot along the line he comes in on, and not on
// top of any footprint (a big board's middle is a spot too: he backs off along the line until he is clear).
// `move` is false when he already is there. Standing on the spot itself, he takes the camera's side.
export function stopPoint(from: Vec2, target: Vec2, opts: { standoff?: number; boxes?: readonly Box2[] } = {}): Stop {
  const standoff = opts.standoff ?? STANDOFF;
  const boxes = opts.boxes ?? [];
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  // unit vector from the stop toward the part
  const ux = dist < 1e-6 ? -Math.SQRT1_2 : dx / dist;
  const uz = dist < 1e-6 ? -Math.SQRT1_2 : dz / dist;
  const at = (s: number): Vec2 => ({ x: target.x - ux * s, z: target.z - uz * s });
  let s = standoff;
  while (s <= PUSH_MAX && boxes.some((b) => inside(at(s), b, BODY_MARGIN))) s += PUSH_STEP;
  const stop = s <= PUSH_MAX ? at(s) : at(standoff);
  const move = Math.hypot(stop.x - from.x, stop.z - from.z) > ARRIVE_TOLERANCE;
  return move ? { ...stop, move } : { x: from.x, z: from.z, move };
}

// How long a walk takes, in milliseconds: brisk, never a blink and never a crawl
export function walkMs(distance: number): number {
  return Math.round(clamp(350 + distance * 190, 450, 3000));
}

export type Walk = { from: Vec2; to: Vec2; ms: number; t: number };

export function startWalk(from: Vec2, to: Vec2): Walk {
  return { from: { ...from }, to: { ...to }, ms: walkMs(Math.hypot(to.x - from.x, to.z - from.z)), t: 0 };
}

export function advanceWalk(walk: Walk, dtMs: number): Walk {
  return { ...walk, t: Math.min(walk.ms, walk.t + Math.max(0, dtMs)) };
}

export const walkDone = (walk: Walk) => walk.t >= walk.ms;

// Where he is along the walk (eased)
export function walkAt(walk: Walk): Vec2 & { k: number } {
  const k = ease(walk.ms <= 0 ? 1 : walk.t / walk.ms);
  return { x: walk.from.x + (walk.to.x - walk.from.x) * k, z: walk.from.z + (walk.to.z - walk.from.z) * k, k };
}

export const STRIDE_RAD_PER_UNIT = 2.6; // legs turn through this much of a step cycle per unit of ground
const FULL_STRIDE_SPEED = 2.2; // units per second at which the steps are full size

// How much of a full stride his speed asks for (0 standing, 1 walking briskly)
export const strideAmount = (speed: number) => clamp(speed / FULL_STRIDE_SPEED, 0, 1);

export type StrideFrame = {
  left: number; // swing of each leg, radians (positive: forward)
  right: number;
  liftLeft: number; // how high each foot comes off the ground
  liftRight: number;
  bounce: number; // the body rises a little between steps
  lean: number; // leaning into the walk
  roll: number; // the body rocks side to side with the steps
};

// The legs and body at a point of the step cycle (`phase` in radians) with `amount` 0..1 of a full stride
export function stride(phase: number, amount: number): StrideFrame {
  const a = clamp(amount, 0, 1);
  const swing = Math.sin(phase);
  return {
    left: swing * 0.7 * a,
    right: swing * -0.7 * a + 0, // + 0: no negative zero when standing
    liftLeft: Math.max(0, Math.cos(phase)) * 0.16 * a,
    liftRight: Math.max(0, -Math.cos(phase)) * 0.16 * a,
    bounce: Math.abs(Math.cos(phase)) * 0.09 * a,
    lean: 0.14 * a,
    roll: swing * 0.05 * a,
  };
}

export const HOP_SECONDS = 0.36;
export const HOP_HEIGHT = 0.3;

// The little hop he does on arriving: t in seconds since he stopped; 0 outside it
export function arrivalHop(t: number): number {
  if (!(t >= 0) || t >= HOP_SECONDS) return 0;
  return Math.sin((t / HOP_SECONDS) * Math.PI) * HOP_HEIGHT;
}
