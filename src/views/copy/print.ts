// Print-preview UI copy (Spanish) — the view layer only.

import { formatNumber } from "../../lib/format.ts";

export const printCopy = {
  see: "Ver cómo se imprime",
  stop: "Cerrar la impresión",
  title: "Impresión de la caja",
  progressAria: "Avance de la impresión",
  layerInfo: (current: number, total: number) => `Imprimiendo capa ${current} de ${total}`,
  estimatedTime: (m: number) => `Tiempo estimado: ${formatNumber(m)} min`,
  estimatedGrams: (g: number) => `Material: ${formatNumber(g)} g PLA`,
  play: "Reproducir",
  pause: "Pausar",
  reset: "Reiniciar",
  complete: "Impresión lista",
} as const;