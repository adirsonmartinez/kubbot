"use client";

// Grabbing Qubi with the pointer. A press on him that does not travel is a tap (opens his menu); one that
// travels more than DRAG_PX lifts him: he follows the hand (the animator's hold), and on release he is
// dropped or thrown (the animator's drop; where he ends up is models/qubi/actions' resolveDrop).
//
// The press lands on his hit proxy. MapInput listens on the canvas before R3F, so it cannot know that; the
// hook registers a claim in `benchInput` ("this point is Qubi") and MapInput skips its pan. The hand keeps
// the spot of his body where it took him, so he does not jump to the cursor, and follows the pointer on the
// plane at that height, so the grabbed spot stays under the cursor while he rises.

import { useCallback, useEffect, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { THROW, resolveDrop, velocityOf, type DropBox, type PointerSample } from "@/models/qubi/actions";
import { benchInput } from "../benchInput";
import type { QubiAnimator } from "./animator";

const DRAG_PX = 5; // pointer travel that turns a press into a drag

export type GrabCallbacks = {
  onTap: (menuWasOpen: boolean) => void;
  onGrab: () => void;
  onArrive: (part: string) => void; // he was dropped on a part and walked to it
};

export type GrabInput = { boxes: readonly DropBox[]; menuOpen: boolean; enabled: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function useQubiGrab(animator: QubiAnimator, input: React.RefObject<GrabInput>, callbacks: React.RefObject<GrabCallbacks>) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const stop = useRef<(() => void) | null>(null);

  const tools = useRef({ ray: new THREE.Raycaster(), ndc: new THREE.Vector2(), plane: new THREE.Plane(), hit: new THREE.Vector3() });

  // Screen point -> a ray, through the camera of the moment
  const cast = useCallback(
    (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      tools.current.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      tools.current.ray.setFromCamera(tools.current.ndc, camera);
      return tools.current.ray;
    },
    [camera, canvas],
  );

  // Is this screen point on Qubi? (his invisible hit capsule)
  const hits = useCallback(
    (clientX: number, clientY: number) => {
      if (!input.current.enabled) return false;
      const ray = cast(clientX, clientY);
      return ray ? ray.intersectObject(animator.model.hit, false).length > 0 : false;
    },
    [animator, cast, input],
  );

  useEffect(() => benchInput.claim(hits), [hits]);
  useEffect(() => () => stop.current?.(), []);

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const { enabled, menuOpen } = input.current;
      if (!enabled || e.button !== 0 || e.nativeEvent.shiftKey || !animator.grabbable) return;
      e.stopPropagation();
      stop.current?.();

      const { ray, plane, hit } = tools.current;
      const [x0, y0, pointer] = [e.clientX, e.clientY, e.pointerId];
      // The spot of his body under the pointer, relative to his feet
      const grip = { x: e.point.x - animator.x, z: e.point.z - animator.z, y: e.point.y, lift: animator.lift };
      let dragging = false;
      let samples: PointerSample[] = [];

      const moveTo = (clientX: number, clientY: number) => {
        if (!cast(clientX, clientY)) return;
        plane.set(new THREE.Vector3(0, 1, 0), -(grip.y + animator.lift - grip.lift));
        if (!ray.ray.intersectPlane(plane, hit)) return;
        const feet = { x: clamp(hit.x - grip.x, -THROW.limit, THROW.limit), z: clamp(hit.z - grip.z, -THROW.limit, THROW.limit) };
        animator.hold(feet);
        const now = performance.now();
        samples.push({ ...feet, t: now });
        samples = samples.filter((s) => now - s.t < THROW.windowMs * 2);
      };

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointer) return;
        if (!dragging) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
          dragging = true;
          benchInput.dragging = true;
          canvas.style.cursor = "grabbing";
          try {
            canvas.setPointerCapture(pointer);
          } catch {
            // the pointer may be gone already: the window listeners still follow it
          }
          callbacks.current.onGrab();
        }
        moveTo(ev.clientX, ev.clientY);
      };

      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pointer) return;
        finish();
        if (!dragging) {
          if (ev.type === "pointerup") callbacks.current.onTap(menuOpen);
          return;
        }
        const at = { x: animator.x, z: animator.z };
        const drop = resolveDrop(at, velocityOf(samples), input.current.boxes);
        const part = drop.part;
        animator.drop({ land: drop.land, thrown: drop.thrown, center: drop.center, onArrive: part ? () => callbacks.current.onArrive(part) : undefined });
      };

      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stop.current = null;
        if (dragging) {
          benchInput.dragging = false;
          canvas.style.cursor = "";
          if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      // Closing from outside (unmount, a new press): let go where he is
      stop.current = () => {
        finish();
        if (dragging) animator.drop({ land: { x: animator.x, z: animator.z }, thrown: false, center: null });
      };
    },
    [animator, callbacks, canvas, cast, input],
  );

  return { onPointerDown, hits };
}
