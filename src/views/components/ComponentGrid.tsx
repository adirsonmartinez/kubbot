// Two-column grid of component cards, each with a preview area and its name.
// Cards drag onto the map.

import dynamic from "next/dynamic";
import type { ComponentsViewModel } from "@/viewmodels/useComponentsViewModel";
import type { PlacementViewModel } from "@/viewmodels/usePlacementViewModel";
import { COMPONENT_DRAG_TYPE } from "@/views/dragTypes";
import { Icon } from "./Icon";

// WebGL only exists in the browser
const ComponentPreview = dynamic(
  () => import("@/views/scene/ComponentPreview").then((m) => m.ComponentPreview),
  { ssr: false },
);

// A transparent pixel, created once (setDragImage needs an image that has already loaded)
let emptyImage: HTMLImageElement | null = null;
function emptyDragImage() {
  if (!emptyImage) {
    emptyImage = new Image(1, 1);
    emptyImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return emptyImage;
}

export function ComponentGrid({
  components,
  startDrag,
  endDrag,
}: Pick<ComponentsViewModel, "components"> & Pick<PlacementViewModel, "startDrag" | "endDrag">) {
  return (
    <ul className="component-grid">
      {components.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="component-card"
            title={c.kind ? `Arrastra ${c.name} al mapa` : c.name}
            disabled={!c.kind}
            draggable={!!c.kind}
            onPointerDown={emptyDragImage} // loads it before the first drag starts
            onDragStart={(e) => {
              if (!c.kind) return;
              e.dataTransfer.setData(COMPONENT_DRAG_TYPE, c.kind);
              e.dataTransfer.effectAllowed = "copy";
              // No browser drag image: the 3D model floating over the map is the feedback
              e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
              startDrag(c.kind);
            }}
            onDragEnd={endDrag}
          >
            <span className="component-preview" aria-hidden>
              {c.kind ? <ComponentPreview kind={c.kind} /> : <Icon name="cube" size={22} />}
            </span>
            <span className="component-name">{c.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
