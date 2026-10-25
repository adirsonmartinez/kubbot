// Two-column grid of component cards, each with a preview area and its name.

import type { ComponentsViewModel } from "@/viewmodels/useComponentsViewModel";
import { Icon } from "./Icon";

export function ComponentGrid({ components }: Pick<ComponentsViewModel, "components">) {
  return (
    <ul className="component-grid">
      {components.map((c) => (
        <li key={c.id}>
          <button type="button" className="component-card" title={c.name}>
            {/* placeholder until components have a real preview */}
            <span className="component-preview" aria-hidden>
              <Icon name="cube" size={22} />
            </span>
            <span className="component-name">{c.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
