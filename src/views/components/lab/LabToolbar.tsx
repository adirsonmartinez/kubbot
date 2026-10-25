"use client";

// The bench's floating toolbar (bottom center of the stage): simulate, wire for me, the enclosure
// menu, make the code and, with a part selected, rotate and remove. It also holds the short notice
// (a toast) and the hint shown while a wire is being drawn. Presentational: a slice of the lab view
// model in, clicks out.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";
import { pinsCopy } from "@/views/copy/pins";
import { printCopy } from "@/views/copy/print";
import "@/views/styles/lab.css";
import { Icon, type IconName } from "../Icon";
import { enclosureFacts } from "./labText";

export type ToolbarSlice = Pick<
  LabViewModel,
  | "design"
  | "selected"
  | "sim"
  | "enclosure"
  | "wiring"
  | "wiringTip"
  | "dismissWiringTip"
  | "notice"
  | "partLabel"
  | "toggleSim"
  | "autoWire"
  | "toggleEnclosure"
  | "toggleExplode"
  | "startPrint"
  | "stopPrint"
  | "print"
  | "exportStl"
  | "exportScad"
  | "exportSketch"
  | "rotate"
  | "remove"
>;

const TOAST_MS = 3000;

function Button({
  label,
  icon,
  onClick,
  tone,
  pressed,
  className = "",
  tour,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  tone?: "primary" | "danger";
  pressed?: boolean;
  className?: string;
  tour?: string;
}) {
  return (
    <button
      type="button"
      data-tour={tour}
      className={`lab-btn${tone ? ` ${tone}` : ""}${pressed ? " on" : ""} ${className}`.trim()}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
      <span className="lab-btn-label">{label}</span>
    </button>
  );
}

type MenuEntry =
  | { kind: "fact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "separator" }
  | { kind: "item"; label: string; icon: IconName; run: () => void; checked?: boolean; disabled?: boolean; reason?: string };

function EnclosureMenu({ vm }: { vm: ToolbarSlice }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  // A press outside closes the menu; opening it moves focus to its first entry
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const facts = enclosureFacts(vm.enclosure.data);
  const visible = vm.enclosure.visible;
  const done = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  const entries: MenuEntry[] = [
    ...(facts
      ? [{ kind: "fact", text: facts.size } as const, { kind: "fact", text: facts.print } as const, { kind: "separator" } as const]
      : []),
    { kind: "item", label: visible ? labCopy.enclosure.hide : labCopy.enclosure.show, icon: "cube", run: done(() => vm.toggleEnclosure()) },
    {
      kind: "item",
      label: labCopy.enclosure.explode,
      icon: "layers",
      run: done(() => vm.toggleExplode()),
      checked: vm.enclosure.exploded,
      disabled: !visible,
      reason: visible ? undefined : labCopy.enclosure.exploreNeedsBox,
    },
    {
      kind: "item",
      label: vm.print.active ? printCopy.stop : printCopy.see,
      icon: "play",
      run: done(() => (vm.print.active ? vm.stopPrint() : vm.startPrint())),
    },
    { kind: "separator" },
    { kind: "item", label: labCopy.enclosure.exportStl, icon: "download", run: done(() => vm.exportStl()) },
    { kind: "heading", text: labCopy.enclosure.advanced },
    { kind: "item", label: labCopy.enclosure.exportScad, icon: "download", run: done(() => vm.exportScad()) },
  ];

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") return setOpen(false);
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };

  return (
    <div className="lab-box" ref={root} data-tour="toolbar-box">
      <button
        ref={trigger}
        type="button"
        className={`lab-btn${visible ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={labCopy.labUi.boxMenu}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="cube" size={16} />
        <span className="lab-btn-label">{labCopy.panel.enclosure}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div ref={menu} className="lab-menu glass-panel" role="menu" aria-label={labCopy.enclosure.title} onKeyDown={keys}>
          {entries.map((entry, i) =>
            entry.kind === "separator" ? (
              <hr key={i} className="lab-menu-sep" />
            ) : entry.kind === "heading" ? (
              <p key={i} className="lab-menu-heading">
                {entry.text}
              </p>
            ) : entry.kind === "fact" ? (
              <p key={i} className="lab-menu-fact">
                {entry.text}
              </p>
            ) : (
              <button
                key={entry.label}
                type="button"
                role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={entry.checked}
                aria-disabled={entry.disabled || undefined}
                title={entry.reason}
                tabIndex={-1}
                className={`lab-menu-item${entry.checked ? " on" : ""}`}
                onClick={() => !entry.disabled && entry.run()}
              >
                <Icon name={entry.icon} size={15} />
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function LabToolbar({
  vm,
  insetLeft = 16,
  insetRight = 16,
}: {
  vm: ToolbarSlice;
  /** Pixels the toolbar keeps free on each side (the chat on the right, the map controls on the left). */
  insetLeft?: number;
  insetRight?: number;
}) {
  const { design, selected, sim, wiring, notice } = vm;
  const running = sim.running;
  const part = selected && design.parts.some((p) => p.id === selected) ? selected : null;
  const partName = part ? vm.partLabel(part) : "";
  // After «Ver la caja»: how big it is and what it takes to print it
  const boxFacts = vm.enclosure.visible ? enclosureFacts(vm.enclosure.data) : null;

  // The toast shows when a new notice arrives and hides itself after a few seconds
  const [gone, setGone] = useState<unknown>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setGone(notice), TOAST_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  // The "wiring" notice has its own hint, so it makes no toast
  const toast = notice && notice.code !== "wiring" && notice !== gone ? notice : null;

  const style = { "--lab-left": `${insetLeft}px`, "--lab-right": `${insetRight}px` } as CSSProperties;

  return (
    <div className="lab-toolbar" style={style}>
      <div className="lab-stack">
        {wiring && (
          <p className="lab-hint" role="status">
            {labCopy.bench.wiring(vm.partLabel(wiring.part), wiring.pin)}
          </p>
        )}
        {vm.wiringTip && (
          <p className="lab-tip" role="note">
            <span className="lab-tip-dot" aria-hidden />
            <span>{pinsCopy.wiringTip.text}</span>
            <button type="button" className="lab-tip-close" onClick={() => vm.dismissWiringTip()}>
              {pinsCopy.wiringTip.dismiss}
            </button>
          </p>
        )}
        <p className="lab-toast" data-kind={toast?.kind ?? "ok"} hidden={!toast} role="status" aria-live="polite">
          {toast?.text}
        </p>

        {part && (
          <div className="lab-sel glass-panel" role="group" aria-label={labCopy.labUi.selectedPart(partName)}>
            <span className="lab-sel-name" title={labCopy.labUi.selectedPart(partName)}>
              {partName}
            </span>
            <Button label={labCopy.bench.rotate} icon="rotate" onClick={() => vm.rotate(part)} />
            <Button label={labCopy.bench.remove} icon="trash" tone="danger" onClick={() => vm.remove(part)} />
          </div>
        )}

        {boxFacts && (
          <p className="lab-facts" role="status">
            <Icon name="cube" size={14} />
            <span>{boxFacts.size}</span>
            <span aria-hidden>·</span>
            <span>{boxFacts.print}</span>
          </p>
        )}

        <div className="lab-pill glass-panel" data-running={running || undefined} role="toolbar" aria-label={labCopy.panel.toolbar}>
          <button
            type="button"
            data-tour="toolbar-sim"
            className={`lab-btn primary${running ? " running" : ""}`}
            aria-pressed={running}
            onClick={() => vm.toggleSim()}
          >
            {running ? <span className="lab-pulse" aria-hidden /> : <Icon name="play" size={16} />}
            <span className="lab-btn-label">{running ? labCopy.sim.stop : labCopy.sim.start}</span>
          </button>
          <Button label={labCopy.bench.autoWire} icon="plug" tour="toolbar-wire" onClick={() => vm.autoWire()} />
          <EnclosureMenu vm={vm} />
          <Button label={labCopy.sketch.make} icon="code" tour="toolbar-code" onClick={() => vm.exportSketch()} />

        </div>
      </div>
    </div>
  );
}
