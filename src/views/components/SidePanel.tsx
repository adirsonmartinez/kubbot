// The glass panel that opens next to the side dock.

import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="side-panel glass-panel" aria-label={title}>
      <header className="side-panel-head">
        <strong>{title}</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar panel" title="Cerrar panel">
          <Icon name="minus" size={16} />
        </button>
      </header>
      <div className="side-panel-body">{children}</div>
    </aside>
  );
}
