// Qubi's gestures and faces as pure timelines (no three.js): what the robot plays on top of its pose.
// A gesture is a short one-shot move of the hands, head and body that eases in and out, so it blends with
// whatever he is doing (talking, thinking, working). An expression is his face until it changes.
//   gestureFrame(name, t) -> angles for t seconds into the gesture, or null when it is over (or unknown).
//     w (0..1) is how much the gesture wins over the pose; r*/l* are the right and left hand (z: raised to
//     the side, x: forward is negative), h* the head (x: nod down, y: turn, z: tilt), spin the turn of the
//     whole body, hop how high it jumps, sway its sideways lean, face the expression it makes meanwhile.
// Ported from the ADE's robotGestures.js, with the names of types.ts.

import type { QubiExpression, QubiGesture } from "../../../../models/qubi/types.ts";

const TAU = Math.PI * 2;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export const GESTURE_SECONDS: Record<QubiGesture, number> = {
  wave: 1.6,
  nod: 1.0,
  think: 2.4,
  point: 1.5,
  celebrate: 1.8,
  shrug: 1.4,
  work: 1.8,
};

export const isGesture = (name: unknown): name is QubiGesture =>
  typeof name === "string" && Object.hasOwn(GESTURE_SECONDS, name);

export type Face = {
  eyeY: number; // eye height scale (squint below 1)
  eyeScale: number;
  gazeX: number; // where the eyes look, in model units
  gazeY: number;
  mouthX: number; // mouth size
  mouthY: number;
  worried: boolean; // tilted eyes and a frown
};

export const EXPRESSIONS: Record<QubiExpression, Face> = {
  neutral: { eyeY: 1, eyeScale: 1, gazeX: 0, gazeY: 0, mouthX: 1, mouthY: 1, worried: false },
  // happy: the eyes squint into a smile and the mouth grows
  happy: { eyeY: 0.55, eyeScale: 1.05, gazeX: 0, gazeY: 0.005, mouthX: 1.25, mouthY: 1.25, worried: false },
  // focused: narrowed eyes and a small flat mouth, looking a little down at the work
  focused: { eyeY: 0.72, eyeScale: 1, gazeX: 0, gazeY: -0.012, mouthX: 0.75, mouthY: 0.5, worried: false },
  // surprised: big round eyes and a small "o"
  surprised: { eyeY: 1.25, eyeScale: 1.3, gazeX: 0, gazeY: 0.01, mouthX: 0.55, mouthY: 1.5, worried: false },
  // worried: eyes tilted and a frown
  worried: { eyeY: 0.9, eyeScale: 1, gazeX: 0, gazeY: -0.01, mouthX: 0.9, mouthY: 0.9, worried: true },
};

export const faceOf = (name: QubiExpression): Face => EXPRESSIONS[name] ?? EXPRESSIONS.neutral;

export type GestureFrame = {
  w: number;
  rx?: number;
  rz?: number;
  lx?: number;
  lz?: number;
  hx?: number;
  hy?: number;
  hz?: number;
  spin?: number;
  hop?: number;
  sway?: number;
  face?: QubiExpression;
};

type Move = Omit<GestureFrame, "w">;

// In and out in the first and last 15% of the gesture
export const envelope = (k: number) => Math.max(0, Math.min(1, k / 0.15, (1 - k) / 0.15));

const MOVES: Record<QubiGesture, (t: number, k: number) => Move> = {
  wave: (t) => ({ rz: 2.5 + Math.sin(t * 12) * 0.35, rx: 0, hz: -0.12, hx: -0.06, face: "happy" }),
  nod: (_t, k) => ({ hx: Math.max(0, Math.sin(k * 2 * TAU)) * 0.3, face: "happy" }),
  think: (t) => ({ rx: -2.1, rz: 0.55, lx: -0.3, hz: 0.24, hx: -0.14 + Math.sin(t * 2) * 0.03, hy: 0.15, face: "focused" }),
  // the right arm out in front, toward what he faces, with a small jab
  point: (t) => ({ rx: -1.45 + Math.sin(t * 5) * 0.07, rz: 0.12, lx: 0, hx: 0.05, hy: 0.06 }),
  celebrate: (t, k) => ({
    rz: 2.7 + Math.sin(t * 16) * 0.15,
    lz: -2.7 - Math.sin(t * 16) * 0.15,
    rx: 0,
    lx: 0,
    hop: Math.abs(Math.sin(k * TAU)) * 0.55,
    spin: ease(k) * TAU,
    hx: -0.12,
    face: "happy",
  }),
  shrug: (_t, k) => ({
    rz: 0.85,
    lz: -0.85,
    rx: -0.5,
    lx: -0.5,
    hz: 0.22 * Math.sin(k * Math.PI),
    hop: 0.08 * Math.sin(k * Math.PI),
    face: "worried",
  }),
  // both hands busy in front of him, head down at the job
  work: (t) => ({
    rx: -1.15 + Math.sin(t * 13) * 0.22,
    lx: -1.15 + Math.sin(t * 13 + 2.5) * 0.22,
    rz: 0.2,
    lz: -0.2,
    hx: 0.24,
    sway: Math.sin(t * 6.5) * 0.04,
    face: "focused",
  }),
};

export function gestureFrame(name: QubiGesture, t: number): GestureFrame | null {
  const length = GESTURE_SECONDS[name];
  if (!length || !(t >= 0) || t >= length) return null;
  const k = t / length;
  return { w: envelope(k), ...MOVES[name](t, k) };
}

// A gesture whose `at` looks like a recent wall-clock time (ms) was asked a moment ago: it plays even if
// the robot mounted just after. Anything else that is already there at mount is old news.
export function isFresh(at: number, nowMs: number, windowMs = 2500): boolean {
  return at > 1e12 && nowMs - at >= 0 && nowMs - at < windowMs;
}
