"use client";

// ViewModel for the isometric map: owns the camera rig and exposes the map controls.
// The rig is mutable and read every frame by the scene: created once, never re-rendered on change.

import { useState } from "react";
import { CameraRig } from "@/models/camera";

const ZOOM_STEP = 1.3;

export function useMapViewModel() {
  const [camera] = useState(() => new CameraRig());

  return {
    rig: camera,
    zoomIn: () => camera.zoomBy(ZOOM_STEP),
    zoomOut: () => camera.zoomBy(1 / ZOOM_STEP),
    rotateLeft: () => camera.rotateQuarter(1),
    rotateRight: () => camera.rotateQuarter(-1),
    reset: () => camera.reset(),
  };
}

export type MapViewModel = ReturnType<typeof useMapViewModel>;
