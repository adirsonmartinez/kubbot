"use client";

// First visit: Qubi's welcome interview, then an offer of the guided tour. Only one card shows at a time
// (the phase), and each is remembered in this browser so it comes once. The tour can also be started on
// demand ("Recorrido" in the settings). A finished interview loads its recommended example and sends the
// recommendation to Qubi through the chat.

import { useCallback, useReducer, useState, useSyncExternalStore } from "react";
import { welcomeReducer, type BuildIntent, type ExperienceLevel, type WelcomeRecommendation, type WelcomeState } from "@/models/qubi/welcome";
import { readTourSeen, useTourViewModel } from "./useTourViewModel";

export type { BuildIntent, ExperienceLevel, WelcomeRecommendation, WelcomeState };

const WELCOME_KEY = "qubbot-welcome-seen";
const START: WelcomeState = { step: 0, answer: null, recommendation: null };
// The interview's reducer plus a "reset" to ask it again from the first question
const interviewReducer = (state: WelcomeState, action: Parameters<typeof welcomeReducer>[1] | { type: "reset" }) =>
  action.type === "reset" ? START : welcomeReducer(state, action);

// "Seen" flags live in localStorage; the server (and the first client render) say "seen" so nothing flashes
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function readWelcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "true";
  } catch {
    return true; // without storage it would come back every time
  }
}
function markWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_KEY, "true");
  } catch {
    /* it just shows again next time */
  }
  listeners.forEach((fn) => fn());
}

type Phase = "welcome" | "offer" | "idle";

export function useOnboardingViewModel({
  loadExampleNamed,
  send,
}: {
  loadExampleNamed: (name: string) => boolean;
  send: (prompt: string) => void;
}) {
  const tour = useTourViewModel();
  const welcomeSeen = useSyncExternalStore(subscribe, readWelcomeSeen, () => true);
  const [phase, setPhase] = useState<Phase | null>(null); // null: decided by what this browser has seen
  const [welcome, dispatch] = useReducer(interviewReducer, START);

  const current: Phase = phase ?? (welcomeSeen ? "idle" : "welcome");

  // After the welcome (done or skipped): the tour is offered once
  const afterWelcome = useCallback(() => {
    markWelcomeSeen();
    setPhase(readTourSeen() ? "idle" : "offer");
  }, []);

  return {
    tour,
    welcomeOpen: current === "welcome" && !tour.active,
    offerOpen: current === "offer" && !tour.active,
    welcome,
    answerBuild: (value: BuildIntent, freeText?: string) => dispatch({ type: "answer-build", value, freeText }),
    answerExperience: (value: ExperienceLevel) => dispatch({ type: "answer-experience", value }),
    back: () => dispatch({ type: "back" }),
    skipWelcome: () => {
      dispatch({ type: "skip" });
      afterWelcome();
    },
    // "Empezar": the example goes on the bench and the request goes to Qubi
    finishWelcome: () => {
      const rec = welcome.recommendation;
      if (rec) {
        if (rec.example) loadExampleNamed(rec.example);
        send(rec.prompt);
      }
      dispatch({ type: "skip" });
      afterWelcome();
    },
    // «Ver la entrevista otra vez» (Ajustes)
    replayWelcome: () => {
      dispatch({ type: "reset" });
      setPhase("welcome");
    },
    startTour: () => {
      setPhase("idle");
      tour.start();
    },
    declineTour: () => {
      setPhase("idle");
      tour.skip(); // not offered again
    },
  };
}

export type OnboardingViewModel = ReturnType<typeof useOnboardingViewModel>;
