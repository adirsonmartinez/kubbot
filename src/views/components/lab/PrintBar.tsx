"use client";

// The print preview's controls: «Imprimiendo capa N de M», the progress, play / pause, restart and close.
// It floats at the top center of the free part of the stage while the box is being "printed".

import type { CSSProperties } from "react";
import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { printCopy } from "@/views/copy/print";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";

export type PrintSlice = Pick<LabViewModel, "print" | "stopPrint">;

export function PrintBar({ vm, insetLeft = 16, insetRight = 16 }: { vm: PrintSlice; insetLeft?: number; insetRight?: number }) {
  const { print } = vm;
  if (!print.active) return null;
  const style = { "--lab-left": `${insetLeft}px`, "--lab-right": `${insetRight}px` } as CSSProperties;
  const running = print.playing;

  return (
    <div className="lab-print" style={style}>
      <div className="lab-print-bar glass-panel" role="group" aria-label={printCopy.title}>
        <button
          type="button"
          className="lab-print-btn"
          onClick={() => (running ? print.pause() : print.done ? print.restart() : print.play())}
          title={running ? printCopy.pause : print.done ? printCopy.reset : printCopy.play}
          aria-label={running ? printCopy.pause : print.done ? printCopy.reset : printCopy.play}
        >
          <Icon name={running ? "stop" : "play"} size={15} />
        </button>
        <button type="button" className="lab-print-btn" onClick={print.restart} title={printCopy.reset} aria-label={printCopy.reset}>
          <Icon name="rotate" size={15} />
        </button>
        <div className="lab-print-info">
          <span className="lab-print-label" role="status" aria-live="polite">
            {print.label}
          </span>
          <progress className="lab-print-progress" aria-label={printCopy.progressAria} value={print.done ? print.total : print.count} max={print.total} />
        </div>
        <button type="button" className="lab-print-btn" onClick={vm.stopPrint} title={printCopy.stop} aria-label={printCopy.stop}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}
