"use client";

// Eases the rig every frame and applies it to the orthographic camera.

import { useFrame, useThree } from "@react-three/fiber";
import { CAMERA, type CameraRig } from "@/models/camera";

export function CameraController({ rig }: { rig: CameraRig }) {
  const height = useThree((state) => state.size.height);

  useFrame(({ camera }, dt) => {
    rig.step(Math.min(dt, 0.1));
    const o = rig.offset();
    camera.position.set(rig.target.x + o.x, o.y, rig.target.z + o.z);
    camera.lookAt(rig.target.x, 0, rig.target.z);
    // R3F sizes the orthographic frustum in pixels: zoom turns that into CAMERA.viewHeight world units
    const zoom = (height / CAMERA.viewHeight) * rig.zoom;
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  }, -1);

  return null;
}
