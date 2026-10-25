"use client";

// Ground plane, grid and lights. They re-center on the camera (snapped to whole cells),
// so the grid feels infinite.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CameraRig } from "@/models/camera";
import { PALETTE } from "./palette";

const GRID_SIZE = 400; // cells per side
const SUN_OFFSET = new THREE.Vector3(-14, 30, 18); // from the top left: shadows fall to the right
const RIM_OFFSET = new THREE.Vector3(20, 18, -26); // cool light from behind to outline volumes

export function Ground({ rig }: { rig: CameraRig }) {
  const follow = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);

  const grid = useMemo(() => {
    const half = GRID_SIZE / 2;
    const points: number[] = [];
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = -half + i;
      points.push(-half, 0, p, half, 0, p); // lines along X
      points.push(p, 0, -half, p, 0, half); // lines along Z
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);

  useFrame(() => {
    const sx = Math.round(rig.target.x);
    const sz = Math.round(rig.target.z);
    follow.current?.position.set(sx, 0, sz);
    for (const [light, offset] of [
      [sun.current, SUN_OFFSET],
      [rim.current, RIM_OFFSET],
    ] as const) {
      if (!light) continue;
      light.position.set(sx, 0, sz).add(offset);
      light.target.position.set(sx, 0, sz);
      light.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <hemisphereLight args={["#cfd8ff", "#0b0d10", 0.9]} />
      <directionalLight ref={rim} color="#9fb4ff" intensity={1.1} />
      <directionalLight
        ref={sun}
        intensity={2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <group ref={follow}>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[GRID_SIZE * 2, GRID_SIZE * 2]} />
          <meshStandardMaterial color={PALETTE.ground} roughness={1} metalness={0} />
        </mesh>
        <lineSegments geometry={grid} position-y={0.005}>
          <lineBasicMaterial color={PALETTE.grid} />
        </lineSegments>
      </group>
    </>
  );
}
