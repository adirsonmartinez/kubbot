// The wiring guide in words: turns the pure guide model (models/lab/guide) and the copy (views/copy/pins)
// into display-ready values for the lab view model: the tooltip of a pin, the help card of a part, the
// guide's current step and the reasons next to compatible pins. Pure functions, no React.

import { componentOf, type BoardPin } from "@/models/lab/catalog";
import type { Design, PinRef } from "@/models/lab/circuit";
import {
  guideSteps,
  pinAbilities,
  pinRole,
  pinStatuses,
  suggestWires,
  type Fit,
  type GuideStep,
  type NoteKey,
  type PinChoice,
  type PinRole,
  type ReasonKey,
  type Suggestion,
} from "@/models/lab/guide";
import { pinsCopy } from "@/views/copy/pins";
import { labCopy } from "@/views/copy/lab";

export type { Fit, PinRole, ReasonKey } from "@/models/lab/guide";

type PartHelpText = { does: string; pins: Record<string, { name: string; does: string }> };
const PART_HELP = pinsCopy.parts as Record<string, PartHelpText>;
const ROLE_WHERE = pinsCopy.roles as Record<string, { title: string; where: string }>;
const BOARD_ROLES = pinsCopy.board as Record<string, { title: string; does: string }>;
const REASONS = pinsCopy.reasons as Record<ReasonKey, (w: { pin: string; target: string }) => string>;
const NOTES = pinsCopy.notes as Record<NoteKey, string>;

const PART_NAMES = labCopy.parts as Record<string, { name: string; desc: string }>;

export type PinWords = { name: string; does: string; where: string | null; role: PinRole | null; isBoard: boolean };

// What a pin is for, in words: a part's pin by its own text, a board's pin by its role
export function pinWords(design: Design, ref: PinRef): PinWords | null {
  const part = design.parts.find((p) => p.id === ref.part);
  const spec = part && componentOf(part.type);
  if (!part || !spec || !(spec.pins as { id: string }[]).some((p) => p.id === ref.pin)) return null;
  const role = pinRole(part.type, ref.pin);
  if (spec.kind === "board") {
    const words = role ? BOARD_ROLES[role] : undefined;
    const extra = pinAbilities(part.type, ref.pin)
      .filter((k) => !roleCovers(role, k))
      .map((k) => pinsCopy.abilities[k])
      .filter(Boolean);
    const also = extra.length ? ` ${pinsCopy.alsoWorksAs(extra)}` : "";
    return { name: words?.title ?? ref.pin, does: `${words?.does ?? ""}${also}`.trim(), where: null, role, isBoard: true };
  }
  const own = PART_HELP[part.type]?.pins[ref.pin];
  const generic = role ? ROLE_WHERE[role] : undefined;
  return { name: own?.name ?? generic?.title ?? ref.pin, does: own?.does ?? "", where: generic?.where ?? null, role, isBoard: false };
}

// A board pin's role already says this ability (so "also works as" does not repeat it)
function roleCovers(role: PinRole | null, kind: string): boolean {
  switch (role) {
    case "board-5v": return kind === "5v";
    case "board-3v3": return kind === "3v3";
    case "board-vin": return kind === "vin";
    case "board-gnd": return kind === "gnd";
    case "board-sda": return kind === "sda";
    case "board-scl": return kind === "scl";
    case "board-pwm": return kind === "pwm" || kind === "digital";
    case "board-analog": return kind === "analog";
    case "board-digital": return kind === "digital";
    default: return false;
  }
}

export function partDoes(type: string): string {
  return PART_HELP[type]?.does ?? PART_NAMES[type]?.desc ?? "";
}

export const reasonText = (key: ReasonKey, pin: string, target: string): string => (REASONS[key] ?? REASONS.fine)({ pin, target });
export const noteText = (key: NoteKey | null): string | null => (key ? (NOTES[key] ?? null) : null);

// --- Compatible pins while wiring ---
export type PinFitView = PinChoice & { reason: string };

export function fitViews(from: PinRef, choices: PinChoice[]): PinFitView[] {
  return choices.map((c) => ({ ...c, reason: reasonText(c.reasonKey, from.pin, c.pin) }));
}

// --- The tooltip of the pin under the pointer ---
export type PinInfo = {
  part: string;
  pin: string;
  title: string; // "TRIG · Sensor de distancia 1"
  name: string; // "Disparo"
  does: string;
  where: string | null;
  wired: string | null; // "Conectado a D2 de Arduino Uno" / "Todavía sin conectar"
  fit: Fit | null; // while a wire is being made
  fitText: string | null;
  lines: string[]; // all of it, ready for the bench's label (first line is the title)
};

export function pinInfoOf(
  design: Design,
  hover: PinRef | null,
  wiring: PinRef | null,
  fits: PinFitView[],
  partLabel: (id: string) => string,
): PinInfo | null {
  if (!hover) return null;
  const words = pinWords(design, hover);
  if (!words) return null;
  const tip = pinsCopy.tip;
  const link = pinStatuses(design, hover.part).find((s) => s.pin === hover.pin)?.wiredTo ?? null;
  const wired = words.isBoard && !link ? null : link ? tip.wiredTo(link.pin, partLabel(link.part)) : tip.notWired;
  const choice = wiring && wiring.part !== hover.part ? fits.find((f) => f.part === hover.part && f.pin === hover.pin) : undefined;
  const fitLabel = choice ? { best: `✓ ${tip.bestHere}`, ok: `${tip.okHere}`, bad: `✕ ${tip.badHere}` }[choice.fit] : null;
  const fitText = choice && fitLabel ? `${fitLabel}. ${choice.reason}` : null;
  const title = tip.pinOf(hover.pin, partLabel(hover.part));
  const where = words.where ? tip.where(words.where) : null;
  // While wiring, the answer to "can I click here?" matters most: it goes right after the title
  const lines = [title, ...(fitText ? [fitText] : []), words.name && words.does ? `${words.name}: ${words.does}` : words.does || words.name, ...(where && !fitText ? [where] : []), ...(wired ? [wired] : [])].filter(Boolean);
  return { part: hover.part, pin: hover.pin, title, name: words.name, does: words.does, where, wired, fit: choice?.fit ?? null, fitText, lines };
}

// --- A part's help card ---
export type PinHelp = {
  pin: string;
  name: string;
  does: string;
  where: string | null;
  role: PinRole | null;
  required: boolean;
  connected: boolean;
  connectedTo: string | null; // "Conectado a 5V de Arduino Uno"
  hint: string | null; // where it would go if you let the lab choose
};
export type BoardLegend = { role: PinRole; title: string; does: string; pins: string[] };
export type PartHelp = {
  part: string;
  type: string;
  name: string;
  isBoard: boolean;
  does: string;
  pins: PinHelp[];
  legend: BoardLegend[]; // a board's pin kinds, with the pins of each
  wiredParts: number; // for a board: how many parts are wired to it
  hasBoard: boolean;
  pending: number; // wires "Conéctalo por mí" would add
};

export function partHelpOf(design: Design, id: string, partLabel: (id: string) => string): PartHelp | null {
  const part = design.parts.find((p) => p.id === id);
  const spec = part && componentOf(part.type);
  if (!part || !spec) return null;
  const hasBoard = design.parts.some((p) => componentOf(p.type)?.kind === "board");
  const isBoard = spec.kind === "board";
  const planned = new Map((isBoard ? [] : suggestWires(design, id)).map((s) => [s.from.pin, s]));
  const pins: PinHelp[] = isBoard
    ? []
    : pinStatuses(design, id).map((st) => {
        const words = pinWords(design, { part: id, pin: st.pin });
        const target = planned.get(st.pin);
        return {
          pin: st.pin,
          name: words?.name ?? st.pin,
          does: words?.does ?? "",
          where: words?.where ?? null,
          role: st.role,
          required: st.required,
          connected: !!st.wiredTo,
          connectedTo: st.wiredTo ? pinsCopy.card.connectedTo(st.wiredTo.pin, partLabel(st.wiredTo.part)) : null,
          hint: target ? pinsCopy.tip.where(target.to.pin) : null,
        };
      });
  const legend: BoardLegend[] = [];
  if (isBoard) {
    const groups = new Map<PinRole, string[]>();
    for (const pin of spec.pins as BoardPin[]) {
      const role = pinRole(part.type, pin.id);
      if (role) groups.set(role, [...(groups.get(role) ?? []), pin.id]);
    }
    for (const role of ["board-5v", "board-3v3", "board-vin", "board-gnd", "board-digital", "board-pwm", "board-analog", "board-sda", "board-scl"] as const) {
      const list = groups.get(role);
      const text = BOARD_ROLES[role];
      if (list && text) legend.push({ role, title: text.title, does: text.does, pins: list });
    }
  }
  const wiredTo = new Set<string>();
  if (isBoard) {
    for (const w of design.wires) {
      if (w.from.part === id) wiredTo.add(w.to.part);
      else if (w.to.part === id) wiredTo.add(w.from.part);
    }
  }
  return {
    part: id,
    type: part.type,
    name: partLabel(id),
    isBoard,
    does: partDoes(part.type),
    pins,
    legend,
    wiredParts: wiredTo.size,
    hasBoard,
    pending: suggestWires(design, id).length,
  };
}

// --- The step-by-step guide ---
export type StepView = {
  from: PinRef;
  to: PinRef;
  done: boolean;
  pin: string;
  target: string;
  title: string; // "Conecta VCC de Sensor de distancia con 5V de Arduino Uno."
  pinName: string; // "Energía"
  pinDoes: string;
  reason: string;
  note: string | null;
};
export type GuideView = {
  part: string;
  partName: string;
  index: number; // 0-based
  number: number; // 1-based, for the person
  total: number;
  isFirst: boolean;
  isLast: boolean;
  step: StepView;
  steps: { done: boolean; current: boolean }[];
};

function stepView(design: Design, step: GuideStep, partLabel: (id: string) => string): StepView {
  const words = pinWords(design, step.from);
  const g = pinsCopy.guide;
  return {
    from: step.from,
    to: step.to,
    done: step.done,
    pin: step.from.pin,
    target: step.to.pin,
    title: step.done ? g.already(step.from.pin, step.to.pin) : g.connect(step.from.pin, partLabel(step.from.part), step.to.pin, partLabel(step.to.part)),
    pinName: words?.name ?? step.from.pin,
    pinDoes: words?.does ?? "",
    reason: reasonText(step.reasonKey, step.from.pin, step.to.pin),
    note: noteText(step.noteKey),
  };
}

export function guideViewOf(design: Design, guide: { part: string; step: number } | null, partLabel: (id: string) => string): GuideView | null {
  if (!guide) return null;
  const steps = guideSteps(design, guide.part);
  const at = Math.min(guide.step, steps.length - 1);
  if (at < 0) return null;
  return {
    part: guide.part,
    partName: partLabel(guide.part),
    index: at,
    number: at + 1,
    total: steps.length,
    isFirst: at === 0,
    isLast: at === steps.length - 1,
    step: stepView(design, steps[at], partLabel),
    steps: steps.map((s, i) => ({ done: s.done, current: i === at })),
  };
}

// --- Suggested wires of the selected part (ghost wires on the bench) ---
export type SuggestionView = Suggestion & { reason: string; note: string | null };

export function suggestionViews(design: Design, partId: string | null): SuggestionView[] {
  if (!partId) return [];
  const spec = componentOf(design.parts.find((p) => p.id === partId)?.type);
  if (!spec || spec.kind !== "part") return [];
  return suggestWires(design, partId).map((s) => ({ ...s, reason: reasonText(s.reasonKey, s.from.pin, s.to.pin), note: noteText(s.noteKey) }));
}
