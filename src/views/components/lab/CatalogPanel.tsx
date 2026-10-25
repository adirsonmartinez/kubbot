"use client";

// The catalog: a search box and the parts in sections of cards. A card drags onto the bench (the
// DropZone takes it) or, on a click, puts the part at the center. Presentational: it reads a slice of
// the lab view model and forwards clicks.

import { useRef, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";
import { noteDragEnd, noteDragStart } from "./dragPart";
import { colorHex, partChips, PART_MIME } from "./labText";
import { PartIcon } from "./PartIcon";

export type CatalogSlice = Pick<LabViewModel, "sections" | "query" | "setQuery" | "add">;
type Item = CatalogSlice["sections"][number]["items"][number];

function Card({ item, onAdd }: { item: Item; onAdd: (type: string) => void }) {
  const name = item.name;
  const press = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onAdd(item.id);
  };
  const start = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(PART_MIME, item.id);
    e.dataTransfer.setData("text/plain", name);
    e.dataTransfer.effectAllowed = "copy";
    noteDragStart(item.id);
    e.currentTarget.classList.add("dragging");
  };
  const end = (e: DragEvent<HTMLDivElement>) => {
    noteDragEnd();
    e.currentTarget.classList.remove("dragging");
  };

  return (
    // A div, not a button: Firefox does not drag buttons
    <div
      className="lab-card"
      role="button"
      tabIndex={0}
      draggable
      style={{ "--part": colorHex(item.color) } as CSSProperties}
      aria-label={labCopy.catalog.add(name)}
      title={labCopy.catalog.add(name)}
      onClick={() => onAdd(item.id)}
      onKeyDown={press}
      onDragStart={start}
      onDragEnd={end}
    >
      <span className="lab-card-art">
        <PartIcon id={item.id} category={item.category} size={42} />
      </span>
      <span className="lab-card-text">
        <span className="lab-card-name">{name}</span>
        <span className="lab-card-desc">{item.desc}</span>
        <span className="lab-chips">
          {partChips(item).map((chip) => (
            <span key={chip} className="lab-chip">
              {chip}
            </span>
          ))}
        </span>
      </span>
      <span className="lab-card-add" aria-hidden>
        <Icon name="plus" size={14} />
      </span>
    </div>
  );
}

export function CatalogPanel({ vm }: { vm: CatalogSlice }) {
  const input = useRef<HTMLInputElement>(null);
  const total = vm.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lab-catalog">
      <p className="lab-intro">{labCopy.catalog.intro}</p>

      <label className="lab-search">
        <Icon name="search" size={15} />
        <input
          ref={input}
          type="search"
          value={vm.query}
          placeholder={labCopy.catalog.search}
          aria-label={labCopy.catalog.search}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => vm.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && vm.query) {
              e.stopPropagation();
              vm.setQuery("");
            }
          }}
        />
      </label>

      {/* Tells screen readers how many parts match as they type */}
      <p className="lab-sr" role="status" aria-live="polite">
        {total ? labCopy.labUi.results(total) : labCopy.catalog.empty}
      </p>

      {total === 0 ? (
        <p className="lab-none">{labCopy.catalog.empty}</p>
      ) : (
        vm.sections.map((section) => (
          <section key={section.category} className="lab-section">
            <h3 className="lab-section-title">
              {section.title}
              <em>{section.items.length}</em>
            </h3>
            <div className="lab-cards">
              {section.items.map((item) => (
                <Card key={item.id} item={item} onAdd={(type) => vm.add(type)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
