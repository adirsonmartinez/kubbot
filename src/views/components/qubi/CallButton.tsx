"use client";

// The round phone button that starts and ends the call with Qubi. The orchestrator places it in the
// chat header (or on the robot's bubble). Presentational: the call view model in, clicks out.

import type { CallViewModel } from "@/viewmodels/useCallViewModel";
import { qubiCopy } from "@/views/copy/qubi";
import "@/views/styles/qubi.css";

const COPY = qubiCopy.call;

export function PhoneIcon({ size = 18, down = false }: { size?: number; down?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g transform={down ? "rotate(135 12 12)" : undefined}>
        <path d="M5 4h3.2l1.6 4.1-2 1.3a11 11 0 0 0 5.8 5.8l1.3-2 4.1 1.6V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z" />
      </g>
    </svg>
  );
}

export function CallButton({ call, className = "" }: { call: Pick<CallViewModel, "state" | "start" | "stop">; className?: string }) {
  const live = call.state.status === "on" || call.state.status === "connecting";
  const label = live ? COPY.stop : COPY.start;
  return (
    <button
      type="button"
      className={`call-btn${live ? " live" : ""} ${className}`.trim()}
      aria-label={label}
      aria-pressed={live}
      title={label}
      onClick={() => (live ? call.stop() : void call.start())}
    >
      <PhoneIcon down={live} />
    </button>
  );
}
