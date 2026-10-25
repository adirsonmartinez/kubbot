"use client";

// The floating bar shown during a call with Qubi (top center of the stage): what he is doing, animated
// waves while he speaks or listens, the live caption of what the person is saying, mute and hang up.
// A call that failed shows its error (in plain Spanish) with a way to try again or close it.
// Presentational: the call view model in, clicks out.

import { useEffect, type ReactNode } from "react";
import { VoiceBeam, useMicrophone } from "voice-glow";
import type { CallViewModel } from "@/viewmodels/useCallViewModel";
import { qubiCopy } from "@/views/copy/qubi";
import "@/views/styles/qubi.css";
import "@/views/styles/chat.css";
import { PhoneIcon } from "./CallButton";

const COPY = qubiCopy.call;
const BARS = 5;

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

// The glow along the bottom of the bar follows the voice: the person's microphone while the call is live and
// not muted (opened here, only for the glow; the call itself keeps its own). Muted, or before the call is
// connected, the glow is off. If the browser refuses the microphone the glow just breathes at rest.
function CallGlow({ live, children }: { live: boolean; children: ReactNode }) {
  const { stream, start, stop } = useMicrophone();
  useEffect(() => {
    if (!live) return;
    void start();
    return stop;
  }, [live, start, stop]);
  return (
    <VoiceBeam className="call-beam" stream={live ? stream : null} active={live} theme="dark">
      {children}
    </VoiceBeam>
  );
}

export function CallBar({ call }: { call: Pick<CallViewModel, "state" | "start" | "stop" | "toggleMute"> }) {
  const { state } = call;
  if (state.status === "off") return null;

  if (state.status === "error") {
    const code = state.error ?? "failed";
    const message = (COPY.errors as Record<string, string>)[code] ?? COPY.errors.failed;
    return (
      <div className="call-bar error" role="alert">
        <span className="call-text">
          <strong>{message}</strong>
        </span>
        <button type="button" className="call-act" aria-label={COPY.start} title={COPY.start} onClick={() => void call.start()}>
          <PhoneIcon />
        </button>
        <button type="button" className="call-act hang" aria-label={COPY.stop} title={COPY.stop} onClick={call.stop}>
          <PhoneIcon down />
        </button>
      </div>
    );
  }

  const connecting = state.status === "connecting";
  const activity = state.muted ? "idle" : connecting ? "thinking" : state.activity;
  const status = connecting
    ? COPY.status.connecting
    : state.muted
      ? COPY.status.muted
      : activity === "speaking"
        ? COPY.status.speaking
        : activity === "thinking"
          ? COPY.status.thinking
          : COPY.status.listening;
  const caption = !connecting && !state.muted && activity === "listening" ? state.caption || COPY.captionHint : "";

  return (
    <CallGlow live={state.status === "on" && !state.muted}>
      <div className="call-bar" data-activity={activity} role="status" aria-live="polite">
        <span className="call-wave" aria-hidden>
          {Array.from({ length: BARS }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
          ))}
        </span>
        <span className="call-text">
          <strong>{status}</strong>
          {caption && <span className={`call-caption${state.caption ? " live" : ""}`}>{caption}</span>}
        </span>
        {state.mode && <span className="call-mode">{COPY.mode[state.mode]}</span>}
        <button
          type="button"
          className={`call-act${state.muted ? " on" : ""}`}
          aria-pressed={state.muted}
          aria-label={state.muted ? COPY.unmute : COPY.mute}
          title={state.muted ? COPY.unmute : COPY.mute}
          onClick={call.toggleMute}
        >
          <MicIcon off={state.muted} />
        </button>
        <button type="button" className="call-act hang" aria-label={COPY.stop} title={COPY.stop} onClick={call.stop}>
          <PhoneIcon down />
        </button>
      </div>
    </CallGlow>
  );
}
