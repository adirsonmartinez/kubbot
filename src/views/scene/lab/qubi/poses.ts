// What Qubi's body does for each activity (pure, no three.js): the pose the animator eases toward when no
// gesture is playing, plus the small pulses that go with it.
//   idle: relaxed, breathing. listening: head tilted, a ring on the floor and his antenna pulse.
//   thinking: looks up, a hand at his chin, three dots over his head. talking: the mouth and the light
//   move, the hands talk a little. working: both hands busy in front of him, head down, sparks.
// Angles are radians in the robot's own frame, as in gestures.ts (head x: negative looks up).

import type { QubiActivity } from "../../../../models/qubi/types.ts";

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type ActivityPose = {
  rx: number; // right hand, forward is negative
  rz: number; // right hand, raised to the side
  lx: number;
  lz: number;
  hx: number; // head: positive looks down
  hy: number;
  hz: number;
  bodyX: number; // body lean
  gazeX: number; // eyes
  gazeY: number;
  ring: number; // 0..1 how much the listening ring shows
  dots: number; // 0..1 the thinking dots
  sparks: number; // 0..1 the working sparks
  talk: number; // 0..1 how open the mouth is
  beat: number; // heart beats per second
  glow: number; // extra light in the eyes and antenna
};

// A speech-like loudness: syllables inside words with small pauses between them, always 0..1
export function speechLevel(t: number): number {
  const words = clamp01(0.5 + Math.sin(t * 2.3) * 1.4); // pauses between phrases
  const syllables = Math.abs(Math.sin(t * 8.3)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1 + 1)));
  return clamp01(words * syllables);
}

export function activityPose(activity: QubiActivity, t: number): ActivityPose {
  const rest: ActivityPose = {
    rx: 0, rz: 0.06, lx: 0, lz: -0.06,
    hx: 0, hy: 0, hz: Math.sin(t * 1.5) * 0.05, bodyX: 0,
    gazeX: 0, gazeY: 0, ring: 0, dots: 0, sparks: 0, talk: 0, beat: 1, glow: 0,
  };
  switch (activity) {
    case "listening":
      return {
        ...rest,
        rx: -0.15 + Math.sin(t * 1.1) * 0.04, lx: -0.15,
        hx: -0.04 + Math.sin(t * 1.1) * 0.03, hz: 0.24 + Math.sin(t * 0.8) * 0.05,
        ring: 1, beat: 1.3, glow: 0.25,
      };
    case "thinking":
      return {
        ...rest,
        rx: -2.15, rz: 0.5, lx: -0.2,
        hx: -0.3 + Math.sin(t * 1.6) * 0.03, hy: 0.22 + Math.sin(t * 0.9) * 0.08, hz: 0.1,
        gazeX: 0.03, gazeY: 0.032, dots: 1, beat: 1.6,
      };
    case "talking": {
      const level = speechLevel(t);
      const hands = Math.sin(t * 4.5) * (0.06 + level * 0.25);
      return {
        ...rest,
        rx: -0.15 - hands, rz: 0.12 + hands * 0.5, lx: -0.15 + hands,
        hx: -level * 0.12 + Math.sin(t * 9) * level * 0.12,
        talk: level, beat: 2.1, glow: 0.35 + level * 0.5,
      };
    }
    case "working":
      return {
        ...rest,
        rx: -1.1 + Math.sin(t * 12) * 0.28, rz: 0.2,
        lx: -1.1 + Math.sin(t * 12 + 2.5) * 0.28, lz: -0.2,
        hx: 0.28, hy: Math.sin(t * 3) * 0.1, bodyX: 0.08,
        gazeY: -0.012, sparks: 1, beat: 1.8,
      };
    default:
      return rest;
  }
}

// One of the three thinking dots (i = 0..2): bobs in turn, 0..1
export const dotPulse = (t: number, i: number) => 0.5 + 0.5 * Math.sin(TAU * (t * 1.1 - i / 3));

// One of the two floor ripples of the listening ring: grows and fades, then starts again
export function ringPulse(t: number, i: number): { scale: number; opacity: number } {
  const k = (((t * 0.7 + i * 0.5) % 1) + 1) % 1;
  return { scale: 0.8 + k * 1.6, opacity: (1 - k) ** 2 * 0.55 };
}

// A heartbeat: two quick bumps (lub-dub) per beat, rest otherwise; phase 0..1
export const heartbeat = (p: number) => Math.exp(-(((p - 0.06) / 0.05) ** 2)) + 0.6 * Math.exp(-(((p - 0.3) / 0.05) ** 2));
