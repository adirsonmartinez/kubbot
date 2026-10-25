"use client";

// Small UI-only hooks of the chat: the clock the run card ticks with, "has this lasted long enough for an
// effect?" and the reduced-motion setting. Nothing here knows about the agent.

import { useEffect, useState, useSyncExternalStore } from "react";

// ---- One shared clock: components subscribe only while something is running ----
let tickNow = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const TICK_MS = 250;

function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    tickNow = Date.now();
    timer = setInterval(() => {
      tickNow = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const noClock = () => () => {};
const clockNow = () => tickNow;
const serverNow = () => 0;

// The current time, refreshed four times a second while `active` (otherwise it does not tick)
export function useNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribeClock : noClock, clockNow, serverNow);
}

// True once `on` has stayed true for `ms`; false again as soon as it stops
export function useAfter(on: boolean, ms: number): boolean {
  const [reached, setReached] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setReached(true), ms);
    return () => {
      clearTimeout(id);
      setReached(false);
    };
  }, [on, ms]);
  return on && reached;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void): () => void {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

// The person asked the system for less motion
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

// False on the server and during hydration, true afterwards (for effects that only exist in the browser)
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
