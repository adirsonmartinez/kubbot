// A floating glass pill of round icon buttons. The active one is a lit chip.
// Hovering a button shows its label and hint in a glass card.

import { Icon, type IconName } from "./Icon";

export type IconBarItem<Id extends string> = {
  id: Id;
  icon: IconName;
  label: string;
  hint?: string;
};

export function IconBar<Id extends string>({
  items,
  active,
  onSelect,
  orientation,
  className = "",
}: {
  items: IconBarItem<Id>[];
  active: Id | null;
  onSelect: (id: Id) => void;
  orientation: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div
      className={`icon-bar glass-pill ${orientation} ${className}`}
      role="toolbar"
      aria-orientation={orientation}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === active ? "active" : ""}
          aria-pressed={item.id === active}
          aria-label={item.label}
          onClick={() => onSelect(item.id)}
        >
          <Icon name={item.icon} size={19} />
          <span className="tip" role="tooltip">
            <strong>{item.label}</strong>
            {item.hint && <small>{item.hint}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
