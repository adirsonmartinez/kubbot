// Health summary for the lab HUD. Pure and deterministic: no React, no DOM.
// Import Check and Design with relative path and .ts extension.

import { type Check, type Design } from "./circuit.ts";

// ── Public type ──────────────────────────────────────────────────────────

export type HealthReport = {
  score: number;       // 0..100  max(0, 100 - 15*red - 5*yellow); 100 when no parts
  level: "green" | "yellow" | "red";
  red: number;
  yellow: number;
  parts: number;
  wires: number;
  budget: {
    board: string;
    usedMa: number;
    budgetMa: number;
    ratio: number;
  }[];
};

// ── Main function ────────────────────────────────────────────────────────

export function healthOf(
  check: Check,
  design: Design,
): HealthReport {
  const red = check.issues.filter((i) => i.level === "red").length;
  const yellow = check.issues.filter((i) => i.level === "yellow").length;
  const score = design.parts.length === 0
    ? 100
    : Math.max(0, 100 - red * 15 - yellow * 5);

  return {
    score,
    level: check.level,
    red,
    yellow,
    parts: design.parts.length,
    wires: design.wires.length,
    budget: check.budget.map((b) => ({
      ...b,
      ratio: b.budgetMa > 0 ? b.usedMa / b.budgetMa : 0,
    })),
  };
}