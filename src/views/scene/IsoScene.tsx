"use client";

// The isometric map: an orthographic camera over an infinite grid, with soft shadows and a bloom
// pass so only bright emissive surfaces (the accent, warnings) glow. Add objects as children.

import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { CameraRig } from "@/models/camera";
import { CameraController } from "./CameraController";
import { Ground } from "./Ground";
import { MapInput } from "./MapInput";
import { PALETTE } from "./palette";

export function IsoScene({ rig, children }: { rig: CameraRig; children?: ReactNode }) {
  return (
    <Canvas
      orthographic
      // A negative near plane: at a low tilt the bottom of the screen sees ground "behind" the camera
      camera={{ near: -400, far: 400 }}
      // "percentage" = PCFShadowMap; R3F's default (PCFSoftShadowMap) was removed from three.js
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[PALETTE.background]} />
      <CameraController rig={rig} />
      <MapInput rig={rig} />
      <Ground rig={rig} />
      {children}
      <EffectComposer>
        <Bloom intensity={0.45} luminanceThreshold={0.85} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
