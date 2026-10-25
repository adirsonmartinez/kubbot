import { formatNumber } from "../../lib/format.ts";

// HUD (health pill) visible strings for the circuit. Plain Spanish, non-technical.

export const hudCopy = {
  // The pill label after the percentage: "N piezas · M cables"
  partsAndWires: (parts: number, wires: number) =>
    `${parts} ${parts === 1 ? "pieza" : "piezas"} · ${wires} ${wires === 1 ? "cable" : "cables"}`,
  // The board's name without its ordinal ("Arduino Uno 1" -> "Arduino Uno"), so it never reads as part of the number
  boardName: (board: string) => board.replace(/\s+\d+$/, ""),
  // "285 de 500 mA", the power the board gives and what the parts ask for
  budgetValue: (used: number, budget: number) => `${formatNumber(used)} de ${formatNumber(budget)} mA`,
  // Tooltip / aria-label for the clickable issue counters
  showIssues: "Ver problemas del circuito",
  // Level labels
  levelGreen: "Todo bien",
  levelYellow: "Por revisar",
  levelRed: "Peligro",
  // Ring aria label
  ringAria: (score: number) => `Puntaje de salud: ${score} por ciento`,
} as const;