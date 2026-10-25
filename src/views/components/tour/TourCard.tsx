"use client";

import { tourUi } from "@/views/copy/tour";

type TourCardProps = {
  current: number; // 0-based
  total: number;
  title: string;
  text: string;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
};

/** Step card: "Paso n de N", title, text and the buttons to move on. */
export function TourCard({ current, total, title, text, onPrev, onNext, onSkip }: TourCardProps) {
  const last = current === total - 1;
  return (
    <div className="tour-card" role="dialog" aria-label={tourUi.step(current + 1, total)}>
      <div className="tour-card-header">
        <span className="tour-card-step">{tourUi.step(current + 1, total)}</span>
        <div className="tour-card-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`tour-dot ${i <= current ? "tour-dot-pass" : ""}`} />
          ))}
        </div>
      </div>

      <div className="tour-card-body">
        <h3 className="tour-card-title">{title}</h3>
        <p className="tour-card-text">{text}</p>
      </div>

      <div className="tour-card-footer">
        <button type="button" className="tour-btn tour-btn--skip" onClick={onSkip} aria-label={tourUi.skipAria}>
          {tourUi.skip}
        </button>
        <button type="button" className="tour-btn tour-btn--prev" onClick={onPrev} disabled={current === 0} aria-label={tourUi.prevAria}>
          {tourUi.prev}
        </button>
        <button type="button" className="tour-btn tour-btn--next" onClick={onNext} aria-label={tourUi.nextAria} autoFocus>
          {last ? tourUi.last : tourUi.next}
        </button>
      </div>
    </div>
  );
}
