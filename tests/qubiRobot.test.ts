import test from "node:test";
import assert from "node:assert/strict";
import {
  HOP_SECONDS, STANDOFF, advanceWalk, angleTo, arrivalHop, damp, ease, easeOutBack, startWalk, stopPoint, stride, strideAmount,
  walkAt, walkDone, walkMs, yawToward,
} from "../src/views/scene/lab/qubi/walk.ts";
import {
  EXPRESSIONS, GESTURE_SECONDS, envelope, faceOf, gestureFrame, isFresh, isGesture,
} from "../src/views/scene/lab/qubi/gestures.ts";
import { activityPose, dotPulse, heartbeat, ringPulse, speechLevel } from "../src/views/scene/lab/qubi/poses.ts";
import { layoutBubble, shortText } from "../src/views/scene/lab/qubi/bubble.ts";
import type { QubiActivity, QubiExpression, QubiGesture } from "../src/models/qubi/types.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// --- Walking ---

test("easing starts slow, ends slow and is symmetric", () => {
  near(ease(0), 0);
  near(ease(1), 1);
  near(ease(0.5), 0.5);
  assert.ok(ease(0.1) < 0.1 && ease(0.9) > 0.9);
  near(ease(0.3) + ease(0.7), 1);
  near(ease(-4), 0);
  near(ease(9), 1);
  assert.ok(easeOutBack(0.8) > 1, "the pop-in overshoots");
  near(easeOutBack(1), 1);
});

test("damp is frame-rate independent and never overshoots", () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 1 / 60, 8);
  const b = damp(0, 1, 1, 8);
  near(a, b, 1e-9);
  assert.ok(a < 1);
  near(damp(5, 5, 0.016), 5);
});

test("angles take the short way round", () => {
  near(angleTo(3, -3), 3 + (2 * Math.PI - 6));
  near(angleTo(0.2, 0.5), 0.5);
  near(yawToward({ x: 0, z: 0 }, { x: 0, z: 4 }), 0); // front is +z
  near(yawToward({ x: 0, z: 0 }, { x: 4, z: 0 }), Math.PI / 2);
  near(yawToward({ x: 1, z: 1 }, { x: 1, z: 1 }, 0.7), 0.7);
});

test("he stops a standoff before the part, on the line he comes in on", () => {
  const stop = stopPoint({ x: 0, z: 10 }, { x: 0, z: 0 });
  assert.equal(stop.move, true);
  near(stop.x, 0);
  near(stop.z, STANDOFF);
  const diagonal = stopPoint({ x: 8, z: 8 }, { x: 2, z: 2 });
  near(dist(diagonal, { x: 2, z: 2 }), STANDOFF);
  assert.ok(diagonal.x > 2 && diagonal.z > 2, "on his own side of the part");
});

test("he does not walk when he is already beside the part", () => {
  const there = stopPoint({ x: 0, z: 1.6 }, { x: 0, z: 0 });
  assert.equal(there.move, false);
  assert.deepEqual([there.x, there.z], [0, 1.6]);
});

test("too close to the part, he steps back to the standoff", () => {
  const stop = stopPoint({ x: 0, z: 0.4 }, { x: 0, z: 0 });
  assert.equal(stop.move, true);
  near(stop.z, STANDOFF); // backs off on his own side, never through the part
});

test("standing on the spot itself, he takes the camera side", () => {
  const stop = stopPoint({ x: 3, z: 3 }, { x: 3, z: 3 });
  assert.equal(stop.move, true);
  assert.ok(stop.x > 3 && stop.z > 3);
  near(dist(stop, { x: 3, z: 3 }), STANDOFF);
});

test("a target in the middle of a big board stops him at its edge, not on it", () => {
  const board = { x: 0, z: 0, w: 7, d: 5 };
  const stop = stopPoint({ x: 0, z: 14 }, { x: 0, z: 0 }, { boxes: [board] });
  assert.equal(stop.move, true);
  assert.ok(stop.z >= board.d / 2 + 0.8 - 1e-9, `stops at z=${stop.z}, off the board`);
  assert.ok(stop.z < 14, "still on the line toward the board");
  near(stop.x, 0);
});

test("with no way to clear the boxes he falls back to the standoff", () => {
  const huge = { x: 0, z: 0, w: 200, d: 200 };
  const stop = stopPoint({ x: 0, z: 10 }, { x: 0, z: 0 }, { boxes: [huge] });
  near(stop.z, STANDOFF);
});

test("a walk takes longer for longer distances, within limits", () => {
  assert.equal(walkMs(0), 450);
  assert.ok(walkMs(4) < walkMs(8));
  assert.equal(walkMs(1000), 3000);
});

test("a walk is eased, reaches its end exactly and never goes backwards", () => {
  let walk = startWalk({ x: 0, z: 0 }, { x: 6, z: 8 });
  near(walkAt(walk).x, 0);
  assert.equal(walkDone(walk), false);
  let last = -1;
  let early = 0;
  for (let i = 0; i < 400 && !walkDone(walk); i++) {
    walk = advanceWalk(walk, 16);
    const p = walkAt(walk);
    const along = dist(p, { x: 0, z: 0 });
    assert.ok(along >= last - 1e-9);
    last = along;
    if (walk.t <= walk.ms * 0.1) early = along;
  }
  assert.equal(walkDone(walk), true);
  near(walkAt(walk).x, 6);
  near(walkAt(walk).z, 8);
  assert.ok(early < 10 * 0.05, "slow at the start");
  assert.equal(advanceWalk(walk, 5000).t, walk.ms, "time never runs past the end");
});

test("legs swing in opposition, feet lift in turn and the body bounces", () => {
  const s = stride(1.1, 1);
  near(s.left, -s.right);
  assert.ok(Math.abs(s.left) > 0.1);
  assert.ok(!(s.liftLeft > 0 && s.liftRight > 0), "one foot at a time");
  for (let p = 0; p < 7; p += 0.1) {
    const f = stride(p, 1);
    assert.ok(f.bounce >= 0 && f.bounce <= 0.09 + 1e-9);
    assert.ok(f.liftLeft >= 0 && f.liftRight >= 0);
  }
});

test("standing still, nothing moves", () => {
  const s = stride(2.3, 0);
  assert.deepEqual(s, { left: 0, right: 0, liftLeft: 0, liftRight: 0, bounce: 0, lean: 0, roll: 0 });
  near(strideAmount(0), 0);
  near(strideAmount(100), 1);
});

test("the arrival hop goes up and comes back, then stops", () => {
  near(arrivalHop(0), 0);
  assert.ok(arrivalHop(HOP_SECONDS / 2) > 0.2);
  near(arrivalHop(HOP_SECONDS), 0);
  near(arrivalHop(-1), 0);
  near(arrivalHop(5), 0);
});

// --- Gestures and faces ---

const GESTURES = Object.keys(GESTURE_SECONDS) as QubiGesture[];

test("every gesture has a length and a frame at its middle, and ends", () => {
  assert.deepEqual([...GESTURES].sort(), ["celebrate", "nod", "point", "shrug", "think", "wave", "work"]);
  for (const name of GESTURES) {
    const length = GESTURE_SECONDS[name];
    assert.ok(length > 0.5 && length < 4, name);
    const mid = gestureFrame(name, length / 2);
    assert.ok(mid, name);
    near(mid.w, 1);
    assert.equal(gestureFrame(name, length), null, `${name} is over at its length`);
    assert.equal(gestureFrame(name, -0.1), null);
    assert.equal(gestureFrame(name, Number.NaN), null);
  }
});

test("gestures ease in and out so they blend with the pose", () => {
  for (const name of GESTURES) {
    const length = GESTURE_SECONDS[name];
    near(gestureFrame(name, 0)!.w, 0);
    assert.ok(gestureFrame(name, length * 0.05)!.w < 1);
    assert.ok(gestureFrame(name, length * 0.97)!.w < 0.3);
  }
  near(envelope(0.5), 1);
  near(envelope(0), 0);
});

test("each gesture does what its name says", () => {
  const wave = gestureFrame("wave", 0.4)!;
  assert.ok(wave.rz! > 2, "right hand up");
  assert.equal(wave.face, "happy");
  assert.ok(gestureFrame("celebrate", 0.9)!.hop! > 0, "jumps");
  const end = gestureFrame("celebrate", GESTURE_SECONDS.celebrate - 0.01)!;
  assert.ok(end.spin! > Math.PI * 1.9, "a full turn");
  assert.equal(gestureFrame("shrug", 0.7)!.face, "worried");
  assert.ok(gestureFrame("point", 0.7)!.rx! < -1.2, "arm forward");
  assert.ok(gestureFrame("think", 1)!.rx! < -1.5, "hand to the chin");
  const nods = [0.1, 0.25, 0.5, 0.75].map((k) => gestureFrame("nod", k * GESTURE_SECONDS.nod)!.hx!);
  assert.ok(nods.every((v) => v >= 0) && Math.max(...nods) > 0.2, "the head dips down");
  const work = [0.3, 0.35, 0.4, 0.45].map((t) => gestureFrame("work", t)!.rx!);
  assert.ok(Math.max(...work) - Math.min(...work) > 0.1, "the hands keep moving");
});

test("gesture names are checked", () => {
  assert.equal(isGesture("wave"), true);
  assert.equal(isGesture("moonwalk"), false);
  assert.equal(isGesture(undefined), false);
  assert.equal(isGesture("toString"), false);
});

test("a gesture asked a moment ago is fresh, an old one is not", () => {
  const now = 1_800_000_000_000;
  assert.equal(isFresh(now - 500, now), true);
  assert.equal(isFresh(now - 60_000, now), false);
  assert.equal(isFresh(now + 5, now), false, "from the future: not trusted");
  assert.equal(isFresh(1234, now), false, "a counter, not a clock");
});

test("every expression has a face", () => {
  const names = Object.keys(EXPRESSIONS) as QubiExpression[];
  assert.deepEqual([...names].sort(), ["focused", "happy", "neutral", "surprised", "worried"]);
  assert.equal(faceOf("worried").worried, true);
  assert.equal(faceOf("happy").worried, false);
  assert.ok(faceOf("happy").eyeY < faceOf("neutral").eyeY, "happy eyes squint");
  assert.ok(faceOf("surprised").eyeScale > 1, "surprised eyes are big");
  assert.ok(faceOf("focused").mouthY < 1, "focused mouth is small");
  assert.deepEqual(faceOf("nope" as QubiExpression), EXPRESSIONS.neutral);
});

// --- Activity poses ---

const ACTIVITIES: QubiActivity[] = ["idle", "listening", "thinking", "talking", "working"];

test("every activity has a pose with no NaN", () => {
  for (const activity of ACTIVITIES) {
    for (let t = 0; t < 5; t += 0.37) {
      for (const [key, value] of Object.entries(activityPose(activity, t))) assert.ok(Number.isFinite(value), `${activity}.${key}`);
    }
  }
});

test("listening shows the ring and tilts his head", () => {
  const p = activityPose("listening", 1);
  assert.equal(p.ring, 1);
  assert.ok(p.hz > 0.15);
  for (const other of ACTIVITIES.filter((a) => a !== "listening")) assert.equal(activityPose(other, 1).ring, 0, other);
});

test("thinking looks up, puts a hand to the chin and shows the dots", () => {
  const p = activityPose("thinking", 2);
  assert.ok(p.hx < -0.2, "head up (negative is up)");
  assert.ok(p.rx < -1.5);
  assert.ok(p.gazeY > 0, "eyes up");
  assert.equal(p.dots, 1);
  assert.ok(activityPose("idle", 2).hx > p.hx);
});

test("talking moves the mouth and the light; idle does not", () => {
  const levels = Array.from({ length: 80 }, (_, i) => activityPose("talking", i * 0.05).talk);
  assert.ok(Math.max(...levels) > 0.5, "opens wide");
  assert.ok(Math.min(...levels) < 0.1, "closes between words");
  assert.ok(levels.every((v) => v >= 0 && v <= 1));
  assert.equal(activityPose("idle", 1).talk, 0);
  assert.ok(activityPose("talking", 0.4).glow > activityPose("idle", 0.4).glow || speechLevel(0.4) === 0);
});

test("working keeps both hands moving in front of him with sparks", () => {
  const rs = Array.from({ length: 12 }, (_, i) => activityPose("working", i * 0.05).rx);
  const ls = Array.from({ length: 12 }, (_, i) => activityPose("working", i * 0.05).lx);
  assert.ok(Math.max(...rs) - Math.min(...rs) > 0.2);
  assert.ok(Math.max(...ls) - Math.min(...ls) > 0.2);
  assert.ok(rs.every((v) => v < -0.7), "hands forward");
  assert.equal(activityPose("working", 1).sparks, 1);
  assert.ok(activityPose("working", 1).hx > 0.2, "head down at the work");
});

test("the small pulses stay in range", () => {
  for (let t = 0; t < 6; t += 0.13) {
    for (let i = 0; i < 3; i++) {
      const d = dotPulse(t, i);
      assert.ok(d >= 0 && d <= 1);
    }
    for (let i = 0; i < 2; i++) {
      const r = ringPulse(t, i);
      assert.ok(r.scale >= 0.8 && r.scale <= 2.4 + 1e-9 && r.opacity >= 0 && r.opacity <= 0.55 + 1e-9);
    }
    assert.ok(heartbeat((t * 0.3) % 1) >= 0);
  }
  assert.notEqual(dotPulse(1, 0), dotPulse(1, 1), "the dots bob in turn");
});

// --- Bubble ---

const VIEW = { width: 800, height: 600 };

test("the bubble sits centered over his head when it fits", () => {
  const l = layoutBubble({ head: { x: 400, y: 300 }, foot: { x: 400, y: 380 }, width: 200, height: 60, viewport: VIEW });
  assert.equal(l.left, 300);
  assert.equal(l.top, 300 - 10 - 60);
  assert.equal(l.below, false);
  assert.equal(l.tailX, 100);
});

test("the bubble stays inside the viewport and its tail still points at him", () => {
  const left = layoutBubble({ head: { x: 20, y: 300 }, foot: { x: 20, y: 380 }, width: 200, height: 60, viewport: VIEW });
  assert.equal(left.left, 10);
  assert.equal(left.tailX, 16, "tail pinned to the corner, never outside the card");
  const right = layoutBubble({ head: { x: 790, y: 300 }, foot: { x: 790, y: 380 }, width: 200, height: 60, viewport: VIEW });
  assert.equal(right.left, VIEW.width - 200 - 10);
  assert.equal(right.tailX, 200 - 16);
  const mid = layoutBubble({ head: { x: 760, y: 300 }, foot: { x: 760, y: 380 }, width: 200, height: 60, viewport: VIEW });
  assert.equal(mid.left, 590);
  assert.equal(mid.tailX, 170, "760 - 590");
});

test("at the top edge the bubble goes under his feet", () => {
  const l = layoutBubble({ head: { x: 400, y: 40 }, foot: { x: 400, y: 120 }, width: 200, height: 60, viewport: VIEW });
  assert.equal(l.below, true);
  assert.equal(l.top, 130);
});

test("the bubble never leaves the viewport vertically, even far off screen", () => {
  const l = layoutBubble({ head: { x: 400, y: 5000 }, foot: { x: 400, y: 5080 }, width: 200, height: 60, viewport: VIEW });
  assert.ok(l.top + 60 <= VIEW.height - 10 + 1e-9);
  const tiny = layoutBubble({ head: { x: 50, y: 50 }, foot: { x: 50, y: 90 }, width: 900, height: 700, viewport: VIEW });
  assert.equal(tiny.left, 10);
  assert.equal(tiny.top, 10);
});

test("long words are cut short at a word with an ellipsis", () => {
  assert.equal(shortText("  ¡Listo,   pana! "), "¡Listo, pana!");
  const long = "Voy a conectar el sensor al pin digital y luego revisar que el cable de tierra esté bien puesto en la placa ".repeat(2);
  const cut = shortText(long, 60);
  assert.ok(cut.length <= 60);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.slice(0, -1).endsWith(" "));
  assert.equal(shortText("hola", 60), "hola");
});
