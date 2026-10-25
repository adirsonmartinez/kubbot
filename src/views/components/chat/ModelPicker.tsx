"use client";

// The pill in the composer that says which Claude answers and how hard it thinks, and the menu to change
// both. The menu opens upward and is drawn in `menuHost` (outside the composer's border beam, which clips
// what spills out). The choice is kept by the view model (in this browser) and sent with each question.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatViewModel } from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";

const copy = chatCopy.picker;

type PickerVm = Pick<ChatViewModel, "choice" | "modelOptions" | "effortOptions" | "setModel" | "setEffort">;

export function ModelPicker({ vm, menuHost }: { vm: PickerVm; menuHost: HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const model = vm.modelOptions.find((m) => m.id === vm.choice.model) ?? vm.modelOptions[0];
  const effortIndex = Math.max(0, vm.effortOptions.findIndex((e) => e.id === vm.choice.effort));
  const effort = vm.effortOptions[effortIndex];

  // Close with Escape (focus goes back to the pill) or a click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      pill.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !pill.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    menu.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const panel = (
    <div ref={menu} id={menuId} className="picker-menu glass-pop" role="dialog" aria-label={copy.menu}>
      <p className="picker-label" id={`${menuId}-m`}>
        {copy.model}
      </p>
      <div className="model-grid" role="radiogroup" aria-labelledby={`${menuId}-m`}>
        {vm.modelOptions.map((m) => {
          const on = m.id === vm.choice.model;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} className={`model-option${on ? " active" : ""}`} onClick={() => vm.setModel(m.id)}>
              <strong>{m.name}</strong>
              <small>{m.note}</small>
            </button>
          );
        })}
      </div>

      <div className="effort" data-effort={vm.choice.effort} style={{ ["--level" as string]: effortIndex / Math.max(1, vm.effortOptions.length - 1) }}>
        <div className="effort-head">
          <span className="picker-label" id={`${menuId}-e`}>
            {copy.effort}
          </span>
          <strong className="effort-name">{effort.name}</strong>
        </div>
        <div className="effort-track">
          <div className="effort-fill" />
          <div className="effort-ticks" aria-hidden>
            {vm.effortOptions.map((e, i) => (
              <i key={e.id} className={i <= effortIndex ? "on" : ""} />
            ))}
          </div>
          <input
            className="effort-input"
            type="range"
            min={0}
            max={vm.effortOptions.length - 1}
            step={1}
            value={effortIndex}
            aria-labelledby={`${menuId}-e`}
            aria-valuetext={effort.name}
            onChange={(e) => vm.setEffort(vm.effortOptions[Number(e.target.value)].id)}
          />
        </div>
        <span className="effort-hint">{effort.hint}</span>
      </div>
      <p className="picker-note">{copy.saved}</p>
    </div>
  );

  return (
    <>
      <button
        ref={pill}
        type="button"
        className={`picker-pill${open ? " open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${copy.button}: ${model.name}, ${effort.name}`}
        title={`${model.name} · ${effort.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker-model">{model.name}</span>
        <span className="picker-meter" aria-hidden>
          {vm.effortOptions.map((e, i) => (
            <i key={e.id} className={i <= effortIndex ? "on" : ""} style={{ height: 5 + i * 2 }} />
          ))}
        </span>
        <span className="picker-chevron" aria-hidden />
      </button>
      {open && menuHost && createPortal(panel, menuHost)}
    </>
  );
}
