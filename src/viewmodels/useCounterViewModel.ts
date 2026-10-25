"use client";

// ViewModel: owns the screen state, calls Models and Services,
// and exposes ready-to-render data plus commands for the View.

import { useEffect, useState } from "react";
import {
  createCounter,
  decrement,
  increment,
  MAX_STEP,
  withStep,
  type Counter,
} from "@/models/counter";
import { loadCounter, saveCounter } from "@/services/counterStorage";

export function useCounterViewModel() {
  const [counter, setCounter] = useState(createCounter);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCounter().then((loaded) => {
      if (cancelled) return;
      setCounter(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(next: Counter) {
    setCounter(next);
    saveCounter(next);
  }

  return {
    value: counter.value,
    step: counter.step,
    maxStep: MAX_STEP,
    loading,
    isNegative: counter.value < 0,
    increment: () => update(increment(counter)),
    decrement: () => update(decrement(counter)),
    setStep: (step: number) => update(withStep(counter, step)),
  };
}

export type CounterViewModel = ReturnType<typeof useCounterViewModel>;
