// Qubi's director: turns what the chat agent and the call report into what the robot shows on the bench:
// where he walks (to the part a tool touches), what he does (pose, gesture, face) and the short line over
// his head. Pure: no React, no clock (the time arrives in the context and in `tick`), so it is tested alone.
//
// `DirectorState` is a `QubiState` plus the director's own bookkeeping, so it can be handed straight to the
// robot. The extra fields make the idle return and the bubble expiry possible without a timer in the model.

import { componentOf } from "../lab/catalog.ts";
import type { Design } from "../lab/circuit.ts";
import { partBox, pinSpot } from "../lab/layout.ts";
import type { AgentEvent, CallState, QubiGesture, QubiState, QubiTarget, QubiTask } from "./types.ts";

// The fixed lines over his head. They live in the copy module (models never import views) and arrive in
// the context; `{n}`, `{i}` and `{text}` are filled in.
export type DirectorCopy = {
  thinking: string;
  tools: Record<string, string>;
  toolDefault: string;
  toolFailed: string;
  done: string;
  doneFailed: string;
  error: string;
  planned: string;
  step: string;
  stepFailed: string;
  cancelled: string;
};

export type DirectorContext = {
  design: Design;
  now: number; // ms, from the caller's clock
  copy: DirectorCopy;
  task?: QubiTask | null; // the task running now, for the step lines
};

export type CallEvent = {
  type: "call";
  status: CallState["status"];
  speaking?: boolean;
  listening?: boolean;
};
export type TickEvent = { type: "tick"; now: number };
export type GreetEvent = { type: "greet"; text: string };
export type CancelEvent = { type: "cancel" }; // the person cancelled his task
// The bench changed: a part a tool just added may now be there to walk to
export type DesignEvent = { type: "design" };
export type DirectorEvent = AgentEvent | CallEvent | TickEvent | GreetEvent | CancelEvent | DesignEvent;

export type DirectorState = QubiState & {
  busy: boolean; // an agent turn is running: he does not go back to rest
  replied: boolean; // the last thing in this turn was his reply, so its bubble stays
  failed: boolean; // something failed in this turn
  worked: boolean; // a tool worked in this turn
  call: { on: boolean; speaking: boolean; listening: boolean };
  // A part (or the bench) he must walk to once the design shows it: a tool reports its result a moment
  // before the new design reaches the director
  pending: { part: string } | { bench: true } | null;
  lastAt: number; // time of the last event, to drop a turn that never ended
  restAt: number | null; // when he goes back to rest
  bubbleUntil: number | null; // when the bubble goes away
};

export const TIMING = {
  restMs: 3500, // idle return after a turn without a bubble
  bubbleMinMs: 4000,
  bubbleMaxMs: 9000,
  bubbleMsPerChar: 45,
  staleMs: 45000, // a turn that reports nothing for this long is over
  bubbleMaxChars: 90,
};

export function initialDirector(): DirectorState {
  return {
    activity: "idle",
    target: null,
    gesture: null,
    expression: "neutral",
    bubble: null,
    busy: false,
    replied: false,
    failed: false,
    worked: false,
    call: { on: false, speaking: false, listening: false },
    pending: null,
    lastAt: 0,
    restAt: null,
    bubbleUntil: null,
  };
}

// --- Text -------------------------------------------------------------------------------------------

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// Cuts at a word, with an ellipsis, so the bubble stays short
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.¡¿!?-]+$/, "")}…`;
}

// The first sentence of a reply, without markdown, trimmed to ~90 characters for the bubble. A very short
// first sentence ("¡Listo!") borrows the next one while it fits.
export function bubbleFromReply(text: string, max = TIMING.bubbleMaxChars): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const sentences = plain.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let line = sentences[0] ?? plain;
  if (line.length < 14 && sentences[1] && (line + " " + sentences[1]).length <= max) line += " " + sentences[1];
  return clip(line, max);
}

const bubbleMs = (bubble: string | null): number =>
  Math.min(TIMING.bubbleMaxMs, Math.max(TIMING.bubbleMinMs, (bubble?.length ?? 0) * TIMING.bubbleMsPerChar));

// A random line of a list, from a number in [0, 1)
export function pickLine<T>(list: readonly T[], random: number): T | null {
  return list.length ? list[Math.min(list.length - 1, Math.floor(random * list.length))] : null;
}

// --- Where he walks ---------------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

function partTarget(design: Design, id: unknown): QubiTarget | null {
  const part = typeof id === "string" ? design.parts.find((p) => p.id === id) : undefined;
  if (!part) return null;
  const box = partBox(part);
  return { x: box.x, z: box.z, part: part.id };
}

// "hc-sr04-1.TRIG" (or { part, pin }) -> where that pin is on the bench, else the part itself
function pinTarget(design: Design, ref: unknown): QubiTarget | null {
  let partId: string | undefined;
  let pinId: string | undefined;
  if (typeof ref === "string") {
    const dot = ref.indexOf(".");
    partId = dot < 0 ? ref : ref.slice(0, dot);
    pinId = dot < 0 ? undefined : ref.slice(dot + 1);
  } else {
    const r = asRecord(ref);
    partId = typeof r.part === "string" ? r.part : undefined;
    pinId = typeof r.pin === "string" ? r.pin : undefined;
  }
  const part = design.parts.find((p) => p.id === partId);
  if (!part) return null;
  const spot = pinId ? pinSpot(part, pinId) : null;
  return spot ? { x: spot.x, z: spot.z, part: part.id } : partTarget(design, part.id);
}

// The board he builds around (or the first part), where whole-bench jobs take him
function benchTarget(design: Design): QubiTarget {
  const board = design.parts.find((p) => componentOf(p.type)?.kind === "board") ?? design.parts[0];
  return (board && partTarget(design, board.id)) ?? { x: 0, z: 0 };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Where a tool takes him when it starts. null: he stays where he is.
export function toolStartTarget(name: string, raw: unknown, design: Design): QubiTarget | null {
  const args = asRecord(raw);
  switch (name) {
    case "lab_add_part": {
      const [x, z] = [num(args.x), num(args.z)];
      return x !== null && z !== null ? { x, z } : (partTarget(design, args.near) ?? benchTarget(design));
    }
    case "lab_connect":
      return pinTarget(design, args.from);
    case "lab_auto_wire":
      return args.part === "all" ? benchTarget(design) : (partTarget(design, args.part) ?? benchTarget(design));
    case "lab_move":
    case "lab_rotate":
    case "lab_focus":
      return partTarget(design, args.part);
    case "lab_remove": {
      if (args.part) return partTarget(design, args.part);
      const wire = design.wires.find((w) => w.id === args.wire);
      return wire ? pinTarget(design, wire.from) : null;
    }
    case "lab_load_example":
    case "lab_clear":
    case "lab_simulate":
    case "lab_make_enclosure":
    case "lab_make_sketch":
      return benchTarget(design);
    default:
      return null; // lab_catalog, lab_view, lab_plan, lab_step: he only thinks
  }
}

// Where he is once a tool finished, when the result moved things (a new part, a moved part, a loaded
// example); `pending` when the design does not show the result yet
function toolEndTarget(
  name: string,
  raw: unknown,
  part: string | undefined,
  design: Design,
): { target: QubiTarget | null; pending: DirectorState["pending"] } {
  const args = asRecord(raw);
  const [x, z] = [num(args.x), num(args.z)];
  switch (name) {
    case "lab_add_part": {
      const found = partTarget(design, part);
      if (found) return { target: found, pending: null };
      const guess = x !== null && z !== null ? { x, z, ...(part ? { part } : {}) } : null;
      return { target: guess, pending: part ? { part } : null };
    }
    case "lab_move": {
      if (x !== null && z !== null && typeof args.part === "string") return { target: { x, z, part: args.part }, pending: null };
      return { target: partTarget(design, args.part), pending: null };
    }
    case "lab_load_example":
      return { target: benchTarget(design), pending: { bench: true } };
    default:
      return { target: part ? partTarget(design, part) : null, pending: null };
  }
}

const QUIET_TOOLS: ReadonlySet<string> = new Set(["lab_catalog", "lab_view", "lab_plan", "lab_step"]);

function toolGesture(name: string): QubiGesture {
  if (name === "lab_focus") return "point";
  return QUIET_TOOLS.has(name) ? "think" : "work";
}

// --- The reducer ------------------------------------------------------------------------------------

// What he does when nothing else is going on: follow the call, else stand still
function restActivity(call: DirectorState["call"]): QubiState["activity"] {
  if (!call.on) return "idle";
  return call.speaking ? "talking" : call.listening ? "listening" : "idle";
}

// He keeps `text` over his head for a while, then returns to rest
function say(state: DirectorState, text: string | null, now: number): DirectorState {
  const until = text ? now + bubbleMs(text) : null;
  return { ...state, bubble: text, bubbleUntil: until, restAt: until ?? now + TIMING.restMs };
}

const gesture = (name: QubiGesture, now: number): QubiState["gesture"] => ({ name, at: now });

// He is mid-job: no timer may take the bubble or the pose away
const working = (state: DirectorState, now: number): DirectorState => ({
  ...state,
  busy: true,
  lastAt: now,
  restAt: null,
  bubbleUntil: null,
});

export function directorReducer(state: DirectorState, event: DirectorEvent, ctx: DirectorContext): DirectorState {
  const now = event.type === "tick" ? event.now : ctx.now;
  const { copy } = ctx;

  switch (event.type) {
    case "thinking": {
      // A new turn clears the last one's outcome; later thoughts in the same turn keep it
      const fresh = state.busy ? state : { ...state, failed: false, worked: false };
      const again = state.busy && state.activity === "thinking";
      return {
        ...working(fresh, now),
        activity: "thinking",
        expression: "focused",
        gesture: again ? state.gesture : gesture("think", now),
        bubble: copy.thinking,
        replied: false,
      };
    }

    case "toolStart": {
      const target = toolStartTarget(event.name, event.input, ctx.design);
      const quiet = QUIET_TOOLS.has(event.name);
      return {
        ...working(state.busy ? state : { ...state, failed: false, worked: false }, now),
        activity: quiet ? "thinking" : "working",
        target: target ?? state.target,
        pending: null,
        gesture: gesture(toolGesture(event.name), now),
        expression: "focused",
        bubble: copy.tools[event.name] ?? copy.toolDefault,
        replied: false,
      };
    }

    case "toolEnd": {
      const end = event.ok ? toolEndTarget(event.name, event.input, event.part, ctx.design) : null;
      return {
        ...working(state, now),
        target: end?.target ?? state.target,
        pending: end?.pending ?? null,
        failed: state.failed || !event.ok,
        worked: state.worked || (event.ok && !QUIET_TOOLS.has(event.name)),
        expression: event.ok ? "focused" : "worried",
        bubble: event.ok ? state.bubble : copy.toolFailed,
      };
    }

    case "reply": {
      const line = bubbleFromReply(event.text);
      if (!line) return state;
      return {
        ...say(state, line, now),
        busy: state.busy,
        lastAt: now,
        activity: "talking",
        expression: state.failed ? "worried" : "happy",
        replied: true,
      };
    }

    case "plan": {
      const n = event.steps.filter((s) => s.trim()).length;
      return {
        ...working(state, now),
        activity: "thinking",
        gesture: gesture("nod", now),
        expression: "focused",
        bubble: fillTemplate(copy.planned, { n }),
      };
    }

    case "step": {
      const index = event.index;
      const text = ctx.task?.steps[index]?.text;
      const n = ctx.task?.steps.length ?? 0;
      if (event.state === "doing") {
        return {
          ...working(state, now),
          activity: "working",
          expression: "focused",
          bubble: text ? clip(fillTemplate(copy.step, { i: index + 1, n, text }), TIMING.bubbleMaxChars) : state.bubble,
          replied: false,
        };
      }
      if (event.state === "failed") {
        return {
          ...working(state, now),
          failed: true,
          expression: "worried",
          bubble: fillTemplate(copy.stepFailed, { i: index + 1, n }),
        };
      }
      if (event.state === "done") return { ...working(state, now), worked: true, gesture: gesture("nod", now) };
      return { ...working(state, now) };
    }

    case "done": {
      const bad = state.failed;
      const celebrates = state.worked && !bad;
      const base: DirectorState = {
        ...state,
        busy: false,
        lastAt: now,
        gesture: bad ? gesture("shrug", now) : celebrates ? gesture("celebrate", now) : state.gesture,
        expression: bad ? "worried" : "happy",
        activity: state.replied ? "talking" : restActivity(state.call),
        replied: false,
        pending: null,
      };
      // His reply, when there was one, stays up; otherwise a short closing line (only after real work)
      if (state.replied && state.bubble) return say(base, state.bubble, now);
      if (state.worked || bad) return say(base, bad ? copy.doneFailed : copy.done, now);
      return say({ ...base, bubble: null }, null, now);
    }

    case "error":
      return {
        ...say({ ...state, busy: false, lastAt: now, failed: true, replied: false }, copy.error, now),
        activity: restActivity(state.call),
        expression: "worried",
        gesture: gesture("shrug", now),
      };

    case "cancel":
      return {
        ...say({ ...state, busy: false, lastAt: now, replied: false }, copy.cancelled, now),
        activity: restActivity(state.call),
        expression: "neutral",
      };

    case "greet":
      if (state.busy) return state;
      return {
        ...say(state, event.text, now),
        lastAt: now,
        activity: "talking",
        gesture: gesture("wave", now),
        expression: "happy",
      };

    case "call": {
      const on = event.status === "on";
      const call = { on, speaking: on && !!event.speaking, listening: on && !!event.listening };
      const next: DirectorState = { ...state, call, lastAt: now };
      // Talking shows even while he works; listening only when he is free
      if (call.speaking) return { ...next, activity: "talking", expression: "happy" };
      if (state.busy) return next;
      return { ...next, activity: restActivity(call), expression: on ? state.expression : "neutral" };
    }

    case "design": {
      if (!state.pending) return state;
      const target = "part" in state.pending ? partTarget(ctx.design, state.pending.part) : benchTarget(ctx.design);
      return target ? { ...state, target, pending: null } : state;
    }

    case "tick": {
      // A turn that never reported its end (the connection dropped) must not freeze him
      const stale = state.busy && now - state.lastAt > TIMING.staleMs;
      if (state.busy && !stale) return state;
      return expire(stale ? { ...state, busy: false, replied: false, bubbleUntil: now, restAt: now } : state, now);
    }
  }
}

// Takes the bubble away and sends him back to rest when their time is up; the same object when not
function expire(state: DirectorState, now: number): DirectorState {
  let next = state;
  if (next.bubbleUntil !== null && now >= next.bubbleUntil) next = { ...next, bubble: null, bubbleUntil: null };
  if (next.restAt !== null && now >= next.restAt) {
    next = { ...next, restAt: null, activity: restActivity(next.call), expression: "neutral" };
  }
  return next;
}

// When the next `tick` is worth sending, or null when nothing is pending
export function nextDeadline(state: DirectorState): number | null {
  if (state.busy) return state.lastAt + TIMING.staleMs + 1;
  const times = [state.bubbleUntil, state.restAt].filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}
