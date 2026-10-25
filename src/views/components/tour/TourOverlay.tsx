"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { TourViewModel } from "@/viewmodels/useTourViewModel";
import "@/views/styles/tour.css";
import { TourCard } from "./TourCard";

const PAD = 8; // air around the highlighted element
const GAP = 14; // between the element and the card
const CARD_W = 360;
const CARD_H = 210; // enough to keep the card on screen; its real height may differ a little

type Box = { left: number; top: number; width: number; height: number };

// The first visible element carrying the data-tour attribute, in viewport pixels
function measure(target: string): Box | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The card beside the highlight (on the side the step asks for, flipped when it would leave the screen)
function cardStyle(box: Box, placement: "top" | "bottom" | "left" | "right"): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const room = {
    top: box.top - PAD - GAP,
    bottom: vh - (box.top + box.height + PAD) - GAP,
    left: box.left - PAD - GAP,
    right: vw - (box.left + box.width + PAD) - GAP,
  };
  const side = placement === "top" || placement === "bottom" ? (room[placement] >= CARD_H ? placement : placement === "top" ? "bottom" : "top") : room[placement] >= w ? placement : placement === "left" ? "right" : "left";
  if (side === "top") return { left: clamp(cx - w / 2, 16, vw - w - 16), top: Math.max(16, box.top - PAD - GAP - CARD_H) };
  if (side === "bottom") return { left: clamp(cx - w / 2, 16, vw - w - 16), top: Math.min(vh - CARD_H - 16, box.top + box.height + PAD + GAP) };
  if (side === "left") return { left: Math.max(16, box.left - PAD - GAP - w), top: clamp(cy - CARD_H / 2, 16, vh - CARD_H - 16) };
  return { left: Math.min(vw - w - 16, box.left + box.width + PAD + GAP), top: clamp(cy - CARD_H / 2, 16, vh - CARD_H - 16) };
}

/**
 * Dims the screen with a hole around the element whose data-tour attribute is the step's target and puts
 * the step card beside it. It follows the element when the layout changes; without the element (a closed
 * panel, say) the card is centered and nothing is highlighted.
 */
export function TourOverlay({ tour }: { tour: TourViewModel }) {
  const step = tour.step;
  const [box, setBox] = useState<Box | null>(null);
  const [, setSize] = useState(0);

  const target = step?.target ?? null;
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    // Measured on the next frame (the panel a step opens needs to be on screen), then kept up to date
    const update = () => {
      const next = measure(target);
      setBox((prev) => (prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    const loop = () => {
      update();
      frame = requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => setSize((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [target]);

  // Esc leaves the tour
  const active = tour.active;
  const skip = tour.skip;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && skip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, skip]);

  if (!step) return null;
  const shown = target && box ? box : null;

  return (
    <div className="tour-root" role="presentation">
      {shown ? (
        <div
          className="tour-hole"
          style={{ left: shown.left - PAD, top: shown.top - PAD, width: shown.width + PAD * 2, height: shown.height + PAD * 2 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-pop" data-standalone={shown ? undefined : "true"} style={shown ? cardStyle(shown, step.placement) : undefined}>
        <TourCard current={tour.index} total={tour.total} title={step.title} text={step.text} onPrev={tour.prev} onNext={tour.next} onSkip={tour.skip} />
      </div>
    </div>
  );
}
