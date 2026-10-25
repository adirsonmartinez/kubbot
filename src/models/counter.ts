// Model: domain types and pure business rules. No React, no I/O.

export type Counter = {
  value: number;
  step: number;
};

export const MAX_STEP = 10;

export function createCounter(value = 0, step = 1): Counter {
  return { value, step: clampStep(step) };
}

export function increment(counter: Counter): Counter {
  return { ...counter, value: counter.value + counter.step };
}

export function decrement(counter: Counter): Counter {
  return { ...counter, value: counter.value - counter.step };
}

export function withStep(counter: Counter, step: number): Counter {
  return { ...counter, step: clampStep(step) };
}

function clampStep(step: number): number {
  return Math.min(MAX_STEP, Math.max(1, Math.round(step)));
}
