"use client";

// The print animation's clock: play / pause / restart over ~12 seconds. With "reduce motion" on, playing
// jumps to the finished print at once.

import { useCallback, useEffect, useRef, useState } from "react";

const DURATION_S = 12;

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function usePrintClock() {
  const [progress, setProgress] = useState(0); // 0..1
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const from = useRef(0); // progress when the clock last started
  const startedAt = useRef(0);
  const progressRef = useRef(0);

  const stop = useCallback(() => cancelAnimationFrame(frame.current), []);

  const set = useCallback((p: number) => {
    progressRef.current = p;
    setProgress(p);
  }, []);

  const play = useCallback(() => {
    stop();
    if (prefersReducedMotion()) {
      set(1);
      setPlaying(false);
      return;
    }
    const start = progressRef.current >= 1 ? 0 : progressRef.current; // playing a finished print starts over
    from.current = start;
    startedAt.current = performance.now();
    setPlaying(true);
    const tick = () => {
      const p = Math.min(1, from.current + (performance.now() - startedAt.current) / (DURATION_S * 1000));
      set(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  }, [set, stop]);

  const pause = useCallback(() => {
    stop();
    setPlaying(false);
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setPlaying(false);
    set(0);
  }, [set, stop]);

  useEffect(() => stop, [stop]);

  return { progress, playing, play, pause, reset };
}

export type PrintClock = ReturnType<typeof usePrintClock>;
