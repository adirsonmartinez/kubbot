"use client";

// Mouse and keyboard on the map.
// Left drag: pan (the grabbed ground point stays under the cursor).
// Right or middle drag, or Shift + drag: orbit (sideways rotates, up/down tilts).
// Wheel / pinch: zoom toward the cursor. Arrows or WASD: pan. Q / E: quarter turns.

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CameraRig } from "@/models/camera";

const ROTATE_SPEED = 0.008;
const TILT_SPEED = 0.005;
const KEY_PAN = 2.5;
const PAN_KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
};

export function MapInput({ rig }: { rig: CameraRig }) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // The camera matrix must match the rig before casting, or a drag lags one frame behind
    function syncCamera() {
      const o = rig.offset();
      camera.position.set(rig.target.x + o.x, o.y, rig.target.z + o.z);
      camera.lookAt(rig.target.x, 0, rig.target.z);
      camera.updateMatrixWorld();
    }

    function groundPointAt(clientX: number, clientY: number) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    }

    let grabPoint: THREE.Vector3 | null = null;
    let rotatingFrom: { x: number; y: number } | null = null;

    function onPointerDown(e: PointerEvent) {
      rig.cancelFlight();
      syncCamera();
      if (e.button !== 0 || e.shiftKey) rotatingFrom = { x: e.clientX, y: e.clientY };
      else grabPoint = groundPointAt(e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("dragging");
    }

    function onPointerMove(e: PointerEvent) {
      if (rotatingFrom) {
        rig.rotateBy(-(e.clientX - rotatingFrom.x) * ROTATE_SPEED);
        rig.tiltBy((e.clientY - rotatingFrom.y) * TILT_SPEED);
        rotatingFrom = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!grabPoint) return;
      syncCamera();
      const now = groundPointAt(e.clientX, e.clientY);
      if (!now) return;
      rig.panBy(grabPoint.x - now.x, grabPoint.z - now.z);
    }

    function onPointerUp(e: PointerEvent) {
      grabPoint = null;
      rotatingFrom = null;
      canvas.classList.remove("dragging");
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }

    // Zoom keeping the ground point under the cursor in place
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      syncCamera();
      const before = groundPointAt(e.clientX, e.clientY);
      const ratio = rig.zoom;
      rig.setZoomNow(rig.zoom * Math.exp(-e.deltaY * 0.001));
      camera.zoom *= rig.zoom / ratio;
      camera.updateProjectionMatrix();
      const after = groundPointAt(e.clientX, e.clientY);
      if (before && after) rig.panBy(before.x - after.x, before.z - after.z);
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "q") rig.rotateQuarter(1);
      if (key === "e") rig.rotateQuarter(-1);
      const move = PAN_KEYS[key];
      if (move && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        rig.panScreen(move[0], move[1], KEY_PAN);
      }
    }

    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvas, camera, rig]);

  return null;
}
