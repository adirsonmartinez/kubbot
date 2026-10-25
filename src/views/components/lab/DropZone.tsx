"use client";

// Wraps the stage so catalog cards can be dropped on the 3D bench. While a card is dragged over the
// canvas, a ring and a small label follow the cursor; on drop it calls onDropPart with the part type
// and the screen point (the bench turns that into a ground point). It renders no box of its own.

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { labCopy } from "@/views/copy/lab";
import "@/views/styles/lab.css";
import { draggedPart, noteDragEnd } from "./dragPart";
import { partName, PART_MIME } from "./labText";

const hasPart = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes(PART_MIME);
// Only the 3D canvas takes parts: a drop on a panel or the toolbar does nothing
const onCanvas = (e: DragEvent) => e.target instanceof Element && e.target.closest("canvas") !== null;

export function DropZone({
  onDropPart,
  disabled = false,
  children,
}: {
  onDropPart: (type: string, clientX: number, clientY: number) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const ghost = useRef<HTMLDivElement>(null);
  const [type, setType] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const hide = useCallback(() => setOver(false), []);

  const move = (e: DragEvent) => {
    const el = ghost.current;
    if (el) el.style.transform = `translate(${Math.round(e.clientX)}px, ${Math.round(e.clientY)}px)`;
  };

  const onOver = (e: DragEvent) => {
    if (disabled || !hasPart(e) || !onCanvas(e)) {
      if (over) hide();
      return;
    }
    e.preventDefault(); // allows the drop
    e.dataTransfer.dropEffect = "copy";
    move(e);
    const current = draggedPart();
    if (current !== type) setType(current);
    if (!over) setOver(true);
  };

  const onLeave = (e: DragEvent) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    hide();
  };

  const onDrop = (e: DragEvent) => {
    if (disabled || !hasPart(e) || !onCanvas(e)) return;
    e.preventDefault();
    hide();
    const dropped = e.dataTransfer.getData(PART_MIME) || draggedPart();
    noteDragEnd();
    if (dropped) onDropPart(dropped, e.clientX, e.clientY);
  };

  // A drag cancelled with Esc, or dropped elsewhere, never fires drop here
  useEffect(() => {
    const end = () => {
      noteDragEnd();
      hide();
    };
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end, true);
    return () => {
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end, true);
    };
  }, [hide]);

  const label = type ? labCopy.panel.dropPart(partName(type)) : labCopy.bench.dropHere;

  return (
    <div className="lab-dropzone" onDragEnter={onOver} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}>
      {children}
      <div ref={ghost} className={`lab-ghost${over ? " on" : ""}`} aria-hidden>
        <span className="lab-ghost-ring" />
        <span className="lab-ghost-tag">
          {over ? label : ""}
        </span>
      </div>
    </div>
  );
}
