// Small pure helpers the lab panels share, without React: the card chips, a color as CSS and the
// enclosure's size and print estimate. Names, review lines and notices come already translated from
// the view model. Inputs are structural, so this file imports no model and its tests run on their own.

import { labCopy } from "../../copy/lab.ts";

// dataTransfer type a catalog card carries while dragged (value = component id)
export const PART_MIME = "application/x-qubbot-part";

const PART_TEXT: Record<string, { name: string } | undefined> = labCopy.parts;

// A catalog part's visible name from its type, e.g. "hc-sr04" -> "Sensor de distancia"
export const partName = (type: string): string => PART_TEXT[type]?.name ?? type;

export const colorHex = (n: number): string => `#${(Number(n) >>> 0).toString(16).padStart(6, "0").slice(-6)}`;

type SpecLike = {
  kind: string;
  pins: readonly unknown[];
  logic?: number;
  volts?: readonly [number, number];
  supplies?: number;
  mA?: number;
};

// Short facts under a card: volts, mA drawn (parts only, when above 0) and how many pins
export function partChips(spec: SpecLike): string[] {
  const chips: string[] = [];
  const volts: [number, number] | null =
    spec.kind === "board" && spec.logic
      ? [spec.logic, spec.logic]
      : spec.volts
        ? [spec.volts[0], spec.volts[1]]
        : spec.supplies
          ? [spec.supplies, spec.supplies]
          : null;
  if (volts) chips.push(labCopy.catalog.volts(volts));
  if (spec.kind !== "board" && spec.mA && spec.mA > 0) chips.push(labCopy.catalog.mA(spec.mA));
  chips.push(labCopy.catalog.pins(spec.pins.length));
  return chips;
}

export type ReviewRow = { id: string; level: "yellow" | "red"; text: string; part: string | null };

// The view model's review lines, red first (stable), with a key for each; `part` only when it is on
// the bench
export function reviewRows(
  lines: readonly { level: "yellow" | "red"; key: string; part: string | null; text: string }[],
  onBench: ReadonlySet<string>,
): ReviewRow[] {
  const rank = { red: 0, yellow: 1 } as const;
  return lines
    .map((line, i) => ({
      i,
      id: `${line.key}:${line.part ?? ""}:${i}`,
      level: line.level,
      text: line.text,
      part: line.part && onBench.has(line.part) ? line.part : null,
    }))
    .sort((a, b) => rank[a.level] - rank[b.level] || a.i - b.i)
    .map(({ id, level, text, part }) => ({ id, level, text, part }));
}

export function reviewCounts(rows: readonly ReviewRow[]): { red: number; yellow: number; text: string } {
  const red = rows.filter((r) => r.level === "red").length;
  const yellow = rows.filter((r) => r.level === "yellow").length;
  return { red, yellow, text: labCopy.check.summary(red, yellow) };
}

// The enclosure's size and print estimate as two short lines; null while there is nothing to show.
// `data` is the view model's enclosure.data, read defensively.
export function enclosureFacts(data: unknown): { size: string; print: string } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { ok?: boolean; size?: { w?: number; d?: number; h?: number }; printMinutes?: number; grams?: number };
  if (d.ok === false || !d.size) return null;
  const round = (n: unknown) => Math.round(Number(n) || 0);
  return {
    size: labCopy.enclosure.size(round(d.size.w), round(d.size.d), round(d.size.h)),
    print: labCopy.enclosure.print(Number(d.printMinutes) || 0, round(d.grams)),
  };
}
