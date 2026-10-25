"use client";

// The catalog: a search box and the parts in sections of cards. A card drags onto the bench (the
// DropZone takes it) or, on a click, puts the part at the center. Presentational: it reads a slice of
// the lab view model and forwards clicks.

import { useRef, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import type { ImportViewModel } from "@/viewmodels/useImportViewModel";
import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { importCopy } from "@/views/copy/import";
import { labCopy } from "@/views/copy/lab";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";
import { noteDragEnd, noteDragStart } from "./dragPart";
import { colorHex, partChips, PART_MIME } from "./labText";
import { PartIcon } from "./PartIcon";

export type CatalogSlice = Pick<LabViewModel, "sections" | "query" | "setQuery" | "add">;
// The person's own parts and the "Nuevo componente" button (the import view model); optional so the catalog works without it
export type MineSlice = Pick<ImportViewModel, "mine" | "openDialog" | "remove" | "exportItem" | "message">;
type Item = CatalogSlice["sections"][number]["items"][number];
type MineItem = MineSlice["mine"][number];

function Card({ item, onAdd, mine }: { item: Item; onAdd: (type: string) => void; mine?: Pick<MineSlice, "remove" | "exportItem"> & { personal: boolean; photo: string | null } }) {
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
        {mine?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lab-card-photo" src={mine.photo} alt="" draggable={false} />
        ) : (
          <PartIcon id={item.id} category={item.category} size={42} />
        )}
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
          {mine?.personal && <span className="lab-chip warn">{importCopy.mine.personal}</span>}
        </span>
      </span>
      {mine && (
        <span className="lab-card-tools">
          <button
            type="button"
            className="lab-card-tool"
            aria-label={importCopy.mine.export(item.name)}
            title={importCopy.mine.export(item.name)}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              mine.exportItem(item.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Icon name="download" size={13} />
          </button>
          <button
            type="button"
            className="lab-card-tool"
            aria-label={importCopy.mine.remove(item.name)}
            title={importCopy.mine.remove(item.name)}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              mine.remove(item.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Icon name="trash" size={13} />
          </button>
        </span>
      )}
      <span className="lab-card-add" aria-hidden>
        <Icon name="plus" size={14} />
      </span>
    </div>
  );
}

export function CatalogPanel({ vm, mine }: { vm: CatalogSlice; mine?: MineSlice }) {
  const input = useRef<HTMLInputElement>(null);
  // The person's own parts have their own section; the built-in sections do not repeat them
  const own = new Set((mine?.mine ?? []).map((m) => m.id));
  const sections = vm.sections.map((s) => ({ ...s, items: s.items.filter((i) => !own.has(i.id)) })).filter((s) => s.items.length);
  const q = vm.query.trim().toLowerCase();
  const myItems: MineItem[] = (mine?.mine ?? []).filter((m) => !q || m.id.includes(q) || m.name.toLowerCase().includes(q));
  const total = sections.reduce((n, s) => n + s.items.length, 0) + myItems.length;

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

      {mine && (
        <button type="button" className="lab-new" title={importCopy.openHint} onClick={mine.openDialog}>
          <Icon name="plus" size={14} />
          {importCopy.open}
        </button>
      )}
      {mine?.message && (
        <p className="lab-mine-note" role="status">
          {mine.message}
        </p>
      )}

      {mine && (myItems.length > 0 || !q) && (
        <section className="lab-section" aria-label={importCopy.mine.title}>
          <h3 className="lab-section-title">
            {importCopy.mine.title}
            <em>{myItems.length}</em>
          </h3>
          {myItems.length === 0 ? (
            <p className="lab-none small">{importCopy.mine.empty}</p>
          ) : (
            <div className="lab-cards">
              {myItems.map((item) => (
                <Card key={item.id} item={item} onAdd={(type) => vm.add(type)} mine={{ remove: mine.remove, exportItem: mine.exportItem, personal: item.personal, photo: item.photo }} />
              ))}
            </div>
          )}
        </section>
      )}

      {total === 0 ? (
        <p className="lab-none">{labCopy.catalog.empty}</p>
      ) : (
        sections.map((section) => (
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
