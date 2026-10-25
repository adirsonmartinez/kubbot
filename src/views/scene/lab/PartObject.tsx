"use client";

// One part on the bench. It mounts the imperative model from ./parts (buildPart) and brings it to life:
// it eases toward its place in the design (so a drag glides), lifts with a soft shadow while grabbed, falls
// in when it is new and shrinks away when it is removed. It also owns the pointer: press and drag to move,
// hover a pin to light it, click a pin to start or finish a wire.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { partBox } from "@/models/lab/layout";
import type { Level, PlacedPart } from "@/viewmodels/useLabViewModel";
import { benchInput } from "./benchInput";
import { decalTextures } from "./benchTextures";
import { setCursor, useBench, type PartPose } from "./benchContext";
import { buildPart, type PartHandle } from "./parts";
import { useDeferredDispose } from "./useDeferredDispose";
import { partAngle } from "./wireCurve";

const SNAP = 0.25; // dragged parts land on a quarter-unit grid (2.5 mm)
const LIFT = 0.22; // how high a grabbed part rises
const DROP_FROM = 1.4; // a new part falls from this high
const DRAG_PX = 3; // pointer travel that turns a press into a drag
const LIMIT = 60; // parts stay this close to the middle of the bench
const EASE_POSITION = 16; // 1/s: how fast a part glides to its place
const EASE_TURN = 13;
const LEAVE_SECONDS = 0.2;
const NO_RAYCAST = () => {};

const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function tryBuild(type: string): PartHandle | null {
  try {
    return buildPart(type);
  } catch (error) {
    console.error("lab: could not build", type, error);
    return null;
  }
}

type Motion = {
  x: number;
  z: number;
  angle: number;
  angleGoal: number;
  rot: number;
  y: number;
  v: number; // lift speed
  liftGoal: number;
  born: number; // clock time of the first frame, -1 before it
  leave: number; // 0..1 while shrinking away
  gone: boolean;
};

type Props = {
  part: PlacedPart;
  level: Level;
  selected: boolean;
  hoverPin: string | null;
  sim: unknown;
  delay?: number; // seconds before it drops in (a batch of parts falls one after another)
  leaving?: boolean;
  onGone?: (id: string) => void;
};

export const PartObject = memo(function PartObject({ part, level, selected, hoverPin, sim, delay = 0, leaving = false, onGone }: Props) {
  const { poses, actions, groundAt } = useBench();
  const gl = useThree((s) => s.gl);
  const [handle] = useState(() => tryBuild(part.type));
  useDeferredDispose(handle);

  const root = useRef<THREE.Group>(null);
  const lifter = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const shadowMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const partRef = useRef(part);
  const stopDrag = useRef<(() => void) | null>(null);
  const motion = useRef<Motion>({
    x: part.x, z: part.z, angle: partAngle(part.rot), angleGoal: partAngle(part.rot), rot: part.rot,
    y: DROP_FROM, v: 0, liftGoal: 0, born: -1, leave: 0, gone: false,
  });
  const pose = useRef<PartPose>({ x: part.x, z: part.z, y: DROP_FROM, angle: partAngle(part.rot), w: 1, d: 1, h: 1, shown: false });

  // Footprint of what is drawn (or of the catalog entry if the model failed to build)
  const footprint = useMemo(() => {
    const box = partBox({ type: part.type, x: 0, z: 0, rot: 0 });
    const b = handle?.bounds;
    return b
      ? { w: b.maxX - b.minX, d: b.maxZ - b.minZ, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, h: box.h }
      : { w: box.w, d: box.d, cx: 0, cz: 0, h: box.h };
  }, [part.type, handle]);
  const textures = useMemo(() => decalTextures(footprint.w, footprint.d), [footprint.w, footprint.d]);

  useEffect(() => {
    partRef.current = part;
  });

  // A turn takes the short way: three quarter turns one way is one the other way
  useEffect(() => {
    const m = motion.current;
    if (m.rot === part.rot) return;
    const quarters = (((part.rot - m.rot) % 4) + 4) % 4;
    m.angleGoal -= ((quarters === 3 ? -1 : quarters) * Math.PI) / 2;
    m.rot = part.rot;
    m.v = Math.max(m.v, 2.4); // a small hop as it turns
  }, [part.rot]);

  useEffect(() => {
    handle?.setLevel(level);
  }, [handle, level]);
  useEffect(() => {
    handle?.setSelected(selected);
  }, [handle, selected]);
  useEffect(() => {
    handle?.setHover(hoverPin);
  }, [handle, hoverPin]);
  useEffect(() => {
    handle?.setSim(sim);
  }, [handle, sim]);

  useEffect(() => {
    const id = part.id;
    const poseStore = poses;
    const drag = stopDrag;
    return () => {
      drag.current?.();
      poseStore.delete(id);
    };
  }, [poses, part.id]);

  useFrame((state, dtRaw) => {
    const m = motion.current;
    const group = root.current;
    const lift = lifter.current;
    if (!group || !lift) return;
    const dt = Math.min(dtRaw, 0.1);
    const t = state.clock.elapsedTime;
    if (m.born < 0) m.born = t;
    const p = pose.current;
    const shown = t - m.born >= delay;
    group.visible = shown;
    if (!shown) {
      if (!poses.get(part.id)) poses.set(part.id, p);
      return;
    }

    const goal = partRef.current;
    const k = 1 - Math.exp(-EASE_POSITION * dt);
    const ka = 1 - Math.exp(-EASE_TURN * dt);
    m.x = Math.abs(goal.x - m.x) < 5e-4 ? goal.x : m.x + (goal.x - m.x) * k;
    m.z = Math.abs(goal.z - m.z) < 5e-4 ? goal.z : m.z + (goal.z - m.z) * k;
    m.angle = Math.abs(m.angleGoal - m.angle) < 1e-3 ? m.angleGoal : m.angle + (m.angleGoal - m.angle) * ka;

    // a springy rise and fall, a little bouncy when it lands
    if (m.y !== m.liftGoal || m.v !== 0) {
      m.v += (90 * (m.liftGoal - m.y) - 11 * m.v) * dt;
      m.y += m.v * dt;
      if (m.y < 0) {
        m.y = 0;
        m.v = Math.abs(m.v) * 0.3;
      }
      if (Math.abs(m.y - m.liftGoal) < 0.002 && Math.abs(m.v) < 0.02) {
        m.y = m.liftGoal;
        m.v = 0;
      }
    }

    let scale = 1;
    if (leaving) {
      m.leave = Math.min(1, m.leave + dt / LEAVE_SECONDS);
      scale = Math.max(0.001, 1 - m.leave);
      if (m.leave >= 1 && !m.gone) {
        m.gone = true;
        onGone?.(goal.id);
      }
    }

    group.position.set(m.x, 0, m.z);
    group.rotation.y = m.angle;
    group.scale.setScalar(scale);
    lift.position.y = m.y;

    // the shadow stays on the floor, softer and wider the higher the part is
    if (shadow.current && shadowMaterial.current) {
      shadowMaterial.current.opacity = clamp(0.22 + m.y * 0.9, 0, 0.62);
      const grow = 1 + m.y * 0.5;
      shadow.current.scale.set((footprint.w + 1.6) * grow, (footprint.d + 1.6) * grow, 1);
    }

    handle?.update(t, dt);

    const odd = goal.rot % 2 === 1;
    const changed = !p.shown || p.x !== m.x || p.z !== m.z || p.y !== m.y || p.angle !== m.angle;
    p.x = m.x;
    p.z = m.z;
    p.y = m.y;
    p.angle = m.angle;
    p.w = odd ? footprint.d : footprint.w;
    p.d = odd ? footprint.w : footprint.d;
    p.h = footprint.h;
    p.shown = !leaving;
    if (changed || leaving) poses.set(part.id, p);
  });

  // The pin under the pointer, if the nearest thing hit is one
  const pinAt = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null => {
    const hit = e.intersections.find((i) => i.eventObject === e.eventObject)?.object ?? e.object;
    for (let o: THREE.Object3D | null = hit; o; o = o.parent) {
      const pick = o.userData.pick as { type?: string; pin?: string } | undefined;
      if (pick?.type === "pin" && pick.pin) return pick.pin;
      if (o === e.eventObject) break;
    }
    return null;
  };

  const beginDrag = (e: ThreeEvent<PointerEvent>) => {
    const ground = groundAt(e.clientX, e.clientY);
    const current = partRef.current;
    actions.select(current.id);
    if (!ground) return;
    const m = motion.current;
    const drag = { dx: current.x - ground.x, dz: current.z - ground.z, moved: false, at: { x: current.x, z: current.z } };
    const [x0, y0, pointer] = [e.clientX, e.clientY, e.pointerId];
    benchInput.dragging = true;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      if (!drag.moved) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
        drag.moved = true;
        m.liftGoal = LIFT;
        setCursor(gl.domElement, "grabbing");
        actions.hoverPin(null, null);
      }
      const at = groundAt(ev.clientX, ev.clientY);
      if (!at) return;
      const next = { x: clamp(snap(at.x + drag.dx), -LIMIT, LIMIT), z: clamp(snap(at.z + drag.dz), -LIMIT, LIMIT) };
      if (next.x === drag.at.x && next.z === drag.at.z) return;
      drag.at = next;
      actions.move(current.id, next);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      stopDrag.current = null;
      benchInput.dragging = false;
      m.liftGoal = 0;
      setCursor(gl.domElement, "");
      if (drag.moved) actions.moveEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    stopDrag.current = end;
  };

  const handlers = leaving
    ? {}
    : {
        // Left button drags (Shift or another button orbits the map: not ours)
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0 || e.shiftKey) return;
          e.stopPropagation();
          if (!pinAt(e)) beginDrag(e);
        },
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          if (benchInput.dragging) return;
          const pin = pinAt(e);
          const id = partRef.current.id;
          const hovered = actions.hovered();
          if (pin) {
            if (hovered?.part !== id || hovered.pin !== pin) actions.hoverPin(id, pin);
          } else if (hovered?.part === id) actions.hoverPin(null, null);
          setCursor(gl.domElement, pin ? "pointer" : "grab");
        },
        onPointerOut: () => {
          if (benchInput.dragging) return;
          const id = partRef.current.id;
          if (actions.hovered()?.part === id) actions.hoverPin(null, null);
          setCursor(gl.domElement, "");
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          const pin = pinAt(e);
          if (pin && !benchInput.dragging) actions.pickPin(partRef.current.id, pin);
        },
      };

  return (
    <group ref={root} visible={false} {...handlers}>
      {textures.shadow && (
        <mesh ref={shadow} position={[footprint.cx, 0.034, footprint.cz]} rotation-x={-Math.PI / 2} renderOrder={1} raycast={NO_RAYCAST}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial ref={shadowMaterial} map={textures.shadow} transparent depthWrite={false} opacity={0} toneMapped={false} />
        </mesh>
      )}
      <group ref={lifter}>
        {handle ? (
          <primitive object={handle.group} />
        ) : (
          <mesh position-y={footprint.h / 2} castShadow receiveShadow>
            <boxGeometry args={[footprint.w, footprint.h, footprint.d]} />
            <meshStandardMaterial color="#8d959e" roughness={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
});
