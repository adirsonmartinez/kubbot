"use client";

// A small isometric render of one part, built with the bench's own part builder, for the import dialog. It
// rebuilds when `version` changes (the ficha or the photo changed) and turns slowly unless the person asked
// for reduced motion. `type` must be known to the catalog already (the view model registers the draft).

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildPart, type PartHandle } from "./parts";

const AZIMUTH = Math.PI / 4;
const ELEVATION = Math.atan(1 / Math.SQRT2) + 0.12; // the map camera's angle, a little higher
const SPIN = 0.35; // rad/s

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Turn the part and keep its light on (a function, so the hook rules see no mutation of the memoized part)
function animate(part: PartHandle, t: number, dt: number) {
  part.group.rotation.y = reducedMotion() ? 0 : t * SPIN;
  part.setSim({ kind: "generic", on: true });
  part.update(t, dt);
}

function Model({ type, version }: { type: string; version: string }) {
  const { invalidate } = useThree();
  const part = useMemo(() => {
    try {
      return buildPart(type);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, version]);
  const size = useMemo(() => {
    if (!part) return 1;
    const box = new THREE.Box3().setFromObject(part.group);
    const v = box.getSize(new THREE.Vector3());
    return Math.max(v.x, v.z, v.y * 1.4, 0.5);
  }, [part]);
  useEffect(() => () => part?.dispose(), [part]);
  useEffect(() => {
    invalidate();
    // The photo loads a moment after the part is built: keep drawing for a bit when frames are on demand
    const timer = setInterval(invalidate, 250);
    const stop = setTimeout(() => clearInterval(timer), 3000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [part, invalidate]);
  useFrame(({ camera, size: view, clock }, dt) => {
    if (!part) return;
    const distance = 20;
    camera.position.set(Math.cos(ELEVATION) * Math.sin(AZIMUTH) * distance, Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * Math.cos(AZIMUTH) * distance);
    camera.lookAt(0, 0.25, 0);
    (camera as THREE.OrthographicCamera).zoom = view.width / (size * 1.35);
    camera.updateProjectionMatrix();
    animate(part, clock.elapsedTime, dt);
  });
  return part ? <primitive object={part.group} /> : null;
}

export function PartPreview({ type, version }: { type: string; version: string }) {
  return (
    <Canvas orthographic frameloop={reducedMotion() ? "demand" : "always"} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <hemisphereLight args={["#e6ebff", "#2a2d33", 1.5]} />
      <directionalLight position={[-3, 6, 4]} intensity={2.4} />
      <directionalLight position={[4, 3, -3]} color="#9fb4ff" intensity={0.9} />
      <Model type={type} version={version} />
    </Canvas>
  );
}
