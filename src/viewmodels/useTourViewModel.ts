"use client";

// The guided tour's view model: the pure walkthrough (models/lab/tour) plus remembering, in this browser,
// that the person already saw it. The view reads the current step and calls start / next / prev / skip.

import { useCallback, useReducer, useState } from "react";
import { INITIAL_STATE, TOUR_STEPS, tourReducer, type TourStep } from "@/models/lab/tour";
import { tourCopy, type TourCopyKey } from "@/views/copy/tour";

export const TOUR_KEY = "qubi-tour-seen";

export function readTourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "true";
  } catch {
    return false;
  }
}

function writeTourSeen() {
  try {
    window.localStorage.setItem(TOUR_KEY, "true");
  } catch {
    /* the tour is offered again next time */
  }
}

// "toolbar-wire" -> "toolbarWire", the key of its words in the copy
const copyKey = (target: string) => target.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) as TourCopyKey;

export type TourStepView = { target: string; placement: TourStep["placement"]; title: string; text: string };

export function useTourViewModel() {
  const [state, dispatch] = useReducer(tourReducer, INITIAL_STATE);
  const [seen, setSeen] = useState(false);

  const finish = useCallback(() => {
    dispatch({ type: "finish" });
    writeTourSeen();
    setSeen(true);
  }, []);

  const step: TourStepView | null = state.active
    ? (() => {
        const s = TOUR_STEPS[state.step];
        const words = tourCopy[copyKey(s.target)];
        return { target: s.target, placement: s.placement, title: words.title, text: words.text };
      })()
    : null;

  return {
    active: state.active,
    index: state.step,
    total: TOUR_STEPS.length,
    step,
    seen,
    start: () => dispatch({ type: "start" }),
    prev: () => dispatch({ type: "prev" }),
    // The last "next" ends the tour
    next: () => (state.step >= TOUR_STEPS.length - 1 ? finish() : dispatch({ type: "next" })),
    skip: finish,
  };
}

export type TourViewModel = ReturnType<typeof useTourViewModel>;
