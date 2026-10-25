"use client";

// ViewModel for placing components on the map: what is placed, and the component being
// dragged from the catalog with the area it would land on.

import { useState } from "react";
import type { GroundPoint } from "@/models/camera";
import type { ComponentKind } from "@/models/component";
import { type Area, areaAt, isFree, place, type Placement, sameArea } from "@/models/placement";

// Where the cursor is on the ground while dragging. Mutable and read every frame by the scene
// (it moves continuously; only area changes re-render).
class DragPointer {
  point: GroundPoint | null = null;

  set(point: GroundPoint | null) {
    this.point = point;
  }
}

export function usePlacementViewModel() {
  const [pointer] = useState(() => new DragPointer());
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [dragging, setDragging] = useState<ComponentKind | null>(null);
  const [hoverArea, setHoverArea] = useState<Area | null>(null);

  const endDrag = () => {
    pointer.set(null);
    setDragging(null);
    setHoverArea(null);
  };

  return {
    placements,
    pointer,
    preview:
      dragging && hoverArea
        ? { kind: dragging, ...hoverArea, free: isFree(placements, hoverArea) }
        : null,
    startDrag: (kind: ComponentKind) => setDragging(kind),
    endDrag,
    // Only re-renders when the cursor moves the area to other cells
    hover: (point: GroundPoint | null) => {
      pointer.set(point);
      const next = point && dragging ? areaAt(point, dragging) : null;
      setHoverArea((current) => (sameArea(current, next) ? current : next));
    },
    drop: (point: GroundPoint) => {
      if (dragging) setPlacements((current) => place(current, dragging, areaAt(point, dragging)));
      endDrag();
    },
  };
}

export type PlacementViewModel = ReturnType<typeof usePlacementViewModel>;
