"use client";

import { tourUi } from "@/views/copy/tour";
import "@/views/styles/tour.css";

/** After the welcome: a small card offering the guided tour. */
export function TourOffer({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="tour-offer glass-panel" role="dialog" aria-label={tourUi.offerTitle}>
      <h3 className="tour-card-title">{tourUi.offerTitle}</h3>
      <p className="tour-card-text">{tourUi.offerText}</p>
      <div className="tour-offer-actions">
        <button type="button" className="tour-btn tour-btn--skip" onClick={onNo}>
          {tourUi.offerNo}
        </button>
        <button type="button" className="tour-btn tour-btn--next" onClick={onYes} autoFocus>
          {tourUi.offerYes}
        </button>
      </div>
    </div>
  );
}
