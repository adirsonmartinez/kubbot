"use client";

// The line that follows the cursor while a wire is being made: marching glowing dots from the chosen pin to
// the pin under the pointer (or to the floor under it), arching over the parts like the real wire will.
// A pulsing ring marks the chosen pin, and another the pin that would receive the wire.

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Design, PinRef } from "@/viewmodels/useLabViewModel";
import { PALETTE } from "../palette";
import { pinPosition, useBench } from "./benchContext";
import { pointAlong, wireCurve, wireLength, type Vec3 } from "./wireCurve";
import { CONNECTOR } from "./wireVisual";

const GAP = 0.2; // world units between dots
const MAX_DOTS = 80;
const NO_RAYCAST = () => {};

type Props = { design: Design; wiring: PinRef | null; hover: PinRef | null };

export function WiringLine({ design, wiring, hover }: Props) {
  const { poses, groundAt } = useBench();
  const canvas = useThree((s) => s.gl.domElement);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef<Props>({ design, wiring, hover });
  const dots = useRef<THREE.InstancedMesh>(null);
  const startRing = useRef<THREE.Mesh>(null);
  const aimRing = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const glow = useMemo(() => new THREE.Color(PALETTE.accent).multiplyScalar(2.6), []);

  useEffect(() => {
    latest.current = { design, wiring, hover };
  });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY };
    };
    const leave = () => {
      cursor.current = null;
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, [canvas]);

  useFrame((state) => {
    const mesh = dots.current;
    const ring = startRing.current;
    const aim = aimRing.current;
    if (!mesh || !ring || !aim) return;
    const t = state.clock.elapsedTime;
    const { design: d, wiring: from, hover: over } = latest.current;
    const hide = () => {
      mesh.count = 0;
      ring.visible = false;
      aim.visible = false;
    };

    const fromPart = from && d.parts.find((p) => p.id === from.part);
    const start = fromPart && from ? pinPosition(poses, fromPart, from.pin) : null;
    if (!from || !fromPart || !start) return hide();

    // the pin under the pointer (not the one we started from), or else the floor under it
    const overPart = over && !(over.part === from.part && over.pin === from.pin) ? d.parts.find((p) => p.id === over.part) : null;
    const pin = overPart && over ? pinPosition(poses, overPart, over.pin) : null;
    let end: Vec3 | null = pin ? { x: pin.x, y: pin.y + CONNECTOR.top, z: pin.z } : null;
    if (!end && cursor.current) {
      const ground = groundAt(cursor.current.x, cursor.current.y);
      if (ground) end = { x: ground.x, y: 0.25, z: ground.z };
    }

    ring.visible = true;
    ring.position.set(start.x, start.y + 0.02, start.z);
    ring.scale.setScalar(1 + 0.25 * Math.sin(t * 6));
    if (!end) {
      mesh.count = 0;
      aim.visible = false;
      return;
    }

    const skip = overPart ? [from.part, overPart.id] : [from.part];
    const curve = wireCurve({ x: start.x, y: start.y + CONNECTOR.top, z: start.z }, end, { segments: 24, obstacles: poses.obstacles(), skip });
    const length = wireLength(curve) || 1;
    const n = Math.min(MAX_DOTS, Math.floor(length / GAP));
    const shift = (t * 0.6) % GAP; // the dots crawl toward the cursor
    for (let i = 0; i < n; i++) {
      const p = pointAlong(curve, Math.min(1, (shift + i * GAP) / length), length);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(0.7 + 0.3 * Math.sin(t * 5 - i * 0.6));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;

    aim.visible = Boolean(pin);
    if (pin) {
      aim.position.set(pin.x, pin.y + 0.02, pin.z);
      aim.scale.setScalar(0.8 + 0.2 * Math.sin(t * 6 + 1));
    }
  });

  return (
    <group name="wiring-line">
      <instancedMesh ref={dots} args={[undefined, undefined, MAX_DOTS]} frustumCulled={false} raycast={NO_RAYCAST} count={0}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </instancedMesh>
      <mesh ref={startRing} rotation-x={-Math.PI / 2} visible={false} renderOrder={5} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.1, 0.17, 28]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.95} toneMapped={false} depthTest={false} />
      </mesh>
      <mesh ref={aimRing} rotation-x={-Math.PI / 2} visible={false} renderOrder={5} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.1, 0.17, 28]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.95} toneMapped={false} depthTest={false} />
      </mesh>
    </group>
  );
}
