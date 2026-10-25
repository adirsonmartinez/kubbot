// Zoom, turn and center buttons (bottom left of the map).

import type { MapViewModel } from "@/viewmodels/useMapViewModel";
import { Icon, type IconName } from "./Icon";

type Control = { icon: IconName; label: string; run: () => void };

export function MapControls({ vm }: { vm: MapViewModel }) {
  const groups: Control[][] = [
    [
      { icon: "plus", label: "Acercar", run: vm.zoomIn },
      { icon: "minus", label: "Alejar", run: vm.zoomOut },
    ],
    [
      { icon: "rotateLeft", label: "Girar a la izquierda (Q)", run: vm.rotateLeft },
      { icon: "rotateRight", label: "Girar a la derecha (E)", run: vm.rotateRight },
    ],
    [{ icon: "center", label: "Centrar la vista", run: vm.reset }],
  ];

  return (
    <div className="map-controls">
      {groups.map((group, i) => (
        <div key={i} className="glass-pill">
          {group.map((c) => (
            <button key={c.icon} type="button" onClick={c.run} aria-label={c.label} title={c.label}>
              <Icon name={c.icon} size={17} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
