// The bench's state machine: what is on it, what is selected or being wired, the checker's verdict,
// the simulation clock and whether the enclosure is shown. A pure reducer: no React, no storage, no
// clock. The view model feeds it actions; persistence, the frame loop and the engines (simulate,
// enclosureFor, ...) live outside. Notices are codes, never text: the view model translates them.

import { componentOf } from "./catalog.ts";
import {
  addPart,
  autoWire,
  checkDesign,
  connect,
  disconnect,
  emptyDesign,
  movePart,
  removePart,
  rotatePart,
  RESISTOR,
  type Check,
  type Design,
  type PinRef,
} from "./circuit.ts";
import { firstPending, guideSteps } from "./guide.ts";
import { freeSpot } from "./layout.ts";

export type NoticeKind = "ok" | "warn" | "error";
export type NoticeCode =
  | "wiring" // first pin picked: args { part, pin }
  | "connectRefused" // args { reason: ConnectRefusal }
  | "noBoardForWire"
  | "autoWired" // args { added }
  | "autoWireMissing" // args { missing: PinRef[] }
  | "simBlocked"
  | "enclosureNoBoard"
  | "loadFailed" // args { dropped }
  | "saveFailed"
  | "exportSaved" // args { file }
  | "exportFailed"
  | "notReady"
  | "sketchNoBoard"
  | "importFailed"
  | "guideDone" // the guide wired every pin of its part
  | "guideNoSteps"; // nothing left to wire on that part (or no board)
export type NoticeArg = string | number | PinRef[];
export type Notice = { kind: NoticeKind; code: NoticeCode; args: Record<string, NoticeArg> };

export type GuideState = { part: string; step: number }; // step: index into guideSteps(design, part)

export type BenchState = {
  design: Design;
  check: Check;
  selected: string | null;
  wiring: PinRef | null; // first pin picked, waiting for the second
  hover: PinRef | null; // the pin under the cursor
  guide: GuideState | null; // the step-by-step wiring guide of one part
  query: string; // catalog search
  notice: Notice | null;
  sim: { running: boolean; t: number }; // t in ms since the simulation started
  enclosure: { visible: boolean; exploded: boolean };
};

export type BenchAction =
  | { type: "add"; part: string; at?: { x: number; z: number } }
  | { type: "move"; id: string; x: number; z: number }
  | { type: "moveEnd" }
  | { type: "rotate"; id?: string }
  | { type: "remove"; id?: string }
  | { type: "select"; id: string | null }
  | { type: "pickPin"; part: string; pin: string }
  | { type: "hoverPin"; part?: string | null; pin?: string | null }
  | { type: "cancelWire" }
  | { type: "autoWire"; id?: string | null }
  | { type: "startGuide"; part: string }
  | { type: "nextGuide" }
  | { type: "prevGuide" }
  | { type: "goGuide"; step: number }
  | { type: "endGuide" }
  | { type: "guideDo" } // wire the guide's current step for the person
  | { type: "acceptSuggestions"; part?: string | null }
  | { type: "removeWire"; id: string }
  | { type: "setQuery"; query: string }
  | { type: "escape" }
  | { type: "toggleSim" }
  | { type: "tick"; dt: number }
  | { type: "toggleEnclosure" }
  | { type: "toggleExplode" }
  | { type: "load"; design: Design; dropped?: number }
  | { type: "notify"; notice: Notice }
  | { type: "clearNotice" };

const IDLE_SIM = { running: false, t: 0 } as const;
const HIDDEN_ENCLOSURE = { visible: false, exploded: false } as const;

export const notice = (kind: NoticeKind, code: NoticeCode, args: Record<string, NoticeArg> = {}): Notice => ({ kind, code, args });

export function initBench(design: Design = emptyDesign()): BenchState {
  return {
    design,
    check: checkDesign(design),
    selected: null,
    wiring: null,
    hover: null,
    guide: null,
    query: "",
    notice: null,
    sim: { ...IDLE_SIM },
    enclosure: { ...HIDDEN_ENCLOSURE },
  };
}

const hasPart = (design: Design, id: string | null | undefined): id is string => !!id && design.parts.some((p) => p.id === id);
const kindOf = (design: Design, id: string) => componentOf(design.parts.find((p) => p.id === id)?.type)?.kind;
export const hasBoard = (design: Design) => design.parts.some((p) => componentOf(p.type)?.kind === "board");

// Applies a new design: re-checks it, keeps selection, wiring and hover only while their parts exist, and
// drops what can no longer stand (a simulation with a red circuit, an enclosure with no board)
function commit(state: BenchState, design: Design, selected: string | null = state.selected): BenchState {
  const check = checkDesign(design);
  const next: BenchState = {
    ...state,
    design,
    check,
    selected: hasPart(design, selected) ? selected : null,
    wiring: state.wiring && hasPart(design, state.wiring.part) ? state.wiring : null,
    hover: state.hover && hasPart(design, state.hover.part) ? state.hover : null,
  };
  next.guide = keepGuide(next, state.guide);
  if (state.guide && !next.guide && hasPart(design, state.guide.part)) {
    const steps = guideSteps(design, state.guide.part);
    if (steps.length && steps.every((s) => s.done)) next.notice = notice("ok", "guideDone");
  }
  if (next.sim.running && check.level === "red") {
    next.sim = { ...IDLE_SIM };
    next.notice = notice("error", "simBlocked");
  }
  if (next.enclosure.visible && !hasBoard(design)) next.enclosure = { ...HIDDEN_ENCLOSURE };
  return next;
}

// The guide follows its part: it ends when the part goes, and moves on by itself to the next step still to do
// once the person has wired the current one
function keepGuide(state: BenchState, guide: GuideState | null): GuideState | null {
  if (!guide || !hasPart(state.design, guide.part)) return null;
  const steps = guideSteps(state.design, guide.part);
  if (!steps.some((s) => !s.done)) return null;
  const at = Math.min(guide.step, steps.length - 1);
  if (!steps[at].done) return at === guide.step ? guide : { ...guide, step: at };
  const after = steps.findIndex((s, i) => i > at && !s.done);
  return { ...guide, step: after >= 0 ? after : firstPending(steps) };
}

function startGuide(state: BenchState, part: string): BenchState {
  if (!hasPart(state.design, part) || kindOf(state.design, part) !== "part") return state;
  const steps = guideSteps(state.design, part);
  if (!steps.length || steps.every((s) => s.done)) return { ...state, guide: null, notice: notice("warn", "guideNoSteps") };
  return { ...state, guide: { part, step: firstPending(steps) }, wiring: null, notice: null, selected: part };
}

function moveGuide(state: BenchState, to: (at: number, count: number) => number): BenchState {
  const { guide } = state;
  if (!guide) return state;
  const count = guideSteps(state.design, guide.part).length;
  if (!count) return { ...state, guide: null };
  const step = Math.max(0, to(guide.step, count));
  // Past the last step the guide is over
  if (step >= count) return { ...state, guide: null, wiring: null, notice: notice("ok", "guideDone") };
  return step === guide.step ? state : { ...state, guide: { ...guide, step }, wiring: null };
}

// Wires the guide's current step, as if the person had clicked both pins
function guideDo(state: BenchState): BenchState {
  const { guide, design } = state;
  if (!guide) return state;
  const step = guideSteps(design, guide.part)[guide.step];
  if (!step || step.done) return state;
  // The LED's resistor may not be on the bench yet: it goes next to the LED first
  let base = design;
  if (!design.parts.some((p) => p.id === step.from.part)) {
    const led = design.parts.find((p) => p.id === guide.part);
    const placed = led ? addPart(design, RESISTOR, freeSpot(design, RESISTOR, led.x, led.z)) : null;
    if (!placed?.id || placed.id !== step.from.part) return { ...state, notice: notice("warn", "connectRefused", { reason: "unknown" }) };
    base = placed.design;
  }
  const result = connect(base, step.from, step.to);
  if (!result.ok) return { ...state, notice: notice("warn", "connectRefused", { reason: result.reason ?? "unknown" }) };
  return commit({ ...state, wiring: null, notice: null }, result.design);
}

// "Accept the suggestions" is "Conectar solo": suggestWires only predicts what autoWire does (the LED's
// resistor included, which is a new part), so the wires and the parts come from autoWire itself
function acceptSuggestions(state: BenchState, id: string | null): BenchState {
  return wireAll(state, id);
}

function pickPin(state: BenchState, part: string, pin: string): BenchState {
  const { design, wiring } = state;
  const target = design.parts.find((p) => p.id === part);
  if (!target || !componentOf(target.type)?.pins.some((p) => p.id === pin)) return state;
  // The same pin again cancels
  if (wiring && wiring.part === part && wiring.pin === pin) return { ...state, wiring: null, notice: null };
  // First pick, or another pin of the same part: (re)start from here
  if (!wiring || wiring.part === part) return { ...state, wiring: { part, pin }, notice: notice("ok", "wiring", { part, pin }) };
  const result = connect(design, wiring, { part, pin });
  if (!result.ok) {
    return { ...state, wiring: null, notice: notice("warn", "connectRefused", { reason: result.reason ?? "unknown" }) };
  }
  return commit({ ...state, wiring: null, notice: null }, result.design);
}

// Wires the given part to the board, or every part when none is given (a board id wires all to it)
function wireAll(state: BenchState, id: string | null): BenchState {
  const { design } = state;
  if (!hasBoard(design)) return { ...state, notice: notice("warn", "noBoardForWire") };
  if (id && !hasPart(design, id)) return state;
  const boardId = id && kindOf(design, id) === "board" ? id : null;
  const targets = id && !boardId ? design.parts.filter((p) => p.id === id) : design.parts.filter((p) => componentOf(p.type)?.kind === "part");
  let next = design;
  let added = 0;
  const missing: PinRef[] = [];
  for (const part of targets) {
    const result = autoWire(next, part.id, boardId);
    next = result.design;
    added += result.added.length;
    missing.push(...result.missing.map((pin) => ({ part: part.id, pin })));
  }
  const done = next !== design ? commit(state, next) : state;
  return { ...done, notice: missing.length ? notice("warn", "autoWireMissing", { missing }) : notice("ok", "autoWired", { added }) };
}

export function benchReducer(state: BenchState, action: BenchAction): BenchState {
  const { design } = state;
  switch (action.type) {
    case "add": {
      const spot = freeSpot(design, action.part, action.at?.x, action.at?.z);
      const result = addPart(design, action.part, spot);
      return result.id ? commit(state, result.design, result.id) : state;
    }
    // Live while dragging: the checker does not depend on positions, so it is not run again
    case "move":
      return hasPart(design, action.id) ? { ...state, design: movePart(design, action.id, action) } : state;
    case "moveEnd":
      return state; // the view model saves at once; nothing changes here
    case "rotate": {
      const id = action.id ?? state.selected;
      return hasPart(design, id) ? commit(state, rotatePart(design, id)) : state;
    }
    case "remove": {
      const id = action.id ?? state.selected;
      return hasPart(design, id) ? commit(state, removePart(design, id)) : state;
    }
    case "select": {
      const selected = hasPart(design, action.id) ? action.id : null;
      return selected === state.selected ? state : { ...state, selected };
    }
    case "pickPin":
      return pickPin(state, action.part, action.pin);
    case "hoverPin": {
      const next = action.part && action.pin ? { part: action.part, pin: action.pin } : null;
      if (state.hover?.part === next?.part && state.hover?.pin === next?.pin) return state;
      return { ...state, hover: next };
    }
    case "cancelWire":
      return state.wiring ? { ...state, wiring: null, notice: null } : state;
    case "autoWire":
      return wireAll(state, action.id ?? null);
    case "startGuide":
      return startGuide(state, action.part);
    case "nextGuide":
      return moveGuide(state, (at) => at + 1);
    case "prevGuide":
      return moveGuide(state, (at) => at - 1);
    case "goGuide":
      return moveGuide(state, (_, count) => Math.min(count - 1, Math.floor(Number(action.step) || 0)));
    case "endGuide":
      return state.guide ? { ...state, guide: null, wiring: null } : state;
    case "guideDo":
      return guideDo(state);
    case "acceptSuggestions":
      return acceptSuggestions(state, action.part ?? null);
    case "removeWire":
      return design.wires.some((w) => w.id === action.id) ? commit(state, disconnect(design, action.id)) : state;
    case "setQuery":
      return { ...state, query: String(action.query ?? "") };
    // Esc: cancel the wire in progress, else deselect, else stop the simulation
    case "escape":
      if (state.wiring) return { ...state, wiring: null, notice: null };
      if (state.guide) return { ...state, guide: null };
      if (state.selected) return { ...state, selected: null };
      if (state.sim.running) return { ...state, sim: { ...IDLE_SIM } };
      return state;
    case "toggleSim":
      if (state.sim.running) return { ...state, sim: { ...IDLE_SIM } };
      if (state.check.level === "red") return { ...state, notice: notice("error", "simBlocked") };
      return { ...state, sim: { running: true, t: 0 }, notice: null };
    // The frame loop calls this every frame while the simulation runs (dt in ms)
    case "tick":
      if (!state.sim.running || !(action.dt > 0)) return state;
      return { ...state, sim: { running: true, t: state.sim.t + action.dt } };
    case "toggleEnclosure":
      if (state.enclosure.visible) return { ...state, enclosure: { ...HIDDEN_ENCLOSURE } };
      if (!hasBoard(design)) return { ...state, notice: notice("warn", "enclosureNoBoard") };
      return { ...state, enclosure: { visible: true, exploded: false } };
    case "toggleExplode":
      return state.enclosure.visible ? { ...state, enclosure: { ...state.enclosure, exploded: !state.enclosure.exploded } } : state;
    // A whole design from storage, a file or the agent. Parts that no longer exist lose their selection.
    case "load": {
      const loaded = commit({ ...state, notice: null }, action.design);
      return action.dropped ? { ...loaded, notice: notice("warn", "loadFailed", { dropped: action.dropped }) } : loaded;
    }
    case "notify":
      return { ...state, notice: action.notice };
    case "clearNotice":
      return state.notice ? { ...state, notice: null } : state;
  }
}
