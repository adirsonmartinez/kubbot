// The wiring guide: what each pin is for, which pins fit which, what "Conectar solo" would do and the
// order to wire a part by hand. Pure and deterministic; no text here (views/copy/pins.ts explains every
// role and reason key in plain Spanish). The checker still decides what is safe: a "bad" pin is one
// that would make checkDesign raise a new problem.

import { componentOf, userEntryOf, type Board, type BoardPin, type Part, type PartPin } from "./catalog.ts";
import { RESISTOR, STRAPPING, autoWire, checkDesign, connect, type Design, type Issue, type PinRef, type PlacedPart } from "./circuit.ts";

// --- Roles: what a pin is for ---
export const PART_ROLE_IDS = [
  "power", // VCC / 5V: the part's supply
  "ground", // GND, or the battery's minus
  "vin", // the battery's plus
  "trigger", // HC-SR04 TRIG
  "echo", // HC-SR04 ECHO
  "data", // DHT22 DATA
  "signal-in", // the part tells the board something (PIR OUT, button)
  "signal-out", // the board tells the part something (relay, LED, buzzer, motor direction)
  "direction", // L298N IN1 / IN2
  "pwm", // servo signal, motor speed
  "analog-in", // a level read as a number (soil, light, knob)
  "sda", // I2C data
  "scl", // I2C clock
] as const;
export type PartRole = (typeof PART_ROLE_IDS)[number];
export type BoardRole = "board-5v" | "board-3v3" | "board-vin" | "board-gnd" | "board-digital" | "board-pwm" | "board-analog" | "board-sda" | "board-scl";
export type PinRole = PartRole | BoardRole;

// Specific parts first; any other part falls back on what its pin accepts
const PART_ROLES: Record<string, Record<string, PartRole>> = {
  "hc-sr04": { TRIG: "trigger", ECHO: "echo" },
  pir: { OUT: "signal-in" },
  dht22: { DATA: "data" },
  "servo-sg90": { SIG: "pwm" },
  relay: { IN: "signal-out" },
  buzzer: { SIG: "signal-out" },
  led: { SIG: "signal-out" },
  l298n: { "5V": "power", ENA: "pwm", IN1: "direction", IN2: "direction" },
  button: { SIG: "signal-in" },
  [RESISTOR]: { A: "signal-out", B: "signal-out" },
  "battery-aa4": { "+": "vin", "-": "ground" },
};

const POWER_KINDS = new Set(["5v", "3v3", "vin"]);

function roleOfAccepts(pin: PartPin): PartRole {
  const a = pin.accepts as string[];
  if (a.includes("gnd")) return "ground";
  if (a.includes("vin")) return "vin";
  if (a.some((k) => POWER_KINDS.has(k))) return "power";
  if (a.includes("sda")) return "sda";
  if (a.includes("scl")) return "scl";
  if (a.includes("analog")) return "analog-in";
  if (a.includes("pwm") && !a.includes("digital")) return "pwm";
  return "signal-out";
}

function roleOfKinds(pin: BoardPin): BoardRole {
  const k = pin.kinds as string[];
  if (k.includes("gnd")) return "board-gnd";
  if (k.includes("5v")) return "board-5v";
  if (k.includes("3v3")) return "board-3v3";
  if (k.includes("vin")) return "board-vin";
  if (k.includes("sda")) return "board-sda";
  if (k.includes("scl")) return "board-scl";
  if (k.includes("analog") && !k.includes("pwm")) return "board-analog";
  if (k.includes("pwm") && !k.includes("analog")) return "board-pwm";
  if (k.includes("analog")) return "board-analog";
  return "board-digital";
}

// What a pin is for; null when the part or the pin does not exist
export function pinRole(type: string, pinId: string): PinRole | null {
  const spec = componentOf(type);
  const pin = (spec?.pins as (BoardPin | PartPin)[] | undefined)?.find((p) => p.id === pinId);
  if (!spec || !pin) return null;
  if (spec.kind === "board") return roleOfKinds(pin as BoardPin);
  const own = userEntryOf(spec.id)?.roles[pin.id];
  return PART_ROLES[spec.id]?.[pin.id] ?? (PART_ROLE_IDS.find((r) => r === own) as PartRole | undefined) ?? roleOfAccepts(pin as PartPin);
}

// The extra things a board pin can do besides its role (for "also works as…")
export function pinAbilities(type: string, pinId: string): string[] {
  const spec = componentOf(type);
  const pin = spec?.kind === "board" ? spec.pins.find((p) => p.id === pinId) : null;
  return pin ? [...pin.kinds] : [];
}

// --- Reasons: why a pin was chosen, or why not ---
export type ReasonKey =
  // why a suggestion goes where it goes
  | "power-5v" | "power-3v3" | "power-3v3-logic" | "power-vin" | "ground"
  | "signal-digital" | "signal-pwm" | "signal-analog" | "bus-sda" | "bus-scl"
  | "resistorIn" | "resistorOut" // the LED's resistor: from the board pin to its A, and from its B to the LED
  // pins that work, but not as well
  | "fine" | "special" | "delicate" | "levelShift" | "budget" | "partLink"
  // pins that would make the checker complain
  | "noResistor" | "sameAddress" | "needsBattery" | "inputOnly"
  | "wrongKind" | "signalToPart" | "taken" | "overvoltage" | "undervoltage" | "short" | "mixedPower" | "boardToBoard" | "already";
export type NoteKey = "levelDivider" | "ledResistor";
export type Fit = "best" | "ok" | "bad";

export type PinChoice = { part: string; pin: string; fit: Fit; reasonKey: ReasonKey };
export type Suggestion = { from: PinRef; to: PinRef; reasonKey: ReasonKey; noteKey: NoteKey | null };
export type GuideStep = Suggestion & { done: boolean };
export type PinStatus = { pin: string; role: PinRole; required: boolean; wiredTo: PinRef | null };

const sameEnd = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;
const partOf = (design: Design, id: string): PlacedPart | undefined => design.parts.find((p) => p.id === id);
const firstBoard = (design: Design) => design.parts.find((p) => componentOf(p.type)?.kind === "board");

function pinSpecOf(design: Design, end: PinRef) {
  const part = partOf(design, end.part);
  const spec = part && componentOf(part.type);
  const pin = spec && (spec.pins as (BoardPin | PartPin)[]).find((p) => p.id === end.pin);
  return part && spec && pin ? { part, spec, pin } : null;
}

// Why autoWire picks this board pin for this part pin
function reasonOf(pin: PartPin, target: BoardPin): ReasonKey {
  const k = target.kinds as string[];
  const a = pin.accepts as string[];
  if (k.includes("gnd")) return "ground";
  if (k.includes("vin")) return "power-vin";
  if (k.includes("5v")) return "power-5v";
  if (k.includes("3v3")) return a.includes("5v") ? "power-3v3-logic" : "power-3v3";
  if (a.includes("sda")) return "bus-sda";
  if (a.includes("scl")) return "bus-scl";
  if (a.includes("analog")) return "signal-analog";
  if (a.includes("pwm") && !a.includes("digital")) return "signal-pwm";
  return "signal-digital";
}

function noteOf(spec: Part, pin: PartPin, board: Board): NoteKey | null {
  if (spec.out5v && pinRole(spec.id, pin.id) === "echo" && board.logic < 5) return "levelDivider";
  return null;
}

function suggestionOf(design: Design, from: PinRef, to: PinRef): Suggestion | null {
  const a = pinSpecOf(design, from);
  const b = pinSpecOf(design, to);
  if (!a || !b || a.spec.kind !== "part") return null;
  // The resistor of an LED: board pin -> its A, its B -> the LED's signal
  if (a.spec.id === RESISTOR) {
    if (b.spec.kind === "board") return { from, to, reasonKey: "resistorIn", noteKey: null };
    return b.spec.id === "led" ? { from, to, reasonKey: "resistorOut", noteKey: null } : null;
  }
  if (b.spec.kind !== "board") return null;
  return { from, to, reasonKey: reasonOf(a.pin as PartPin, b.pin as BoardPin), noteKey: noteOf(a.spec, a.pin as PartPin, b.spec) };
}

// The wires "Conectar solo" WOULD add, in the order it would add them, without touching the design:
// for a part, that part's; for a board, every part's to that board; for nothing, every part's to the
// first board. Each wire says why that pin.
export function suggestWires(design: Design, partId?: string | null): Suggestion[] {
  const target = partId ? partOf(design, partId) : undefined;
  if (partId && !target) return [];
  const targetIsBoard = !!target && componentOf(target.type)?.kind === "board";
  const parts = target && !targetIsBoard ? [target] : design.parts.filter((p) => componentOf(p.type)?.kind === "part");
  const boardId = targetIsBoard ? target!.id : null;
  const out: Suggestion[] = [];
  let next = design;
  for (const part of parts) {
    const result = autoWire(next, part.id, boardId);
    next = result.design;
    for (const wire of result.added) {
      const suggestion = suggestionOf(next, wire.from, wire.to);
      if (suggestion) out.push(suggestion);
    }
  }
  return out;
}

// Every pin of a part with its role and what it is wired to now (null: nothing yet)
export function pinStatuses(design: Design, partId: string): PinStatus[] {
  const part = partOf(design, partId);
  const spec = part && componentOf(part.type);
  if (!part || !spec) return [];
  return (spec.pins as (BoardPin | PartPin)[]).map((pin) => {
    const end = { part: partId, pin: pin.id };
    const wire = design.wires.find((w) => sameEnd(w.from, end) || sameEnd(w.to, end));
    const other = wire ? (sameEnd(wire.from, end) ? wire.to : wire.from) : null;
    return {
      pin: pin.id,
      role: pinRole(part.type, pin.id) as PinRole,
      required: "required" in pin && !!pin.required,
      wiredTo: other ? { part: other.part, pin: other.pin } : null,
    };
  });
}

// --- Compatible pins while wiring ---
const BAD_ORDER: [Issue["key"], ReasonKey][] = [
  ["short", "short"],
  ["mixedPower", "mixedPower"],
  ["overvoltage", "overvoltage"],
  ["ledNoResistor", "noResistor"],
  ["i2cDuplicate", "sameAddress"],
  ["externalPower", "needsBattery"],
  ["inputOnly", "inputOnly"],
  ["undervoltage", "undervoltage"],
  ["wrongPin", "wrongKind"],
  ["pinShared", "taken"],
];
const OK_RANK: Record<string, number> = { fine: 0, partLink: 0, budget: 1, levelShift: 2, special: 3, delicate: 4 };
const FIT_RANK: Record<Fit, number> = { best: 0, ok: 1, bad: 2 };

const issueSig = (i: Issue) => `${i.key}|${i.part ?? ""}|${i.pin ?? ""}|${i.board ?? ""}|${i.boardPin ?? ""}`;

// Two part pins (neither on a board): ground with ground, supply with supply; nothing else
function partsMatch(a: PartPin, b: PartPin): boolean {
  const ka = a.accepts as string[];
  const kb = b.accepts as string[];
  const power = (k: string[]) => k.some((x) => POWER_KINDS.has(x));
  if (ka.includes("gnd") || kb.includes("gnd")) return ka.includes("gnd") && kb.includes("gnd");
  if (power(ka) || power(kb)) return power(ka) && power(kb);
  return false; // two signals never talk to each other directly: each goes to the board
}

// For every pin on the bench (other than the ones on the same part) how well it fits `from`: best is
// what "Conectar solo" would choose, ok works, bad would make the checker complain. Ranked best first.
export function compatiblePins(design: Design, from: PinRef): PinChoice[] {
  const origin = pinSpecOf(design, from);
  if (!origin) return [];
  const fromIsBoard = origin.spec.kind === "board";
  const planned = suggestWires(design, fromIsBoard ? null : from.part);
  const bestOf = new Map<string, ReasonKey>(); // "partPin>boardPin" -> why
  for (const s of planned) bestOf.set(`${s.from.part}.${s.from.pin}>${s.to.part}.${s.to.pin}`, s.reasonKey);
  const before = new Set(checkDesign(design).issues.map(issueSig));

  const out: (PinChoice & { order: number })[] = [];
  let order = 0;
  for (const part of design.parts) {
    if (part.id === from.part) continue;
    const spec = componentOf(part.type);
    if (!spec) continue;
    for (const pin of spec.pins as (BoardPin | PartPin)[]) {
      const to = { part: part.id, pin: pin.id };
      const key = fromIsBoard ? `${to.part}.${to.pin}>${from.part}.${from.pin}` : `${from.part}.${from.pin}>${to.part}.${to.pin}`;
      const best = bestOf.get(key);
      const verdict = best ? { fit: "best" as const, reasonKey: best } : judge(design, before, origin, { part, spec, pin }, from, to);
      out.push({ part: part.id, pin: pin.id, ...verdict, order: order++ });
    }
  }
  out.sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || (OK_RANK[a.reasonKey] ?? 0) - (OK_RANK[b.reasonKey] ?? 0) || a.order - b.order);
  return out.map(({ part, pin, fit, reasonKey }) => ({ part, pin, fit, reasonKey }));
}

type Found = NonNullable<ReturnType<typeof pinSpecOf>>;

function judge(design: Design, before: Set<string>, a: Found, b: Found, from: PinRef, to: PinRef): { fit: Fit; reasonKey: ReasonKey } {
  if (a.spec.kind === "board" && b.spec.kind === "board") return { fit: "bad", reasonKey: "boardToBoard" };
  const joined = connect(design, from, to);
  if (!joined.ok) return { fit: "bad", reasonKey: "already" };
  const fresh = checkDesign(joined.design).issues.filter((i) => !before.has(issueSig(i)));
  for (const [issue, reasonKey] of BAD_ORDER) if (fresh.some((i) => i.key === issue)) return { fit: "bad", reasonKey };
  const partPin = (a.spec.kind === "part" ? a.pin : b.spec.kind === "part" ? b.pin : null) as PartPin | null;
  const boardPin = (a.spec.kind === "board" ? a.pin : b.spec.kind === "board" ? b.pin : null) as BoardPin | null;
  const board = (a.spec.kind === "board" ? a.spec : b.spec.kind === "board" ? b.spec : null) as Board | null;
  if (!boardPin) {
    const [pa, pb] = [a.pin as PartPin, b.pin as PartPin];
    // The resistor's B and the LED's signal belong together (the resistor sits between the board and the LED)
    if ([a, b].some((x) => x.spec.id === RESISTOR) && [a, b].some((x) => x.spec.id === "led" && x.pin.id === "SIG")) return { fit: "ok", reasonKey: "resistorOut" };
    if (partsMatch(pa, pb)) return { fit: "ok", reasonKey: "partLink" };
    const signals = [pa, pb].every((p) => !(p.accepts as string[]).some((k) => POWER_KINDS.has(k) || k === "gnd"));
    return { fit: "bad", reasonKey: signals ? "signalToPart" : "wrongKind" };
  }
  if (fresh.some((i) => i.key === "level")) return { fit: "ok", reasonKey: "levelShift" };
  if (fresh.some((i) => i.key === "budget")) return { fit: "ok", reasonKey: "budget" };
  if (board?.id === "esp32-devkit" && STRAPPING.has(boardPin.id)) return { fit: "ok", reasonKey: "delicate" };
  const kinds = boardPin.kinds as string[];
  const needs = (partPin?.accepts ?? []) as string[];
  const signal = !kinds.some((k) => POWER_KINDS.has(k) || k === "gnd");
  // A pin with a gift the part does not use (PWM, analog) when the board has plainer pins to spare
  const scarce = (k: string) => !!board && board.pins.some((p) => !(p.kinds as string[]).includes(k) && !(p.kinds as string[]).some((x) => POWER_KINDS.has(x) || x === "gnd"));
  if (signal && kinds.some((k) => (k === "pwm" || k === "analog" || k === "sda" || k === "scl") && !needs.includes(k) && scarce(k))) return { fit: "ok", reasonKey: "special" };
  return { fit: "ok", reasonKey: "fine" };
}

// --- The step-by-step guide ---
const stepGroup = (pin: PartPin) => ((pin.accepts as string[]).some((k) => POWER_KINDS.has(k)) ? 0 : (pin.accepts as string[]).includes("gnd") ? 1 : 2);

// The order to wire a part by hand: supply first, then ground, then the signals. Pins that already have
// a wire are in the list too, marked done, so the guide can show how far along the part is. A pin the
// board has nowhere to offer is left out.
export function guideSteps(design: Design, partId: string): GuideStep[] {
  const part = partOf(design, partId);
  const spec = part && componentOf(part.type);
  const board = firstBoard(design);
  if (!part || !spec || spec.kind !== "part" || !board) return [];
  const all = suggestWires(design, partId);
  const planned = new Map(all.filter((s) => s.from.part === partId).map((s) => [s.from.pin, s]));
  const order = spec.pins.map((pin, i) => ({ pin, i })).sort((x, y) => stepGroup(x.pin) - stepGroup(y.pin) || x.i - y.i);
  const steps: GuideStep[] = [];
  const wireAt = (end: PinRef) => design.wires.find((w) => sameEnd(w.from, end) || sameEnd(w.to, end));
  for (const { pin } of order) {
    const end = { part: partId, pin: pin.id };
    const wire = wireAt(end);
    if (wire) {
      const other = sameEnd(wire.from, end) ? wire.to : wire.from;
      const target = pinSpecOf(design, other);
      // An LED wired through a resistor: the resistor's own step comes first (its A to the board), then B to the LED
      if (target?.spec.id === RESISTOR) {
        const inEnd = { part: other.part, pin: other.pin === "A" ? "B" : "A" };
        const inWire = wireAt(inEnd);
        const inOther = inWire && (sameEnd(inWire.from, inEnd) ? inWire.to : inWire.from);
        const pending = suggestWires(design, other.part).find((s) => s.from.part === other.part);
        if (inOther) steps.push({ from: inEnd, to: { part: inOther.part, pin: inOther.pin }, reasonKey: "resistorIn", noteKey: null, done: true });
        else if (pending) steps.push({ ...pending, done: false });
        steps.push({ from: other, to: end, reasonKey: "resistorOut", noteKey: null, done: true });
        continue;
      }
      const reasonKey = target?.spec.kind === "board" ? reasonOf(pin, target.pin as BoardPin) : "partLink";
      steps.push({ from: end, to: { part: other.part, pin: other.pin }, reasonKey, noteKey: null, done: true });
      continue;
    }
    // The LED's resistor is two suggestions (the resistor's A to the board, its B to this pin)
    const resistorSteps = all.filter((s) => s.from.part !== partId);
    if (spec.id === "led" && pin.id === "SIG" && resistorSteps.length) {
      // A resistor already on the bench with its A wired: that step is done
      const link = resistorSteps.find((s) => s.from.pin === "B");
      const aEnd = link && partOf(design, link.from.part) ? { part: link.from.part, pin: "A" } : null;
      const aWire = aEnd && wireAt(aEnd);
      if (aEnd && aWire) {
        const other = sameEnd(aWire.from, aEnd) ? aWire.to : aWire.from;
        steps.push({ from: aEnd, to: { part: other.part, pin: other.pin }, reasonKey: "resistorIn", noteKey: null, done: true });
      }
      resistorSteps.filter((s) => !(aWire && s.from.pin === "A")).forEach((s) => steps.push({ ...s, done: false }));
      continue;
    }
    const suggestion = planned.get(pin.id);
    if (suggestion) steps.push({ ...suggestion, done: false });
  }
  return steps;
}

// The first step still to do (the index of the last step when all are done, 0 when there are none)
export function firstPending(steps: GuideStep[]): number {
  const at = steps.findIndex((s) => !s.done);
  return at >= 0 ? at : Math.max(0, steps.length - 1);
}
