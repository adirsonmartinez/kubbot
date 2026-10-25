// Service: data access (APIs, storage, external data). Returns Models.

import { createCounter, type Counter } from "@/models/counter";

const KEY = "counter";

// Async on purpose: same shape as a real API call.
export async function loadCounter(): Promise<Counter> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createCounter();
    const { value, step } = JSON.parse(raw) as Counter;
    return createCounter(value, step);
  } catch {
    return createCounter();
  }
}

export function saveCounter(counter: Counter): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(counter));
  } catch {
    // Storage unavailable (private mode, quota); state stays in memory.
  }
}
