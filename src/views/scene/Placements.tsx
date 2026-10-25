"use client";

// Components placed on the map, plus the drag preview. While dragging, the component floats
// after the cursor on springs, leaning into the motion, and the area it would land on lights
// up (accent when free, red when taken). Dropped, it falls onto its area, bounces and settles.

import { type RefObject, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { ComponentKind } from "@/models/component";
import { areaCenter, type Placement } from "@/models/placement";
import { clamp } from "@/lib/math";
import { spring, stepSpring, type Spring } from "@/lib/spring";
import type { PlacementViewModel } from "@/viewmodels/usePlacementViewModel";
import { COMPONENT_MODELS } from "./models";
import { PALETTE } from "./palette";

// Models are about one unit wide: scaled to their area, leaving a margin
const FILL = 0.9;
const LIFT = 0.7; // how high the dragged component floats, in multiples of its size
const FOLLOW = { stiffness: 140, damping: 16 }; // a little lag and overshoot behind the cursor
const TILT = { perSpeed: 0.035, max: 0.4 };
const SETTLE = { stiffness: 220, damping: 18 }; // tilt and drift back to rest after the drop
const SQUASH = { stiffness: 380, damping: 14, max: 0.28 };
const GRAVITY = 15; // per unit of size, so every size falls in about the same time
const BOUNCE = 0.32; // share of the speed kept on each bounce
const MAX_DT = 1 / 30;

// The dragged component's last pose: where a drop starts falling from
type Pose = { x: number; z: number; y: number; tiltX: number; tiltZ: number };

type Pointer = PlacementViewModel["pointer"];

export function Placements({
  placements,
  preview,
  pointer,
}: Pick<PlacementViewModel, "placements" | "preview" | "pointer">) {
  const lastPose = useRef<Pose | null>(null);
  return (
    <>
      {placements.map((p) => (
        <Placed key={p.id} placement={p} fromRef={lastPose} />
      ))}
      {preview && (
        <>
          <AreaMarker {...preview} />
          <Floating kind={preview.kind} size={preview.size} pointer={pointer} poseRef={lastPose} />
        </>
      )}
    </>
  );
}

function AreaMarker({ cell, size, free }: NonNullable<PlacementViewModel["preview"]>) {
  const c = areaCenter({ cell, size });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[c.x, 0.01, c.z]}>
      <planeGeometry args={[size - 0.04, size - 0.04]} />
      <meshBasicMaterial color={free ? PALETTE.accent : PALETTE.danger} transparent opacity={0.35} />
    </mesh>
  );
}

// Follows the cursor on springs and leans the way it is moving, like it hangs from the hand
function Floating({
  kind,
  size,
  pointer,
  poseRef,
}: {
  kind: ComponentKind;
  size: number;
  pointer: Pointer;
  poseRef: RefObject<Pose | null>;
}) {
  const Model = COMPONENT_MODELS[kind];
  const group = useRef<THREE.Group>(null);
  const motion = useRef<{ x: Spring; z: Spring } | null>(null);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    const p = pointer.point;
    if (!g || !p) return;
    const dt = Math.min(delta, MAX_DT);
    const m = (motion.current ??= { x: spring(p.x), z: spring(p.z) });
    m.x = stepSpring(m.x, p.x, dt, FOLLOW);
    m.z = stepSpring(m.z, p.z, dt, FOLLOW);

    const lean = (speed: number) => clamp(speed * TILT.perSpeed, -TILT.max, TILT.max);
    const y = size * LIFT + Math.sin(clock.elapsedTime * 3) * size * 0.03;
    const tiltX = lean(m.z.velocity);
    const tiltZ = -lean(m.x.velocity);
    g.position.set(m.x.value, y, m.z.value);
    g.rotation.set(tiltX, 0, tiltZ);
    poseRef.current = { x: m.x.value, z: m.z.value, y, tiltX, tiltZ };
  });

  return (
    <group ref={group}>
      <Model scale={size * FILL} />
    </group>
  );
}

// Falls from where it was dropped onto its area, bounces, squashes on impact and settles
function Placed({ placement, fromRef }: { placement: Placement; fromRef: RefObject<Pose | null> }) {
  const Model = COMPONENT_MODELS[placement.kind];
  const { size } = placement;
  const c = areaCenter(placement);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const motion = useRef<{
    dx: Spring;
    dz: Spring;
    tiltX: Spring;
    tiltZ: Spring;
    squash: Spring;
    y: number;
    vy: number;
    resting: boolean;
  } | null>(null);

  useFrame((_, delta) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    // The first frame picks up the pose of the component that was being dragged
    const m = (motion.current ??= startFall(fromRef.current, c.x, c.z, size));
    if (m.resting) return;
    const dt = Math.min(delta, MAX_DT);

    m.vy -= GRAVITY * size * dt;
    m.y += m.vy * dt;
    if (m.y <= 0) {
      const impact = -m.vy;
      m.y = 0;
      m.vy = impact * BOUNCE;
      m.squash.velocity -= impact / size; // harder landings squash more
      if (m.vy < size * 0.4) m.vy = 0;
    }
    m.dx = stepSpring(m.dx, 0, dt, SETTLE);
    m.dz = stepSpring(m.dz, 0, dt, SETTLE);
    m.tiltX = stepSpring(m.tiltX, 0, dt, SETTLE);
    m.tiltZ = stepSpring(m.tiltZ, 0, dt, SETTLE);
    m.squash = stepSpring(m.squash, 0, dt, SQUASH);
    const squash = clamp(m.squash.value, -SQUASH.max, SQUASH.max);

    g.position.set(c.x + m.dx.value, m.y, c.z + m.dz.value);
    g.rotation.set(m.tiltX.value, 0, m.tiltZ.value);
    b.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);

    const still = (s: Spring) => Math.abs(s.value) < 1e-3 && Math.abs(s.velocity) < 1e-2;
    m.resting = m.y === 0 && m.vy === 0 && [m.dx, m.dz, m.tiltX, m.tiltZ, m.squash].every(still);
    if (m.resting) {
      g.position.set(c.x, 0, c.z);
      g.rotation.set(0, 0, 0);
      b.scale.set(1, 1, 1);
    }
  });

  return (
    <group ref={group} position={[c.x, 0, c.z]}>
      <group ref={body}>
        <Model scale={size * FILL} />
      </group>
    </group>
  );
}

function startFall(pose: Pose | null, cx: number, cz: number, size: number) {
  // No drag to continue from (or one far away): drop straight down from the float height
  const near = pose && Math.hypot(pose.x - cx, pose.z - cz) < size;
  return {
    dx: spring(near ? pose.x - cx : 0),
    dz: spring(near ? pose.z - cz : 0),
    tiltX: spring(near ? pose.tiltX : 0),
    tiltZ: spring(near ? pose.tiltZ : 0),
    squash: spring(0),
    y: near ? pose.y : size * LIFT,
    vy: 0,
    resting: false,
  };
}
