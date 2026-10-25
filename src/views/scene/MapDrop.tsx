"use client";

// Drop target for components dragged from the catalog: reports the ground point under the
// cursor while dragging over the map, and where the component was dropped.

import { useEffect, useEffectEvent } from "react";
import { useThree } from "@react-three/fiber";
import type { GroundPoint } from "@/models/camera";
import { COMPONENT_DRAG_TYPE } from "@/views/dragTypes";
import { groundPointAt } from "./groundPick";

export function MapDrop({
  onHover,
  onDrop,
}: {
  onHover: (point: GroundPoint | null) => void;
  onDrop: (point: GroundPoint) => void;
}) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);
  const hover = useEffectEvent(onHover);
  const drop = useEffectEvent(onDrop);

  useEffect(() => {
    // Ignore anything else dragged over the map (files, text)
    const accepts = (e: DragEvent) => !!e.dataTransfer?.types.includes(COMPONENT_DRAG_TYPE);
    const pointAt = (e: DragEvent) => {
      const p = groundPointAt(camera, canvas, e.clientX, e.clientY);
      return p && { x: p.x, z: p.z };
    };

    function onDragOver(e: DragEvent) {
      if (!accepts(e)) return;
      e.preventDefault(); // allows the drop
      e.dataTransfer!.dropEffect = "copy";
      hover(pointAt(e));
    }

    function onDragLeave(e: DragEvent) {
      if (accepts(e)) hover(null);
    }

    function onDropEvent(e: DragEvent) {
      if (!accepts(e)) return;
      e.preventDefault();
      const p = pointAt(e);
      if (p) drop(p);
    }

    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("dragleave", onDragLeave);
    canvas.addEventListener("drop", onDropEvent);
    return () => {
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("dragleave", onDragLeave);
      canvas.removeEventListener("drop", onDropEvent);
    };
  }, [canvas, camera]);

  return null;
}
