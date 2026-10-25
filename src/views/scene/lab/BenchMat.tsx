"use client";

// The work mat under the parts: a dark surface with a faint grid and a thin accent edge, wrapped in a soft
// shadow so it sits on the ground. It glides to fit the parts (always a little bigger than them), so an
// empty bench is a calm dark slab and a full one is a proper work surface.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { partBox } from "@/models/lab/layout";
import type { PlacedPart } from "@/viewmodels/useLabViewModel";
import { PALETTE } from "../palette";
import { matTexture, vignetteTexture } from "./benchTextures";

const MIN = { w: 18, d: 11 };
const MARGIN = 3.5;
const NO_RAYCAST = () => {};

export type Bounds = { cx: number; cz: number; w: number; d: number };

// Where the mat should be: around the parts with a margin, never smaller than a minimum
export function benchBounds(parts: readonly PlacedPart[]): Bounds {
  if (!parts.length) return { cx: 0, cz: 0, w: MIN.w, d: MIN.d };
  const boxes = parts.map(partBox);
  const x0 = Math.min(...boxes.map((b) => b.x - b.w / 2));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w / 2));
  const z0 = Math.min(...boxes.map((b) => b.z - b.d / 2));
  const z1 = Math.max(...boxes.map((b) => b.z + b.d / 2));
  const even = (v: number) => Math.ceil(v / 2) * 2;
  return {
    cx: Math.round((x0 + x1) / 2),
    cz: Math.round((z0 + z1) / 2),
    w: Math.max(MIN.w, even(x1 - x0 + MARGIN * 2)),
    d: Math.max(MIN.d, even(z1 - z0 + MARGIN * 2)),
  };
}

export function BenchMat({ parts }: { parts: readonly PlacedPart[] }) {
  const mat = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.LineLoop>(null);
  const halo = useRef<THREE.Mesh>(null);
  const goal = useMemo(() => benchBounds(parts), [parts]);
  const goalRef = useRef(goal);
  const now = useRef<Bounds>({ ...goal });
  const texture = useMemo(() => matTexture(), []);
  const halo$ = useMemo(() => vignetteTexture(), []);
  const outline = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z))),
    [],
  );

  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);
  useEffect(() => () => outline.dispose(), [outline]);

  function place() {
    const { cx, cz, w, d } = now.current;
    mat.current?.position.set(cx, 0.02, cz);
    mat.current?.scale.set(w, d, 1);
    edge.current?.position.set(cx, 0.03, cz);
    edge.current?.scale.set(w, 1, d);
    halo.current?.position.set(cx, 0.004, cz);
    halo.current?.scale.set(w + 4, d + 4, 1);
    if (texture) {
      texture.repeat.set(w / 5, d / 5);
      texture.offset.set((cx - w / 2) / 5, -(cz + d / 2) / 5);
    }
  }

  useEffect(place);

  useFrame((_, dtRaw) => {
    const k = 1 - Math.exp(-6 * Math.min(dtRaw, 0.1));
    const cur = now.current;
    const target = goalRef.current;
    let moving = false;
    for (const key of ["cx", "cz", "w", "d"] as const) {
      const diff = target[key] - cur[key];
      if (Math.abs(diff) > 0.005) {
        cur[key] += diff * k;
        moving = true;
      } else cur[key] = target[key];
    }
    if (moving) place();
  });

  return (
    <group name="bench-mat">
      {halo$ && (
        <mesh ref={halo} rotation-x={-Math.PI / 2} renderOrder={0} raycast={NO_RAYCAST}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={halo$} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh ref={mat} rotation-x={-Math.PI / 2} receiveShadow raycast={NO_RAYCAST}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={texture ? "#ffffff" : "#16181c"} map={texture} roughness={0.95} metalness={0} />
      </mesh>
      <lineLoop ref={edge} geometry={outline} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={PALETTE.accent} transparent opacity={0.4} />
      </lineLoop>
    </group>
  );
}
