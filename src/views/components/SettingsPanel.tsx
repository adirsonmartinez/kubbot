"use client";

// The settings panel: the guided tour, Qubi's welcome interview again, and emptying the bench (asks first).
// Presentational: counts in, commands out.

import { useState } from "react";
import { settingsCopy } from "@/views/copy/settings";
import "@/views/styles/tour.css";

export function SettingsPanel({
  parts,
  onStartTour,
  onReplayWelcome,
  onClearBench,
}: {
  parts: number;
  onStartTour: () => void;
  onReplayWelcome: () => void;
  onClearBench: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const copy = settingsCopy;
  return (
    <>
      <section className="tour-settings first">
        <h3 className="tour-card-title">{copy.tour.title}</h3>
        <p className="muted">{copy.tour.text}</p>
        <button type="button" className="tour-btn tour-btn--next" onClick={onStartTour}>
          {copy.tour.start}
        </button>
      </section>
      <section className="tour-settings">
        <h3 className="tour-card-title">{copy.interview.title}</h3>
        <p className="muted">{copy.interview.text}</p>
        <button type="button" className="tour-btn tour-btn--prev" onClick={onReplayWelcome}>
          {copy.interview.start}
        </button>
      </section>
      <section className="tour-settings">
        <h3 className="tour-card-title">{copy.clear.title}</h3>
        <p className="muted">{confirming ? copy.clear.confirm(parts) : copy.clear.text(parts)}</p>
        {confirming ? (
          <div className="tour-settings-row">
            <button
              type="button"
              className="tour-btn tour-btn--danger"
              onClick={() => {
                setConfirming(false);
                onClearBench();
              }}
            >
              {copy.clear.yes}
            </button>
            <button type="button" className="tour-btn tour-btn--prev" onClick={() => setConfirming(false)}>
              {copy.clear.no}
            </button>
          </div>
        ) : (
          <button type="button" className="tour-btn tour-btn--prev" disabled={parts === 0} onClick={() => setConfirming(true)}>
            {copy.clear.start}
          </button>
        )}
      </section>
    </>
  );
}
