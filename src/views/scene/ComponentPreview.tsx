"use client";

// A small isometric render of one component, for catalog cards. Renders once, on demand.

import { Canvas, useFrame } from "@react-three/fiber";
import { CAMERA } from "@/models/camera";
import type { ComponentKind } from "@/models/component";
import { COMPONENT_MODELS } from "./models";

const SPAN = 1.45; // world units that fit across the card
const FOCUS_Y = 0.15; // look at the middle of the model, not its base

export function ComponentPreview({ kind }: { kind: ComponentKind }) {
  const Model = COMPONENT_MODELS[kind];
  return (
    <Canvas orthographic frameloop="demand" dpr={[1, 2]} gl={{ antialias: true }}>
      <Frame />
      <hemisphereLight args={["#e6ebff", "#2a2d33", 1.4]} />
      <directionalLight position={[-2, 4, 3]} intensity={2.2} />
      <directionalLight position={[3, 2, -3]} color="#9fb4ff" intensity={0.8} />
      <Model />
    </Canvas>
  );
}

// Same angle as the map camera, zoomed so the model fills the card
function Frame() {
  useFrame(({ camera, size }) => {
    const { azimuth, elevation } = CAMERA;
    const d = 10;
    camera.position.set(
      Math.cos(elevation) * Math.sin(azimuth) * d,
      FOCUS_Y + Math.sin(elevation) * d,
      Math.cos(elevation) * Math.cos(azimuth) * d,
    );
    camera.lookAt(0, FOCUS_Y, 0);
    camera.zoom = size.width / SPAN;
    camera.updateProjectionMatrix();
  }, -1);
  return null;
}
