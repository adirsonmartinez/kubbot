// Qubi's life, frame by frame (imperative, three.js but no React): it walks him to his target with easing,
// turns him toward it, plays the gesture and the face the state asks for, and shows the activity in his
// pose. All the math lives in the pure walk.ts, gestures.ts and poses.ts; this file only applies it to the
// pivots of the model. Reduced motion: he moves instantly and nothing sways; faces and lights still change.
//
// The person's hand: `hold(at)` lifts him and he follows `at` (arms up, legs dangling, wobbling with the
// movement) and `drop(...)` lets him go: he comes down where he is, or flies on after a throw, and then, if
// a part was under him, walks to it and calls `onArrive`. While he is in the hand (or on his way to the part)
// the state's target does not move him.

import * as THREE from "three";
import type { QubiState } from "../../../../models/qubi/types.ts";
import { PALETTE } from "../../palette";
import { faceOf, gestureFrame, isFresh, isGesture, type GestureFrame } from "./gestures";
import { throwMs } from "../../../../models/qubi/actions.ts";
import { activityPose, dotPulse, heartbeat, ringPulse, type ActivityPose } from "./poses";
import { HEAD_TOP, HIP_Y, type QubiModel } from "./qubiModel";
import {
  FRONT_VIEW, HOP_SECONDS, STRIDE_RAD_PER_UNIT, advanceWalk, angleTo, arrivalHop, clamp, damp, easeOutBack, startWalk,
  stopPoint, stride, strideAmount, walkAt, walkDone, yawToward, type Box2, type Vec2, type Walk,
} from "./walk";

export const HELD_LIFT = 1.4; // how high the hand lifts him, in world units
const THROW_ARC = 2.6; // how high a throw arcs
const POP_SECONDS = 0.7;
const BLINK_SECONDS = 0.12;
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type FrameInput = {
  state: QubiState;
  avoid: readonly Box2[]; // footprints he does not stand on
  scale: number; // world units per model unit
  still: boolean; // reduced motion
};

type Angles = { rx: number; rz: number; lx: number; lz: number; hx: number; hy: number; hz: number; bodyX: number };

const WARN = new THREE.Color(PALETTE.warn);

type Flight = { from: Vec2; to: Vec2; ms: number; t: number };
// What happens after he is let go: walk to the part's middle (if any), then tell the page he arrived
type Job = { center: Vec2 | null; onArrive?: () => void; started: boolean };
export type DropPlan = { land: Vec2; thrown: boolean; center: Vec2 | null; onArrive?: () => void };

export class QubiAnimator {
  x: number;
  z: number;
  yaw = FRONT_VIEW;
  private look: Vec2 | null = null;
  private walk: Walk | null = null;
  private targetKey: string | null = null;
  private gesture: { name: NonNullable<QubiState["gesture"]>["name"]; t: number } | null = null;
  private gestureAt: number | null;
  private t = 0;
  private pop = 0;
  private phase = 0;
  private speed = 0;
  private hopT = HOP_SECONDS; // seconds since arriving; past HOP_SECONDS: no hop
  private held: Vec2 | null = null; // where the person's hand has him
  private flight: Flight | null = null;
  private job: Job | null = null;
  private landing = false; // coming down from the hand: a hop when he touches
  private handSpeed = 0; // how fast the hand moves him, for the wobble
  private handVx = 0;
  private liftNow = 0;
  private avoid: readonly Box2[] = [];
  private still = false;
  private lastTarget: QubiState["target"] = null;
  private targetObj: QubiState["target"] = null;
  private displaced = false; // the hand moved him: a new target (even to the same spot) sends him again
  private cur: Angles = { rx: 0, rz: 0.06, lx: 0, lz: -0.06, hx: 0, hy: 0, hz: 0, bodyX: 0 };
  private leanNow = 0;
  private sparkNow = 0;
  private ringNow = 0;
  private dotNow = 0;
  private glowNow = 0;
  private mouthNow = 0;
  private worriedNow = false;
  private worryTint = 0;
  private heartPhase = 0;
  private nextBlink = between(2, 5);
  private blinkAt = -10;
  private gaze = { x: 0, y: 0 };
  private nextSaccade = 0;
  private face = { ...faceOf("neutral") };
  private hopY = 0;
  private scaleNow = 1;
  private readonly baseGlow = new THREE.Color();

  constructor(readonly model: QubiModel, home: Vec2, initial: QubiState) {
    this.x = home.x;
    this.z = home.z;
    // A gesture already there when he appears is old news, unless it was asked a moment ago
    const g = initial.gesture;
    this.gestureAt = g && !isFresh(g.at, Date.now()) ? g.at : null;
    this.baseGlow.copy(model.glow.emissive);
    this.place();
  }

  dispose() {
    this.model.dispose();
  }

  // The points the speech bubble hangs from, in world units
  get anchors(): { head: [number, number, number]; foot: [number, number, number] } {
    const s = this.scaleNow;
    return { head: [this.x, HEAD_TOP * s + this.hopY + 0.25, this.z], foot: [this.x, 0, this.z] };
  }

  get walking() {
    return this.walk !== null;
  }

  // In the hand, flying after a throw, or on his way to the part he was dropped on
  get byHand() {
    return this.held !== null || this.flight !== null || this.job !== null;
  }

  // How high he is lifted off the bench (world units), for the pointer math
  get lift() {
    return this.liftNow;
  }

  get grabbable() {
    return this.flight === null;
  }

  // The person has him: he follows `at` (the spot under his feet)
  hold(at: Vec2) {
    if (!this.held) {
      this.displaced = true;
      this.targetObj = this.lastTarget;
      this.walk = null;
      this.flight = null;
      this.job = null;
      this.landing = false;
    }
    this.held = { x: at.x, z: at.z };
  }

  // The person let go. A throw flies on to `land`; then, if `center` is set, he walks to that part.
  drop(plan: DropPlan) {
    if (!this.held) return;
    const from = { x: this.x, z: this.z };
    this.held = null;
    this.landing = true;
    this.job = { center: plan.center, onArrive: plan.onArrive, started: false };
    const distance = Math.hypot(plan.land.x - from.x, plan.land.z - from.z);
    if (plan.thrown && distance > 0.5) {
      if (this.still) {
        this.x = plan.land.x;
        this.z = plan.land.z;
      } else {
        this.flight = { from, to: { ...plan.land }, ms: throwMs(distance), t: 0 };
      }
    }
  }

  private finishJob() {
    const job = this.job;
    this.job = null;
    job?.onArrive?.();
  }

  private place() {
    this.model.group.position.set(this.x, 0, this.z);
  }

  private goTo(target: NonNullable<QubiState["target"]>, avoid: readonly Box2[], still: boolean) {
    this.look = { x: target.x, z: target.z };
    const stop = stopPoint({ x: this.x, z: this.z }, target, { boxes: avoid });
    if (!stop.move) {
      this.walk = null;
    } else if (still) {
      this.x = stop.x;
      this.z = stop.z;
      this.walk = null;
    } else {
      this.walk = startWalk({ x: this.x, z: this.z }, stop);
    }
  }

  update(rawDt: number, input: FrameInput) {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    const { state, avoid, scale, still } = input;
    const a = still ? 0 : 1;
    const m = this.model;
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt / POP_SECONDS);

    // --- Intent: a new target, a new gesture ---
    this.avoid = avoid;
    this.still = still;
    const target = state.target;
    const key = target ? `${target.x.toFixed(2)}|${target.z.toFixed(2)}` : null;
    // Not while the person has him; and once he is let go, even the same spot again sends him
    if (!this.byHand && (key !== this.targetKey || (this.displaced && target !== this.targetObj))) {
      this.targetKey = key;
      this.displaced = false;
      if (target) this.goTo(target, avoid, still);
    }
    this.lastTarget = target;
    const asked = state.gesture;
    if (asked && asked.at !== this.gestureAt) {
      this.gestureAt = asked.at;
      if (isGesture(asked.name)) this.gesture = { name: asked.name, t: 0 };
    } else if (!asked) {
      this.gestureAt = null;
    }

    // --- In the hand: following it, flying after a throw, coming down, then off to the part ---
    let handDx = 0;
    if (this.held) {
      const [px, pz] = [this.x, this.z];
      this.x = still ? this.held.x : damp(this.x, this.held.x, dt, 20);
      this.z = still ? this.held.z : damp(this.z, this.held.z, dt, 20);
      handDx = dt > 0 ? (this.x - px) / dt : 0;
      const handDz = dt > 0 ? (this.z - pz) / dt : 0;
      this.handSpeed = damp(this.handSpeed, Math.hypot(handDx, handDz), dt, 10);
      this.liftNow = still ? 0 : damp(this.liftNow, HELD_LIFT, dt, 14);
    } else if (this.flight) {
      const f = { ...this.flight, t: Math.min(this.flight.ms, this.flight.t + dt * 1000) };
      const k = f.t / f.ms;
      this.x = f.from.x + (f.to.x - f.from.x) * k;
      this.z = f.from.z + (f.to.z - f.from.z) * k;
      this.liftNow = HELD_LIFT * (1 - k) + Math.sin(Math.PI * k) * THROW_ARC;
      this.handSpeed = damp(this.handSpeed, 6, dt, 6);
      if (k >= 1) {
        this.flight = null;
        this.liftNow = 0;
        this.hopT = 0;
        this.landing = false;
      } else {
        this.flight = f;
      }
    } else {
      this.liftNow = still ? 0 : damp(this.liftNow, 0, dt, 16);
      if (this.liftNow < 0.04) this.liftNow = 0;
      this.handSpeed = damp(this.handSpeed, 0, dt, 10);
      if (this.landing && this.liftNow === 0) {
        this.landing = false;
        this.hopT = 0;
      }
      // Down on the bench: on to the part, or done
      if (this.job && !this.job.started && this.liftNow === 0) {
        this.job.started = true;
        const { center } = this.job;
        if (center) this.goTo(center, avoid, still);
        if (!center || !this.walk) this.finishJob();
      }
    }
    const air = this.held !== null || this.flight !== null;
    this.handVx = handDx;

    // --- Walking ---
    let moved = 0;
    if (this.walk) {
      const next = advanceWalk(this.walk, dt * 1000);
      const p = walkAt(next);
      moved = Math.hypot(p.x - this.x, p.z - this.z);
      this.x = p.x;
      this.z = p.z;
      this.phase += moved * STRIDE_RAD_PER_UNIT;
      if (walkDone(next)) {
        this.walk = null;
        this.hopT = 0;
        if (this.job?.started) this.finishJob();
      } else {
        this.walk = next;
      }
    } else {
      this.hopT += dt;
    }
    this.speed = damp(this.speed, dt > 0 ? moved / dt : 0, dt, 14);
    const amount = still ? 0 : strideAmount(this.speed);
    const step = stride(this.phase, amount);

    // --- Turning: along the walk, then toward what he came for ---
    const goalYaw = air
      ? this.flight
        ? yawToward(this.flight.from, this.flight.to)
        : FRONT_VIEW
      : this.walk
        ? yawToward({ x: this.walk.from.x, z: this.walk.from.z }, this.walk.to)
        : this.look
        ? yawToward({ x: this.x, z: this.z }, this.look, this.yaw)
        : FRONT_VIEW;
    this.yaw = still ? goalYaw : damp(this.yaw, angleTo(this.yaw, goalYaw), dt, this.walk ? 10 : 6);

    // --- Pose: the activity, with arms swinging while he walks, then the gesture on top ---
    const pose = activityPose(state.activity, this.t);
    const goal = air ? this.airArms(a) : this.armsFor(pose, step, amount);
    const c = this.cur;
    for (const k of Object.keys(goal) as (keyof Angles)[]) c[k] = damp(c[k], goal[k], dt, k === "hx" || k === "hy" || k === "hz" ? 10 : 12);

    const g = this.gesture ? gestureFrame(this.gesture.name, this.gesture.t) : null;
    if (this.gesture) {
      this.gesture.t += dt;
      if (!g) this.gesture = null;
    }
    const w = g && !air ? g.w * a : 0;
    const mix = (current: number, value: number | undefined) => (value === undefined ? current : current + (value - current) * w);
    const f: GestureFrame = g ?? { w: 0 };
    m.arms[1].rotation.set(mix(c.rx, f.rx), 0, mix(c.rz, f.rz));
    m.arms[0].rotation.set(mix(c.lx, f.lx), 0, mix(c.lz, f.lz));
    m.head.rotation.set(mix(c.hx, f.hx), mix(c.hy, f.hy), mix(c.hz, f.hz) + Math.sin(this.t * 1.5) * 0.05 * a);

    // --- Body: breathing, steps, leaning, the gesture's hop and spin ---
    const breathe = Math.sin(this.t * (state.activity === "listening" ? 1.1 : 2)) * 0.04 * a;
    this.leanNow = damp(this.leanNow, step.lean + c.bodyX, dt, 10);
    // In the air he swings with the hand: legs dangle, the body rocks and leans more the faster he moves
    const wobble = air && !still ? clamp(this.handSpeed / 8, 0, 1) : 0;
    const dangle = air ? Math.sin(this.t * 8) * (0.25 + 0.35 * wobble) * a : 0;
    m.body.position.y = breathe + step.bounce;
    m.body.rotation.x = this.leanNow + (air ? wobble * 0.18 * a : 0);
    m.body.rotation.y = w > 0 && f.spin !== undefined ? f.spin * w : 0;
    m.body.rotation.z =
      (w > 0 && f.sway !== undefined ? f.sway * w : 0) +
      step.roll +
      (air ? (Math.sin(this.t * 9) * (0.06 + 0.12 * wobble) - clamp(this.handVx * 0.012, -0.25, 0.25)) * a : 0);
    m.legs[0].rotation.x = air ? dangle : -step.left;
    m.legs[1].rotation.x = air ? -dangle : -step.right;
    m.legs[0].position.y = HIP_Y + step.liftLeft;
    m.legs[1].position.y = HIP_Y + step.liftRight;
    const hopArc = (w > 0 ? (f.hop ?? 0) * w : 0) + (still ? 0 : arrivalHop(this.hopT));
    this.hopY = hopArc * scale + this.liftNow;

    // --- Face: expression (or the gesture's), blinks, gaze, mouth ---
    const wantName = air ? "surprised" : g && g.w > 0.3 && g.face ? g.face : state.expression;
    this.animateFace(dt, a, wantName, pose);

    // --- Lights and extras: antenna, heart, listening ripples, thinking dots, working sparks ---
    this.animateExtras(dt, a, pose);

    // --- Place the whole robot ---
    this.scaleNow = scale;
    const popScale = Math.max(easeOutBack(this.pop), 0.001);
    m.root.scale.setScalar(scale * popScale);
    m.root.rotation.y = this.yaw;
    m.root.position.y = this.hopY;
    m.ground.scale.setScalar(scale * popScale);
    m.shadow.scale.setScalar(clamp(1 - this.hopY * 0.18, 0.5, 1));
    m.shadowMaterial.opacity = (m.shadowMaterial.map ? 0.7 : 0.3) * clamp(1 - this.hopY * 0.25, 0.4, 1);
    this.place();
  }

  // Where his hands go: the activity's pose, blended into a natural arm swing as he walks
  private armsFor(pose: ActivityPose, step: ReturnType<typeof stride>, amount: number): Angles {
    const swing = (own: number, swinging: number) => own + (swinging - own) * amount;
    return {
      rx: swing(pose.rx, -step.left * 0.9 + 0.2),
      rz: swing(pose.rz, 0.2),
      lx: swing(pose.lx, -step.right * 0.9 + 0.2),
      lz: swing(pose.lz, -0.2),
      hx: swing(pose.hx, 0.06),
      hy: pose.hy * (1 - amount),
      hz: pose.hz * (1 - amount),
      bodyX: pose.bodyX * (1 - amount),
    };
  }

  // Both arms up and swinging, as in the ADE's held pose
  private airArms(a: number): Angles {
    const t = this.t;
    return {
      rx: -0.2,
      rz: 2.3 + Math.sin(t * 10) * 0.35 * a,
      lx: -0.2,
      lz: -(2.3 + Math.sin(t * 10 + 1.3) * 0.35 * a),
      hx: -0.12,
      hy: 0,
      hz: clamp(-this.handVx * 0.01, -0.25, 0.25) * a,
      bodyX: 0,
    };
  }

  private animateFace(dt: number, a: number, name: QubiState["expression"], pose: ActivityPose) {
    const m = this.model;
    const want = faceOf(name);
    const face = this.face;
    for (const key of ["eyeY", "eyeScale", "gazeX", "gazeY", "mouthX", "mouthY"] as const) face[key] = damp(face[key], want[key], dt, 10);
    if (want.worried !== this.worriedNow) {
      this.worriedNow = want.worried;
      m.setWorried(want.worried);
    }
    // Only a problem glows warm: a worried face tints the eyes and smile amber
    this.worryTint = damp(this.worryTint, want.worried ? 1 : 0, dt, 6);
    m.glow.emissive.copy(this.baseGlow).lerp(WARN, this.worryTint);

    // Mouth: opens with his voice, eased twice so it never flickers
    this.mouthNow = damp(this.mouthNow, pose.talk, dt, 22);
    const open = a ? this.mouthNow : this.mouthNow * 0.35;
    m.mouth.scale.set((1 - open * 0.15) * face.mouthX, (pose.talk > 0 || this.mouthNow > 0.02 ? 0.6 + open : 1) * face.mouthY, 1);

    // Blinks at a natural, uneven pace (sometimes twice)
    if (a && this.t >= this.nextBlink) {
      this.blinkAt = this.t;
      this.nextBlink = this.t + (Math.random() < 0.15 ? 0.28 : between(2, 5));
    }
    const b = (this.t - this.blinkAt) / BLINK_SECONDS;
    const lid = a && b >= 0 && b < 1 ? 1 - 0.9 * Math.sin(Math.PI * b) : 1;

    // Gaze: listening, small quick jumps (saccades); otherwise where the activity looks
    let gx = pose.gazeX;
    let gy = pose.gazeY;
    if (a && this.worryTint < 0.5 && pose.ring > 0.5) {
      if (this.t >= this.nextSaccade) {
        this.gaze.x = between(-0.025, 0.025);
        this.gaze.y = 0.012 + between(-0.012, 0.012); // a bit up: the camera is above him
        this.nextSaccade = this.t + between(0.5, 1.8);
      }
      gx += this.gaze.x;
      gy += this.gaze.y;
    }
    m.eyes.forEach((eye, i) => {
      const rest = m.eyeRest[i];
      eye.scale.set(face.eyeScale, lid * face.eyeY * face.eyeScale, 0.5 * face.eyeScale);
      eye.position.x = rest.x + gx + face.gazeX;
      eye.position.y = rest.y + gy + face.gazeY;
    });

    // Brighter eyes while he speaks or listens
    this.glowNow = damp(this.glowNow, pose.glow, dt, 8);
    m.glow.emissiveIntensity = 1.1 * (1 + this.glowNow);
  }

  private animateExtras(dt: number, a: number, pose: ActivityPose) {
    const m = this.model;
    const t = this.t;

    // Heart: a calm beat, faster when he is busy; his voice makes it bigger
    this.heartPhase = (this.heartPhase + dt * pose.beat) % 1;
    const beat = heartbeat(this.heartPhase);
    m.heart.scale.setScalar(1 + (beat * (pose.beat > 1.2 ? 0.2 : 0.1) + pose.talk * 0.3) * a);
    // Antenna orb: pulses while he listens, flickers with his voice
    const pulse = pose.ring > 0.5 ? 0.5 + 0.5 * Math.sin(t * 4.4) : 0;
    m.tip.scale.setScalar(1 + (pulse * 0.4 + pose.talk * 0.5) * a);
    m.lit.emissiveIntensity = 0.9 + pulse * 0.5 * a + pose.talk * 0.6;
    m.tipHaloMaterial.opacity = 0.08 + (pulse * 0.2 + pose.talk * 0.2) * a;

    // Listening ripples on the bench
    this.ringNow = damp(this.ringNow, pose.ring, dt, 6);
    m.rings.forEach((ring, i) => {
      const r = ringPulse(t, i);
      ring.visible = this.ringNow > 0.02;
      ring.scale.setScalar(r.scale);
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = r.opacity * this.ringNow * (a ? 1 : 0.5);
    });

    // Thinking dots
    this.dotNow = damp(this.dotNow, pose.dots, dt, 8);
    m.dots.forEach((dot, i) => {
      const p = dotPulse(t, i);
      dot.scale.setScalar(Math.max(0.001, this.dotNow * (0.6 + p * 0.6)));
      dot.position.y = 2.95 + p * 0.1 * a;
    });

    // Working sparks flicker on his hands
    this.sparkNow = damp(this.sparkNow, pose.sparks, dt, 10);
    m.sparks.forEach((spark, i) => {
      const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 17 + i * 2.1));
      spark.scale.setScalar(Math.max(0.001, this.sparkNow * flicker * (a ? 1 : 0.5)));
    });
  }
}
