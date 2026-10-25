"use client";

import { historyCopy } from "@/views/copy/history";
import "@/views/styles/hud.css";

// ── Props ─────────────────────────────────────────────────────────────────

export type UndoRedoProps = {
  disabledUndo: boolean;
  disabledRedo: boolean;
  onUndo(): void;
  onRedo(): void;
};

// ── SVG icon path data (inline) ──────────────────────────────────────────

const UNDO_D =
  "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62" +
  "c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31" +
  " 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z";

const REDO_D =
  "M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0" +
  " -8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05" +
  " -5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.62" +
  " 3.62z";

// ── Small button (SVG icon only) ──────────────────────────────────────────

function GlassIconBtn({
  d,
  label,
  disabled,
  onClick,
}: {
  d: string;
  label: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="glass-icon-btn"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function UndoRedo({
  disabledUndo,
  disabledRedo,
  onUndo,
  onRedo,
}: UndoRedoProps) {
  return (
    <div className="lab-undo-redo glass-pill" role="group" aria-label={historyCopy.history}>
      <GlassIconBtn
        d={UNDO_D}
        label={historyCopy.undoAria}
        disabled={disabledUndo}
        onClick={onUndo}
      />
      <GlassIconBtn
        d={REDO_D}
        label={historyCopy.redoAria}
        disabled={disabledRedo}
        onClick={onRedo}
      />
    </div>
  );
}