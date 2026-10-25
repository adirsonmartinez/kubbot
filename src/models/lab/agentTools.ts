// The chat agent's lab tools. Pure and deterministic: the route sends the schemas to the model and the
// browser runs applyAgentTool on its own design, so the model can only act through the same functions
// the UI uses (addPart, connect, autoWire, removePart) and can never write an invalid design. After every
// change the tool reports what the deterministic checker says; the agent must tell the truth about it.
//
// Tool text here is for the model (English). Anything the person reads comes from labCopy, built by the
// view model from `action` (what was done) or `error`/`key` codes. Part names in Spanish reach the model
// through the route's system prompt, so this module needs no copy and no view imports.
//
// Bad input never throws: every tool answers { ok: false, error, ... } with a hint on how to fix the call.

import { CATEGORIES, COMPONENTS, componentOf, type Board, type BoardPin, type Component, type PartPin } from "./catalog.ts";
import {
  addPart,
  autoWire,
  checkDesign,
  connect,
  describeDesign,
  removePart,
  disconnect,
  type Check,
  type ConnectRefusal,
  type Design,
  type IssueKey,
  type PinRef,
} from "./circuit.ts";
import { freeSpot, partBox } from "./layout.ts";

// --- Wire format shared by the chat client and the route (plain data, JSON-safe) ---

export type AgentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  // Opaque blocks the model needs back unchanged on the next turn
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };
export type AgentMessage = { role: "user" | "assistant"; content: string | AgentBlock[] };
export type AgentToolCall = { id: string; name: string; input: unknown };
export type AgentStop = "end" | "tool_use" | "max_tokens" | "refusal";
export type AgentRequest = { messages: AgentMessage[]; design: unknown };
export type AgentReply = {
  text: string;
  toolCalls: AgentToolCall[];
  stop: AgentStop;
  // The assistant turn exactly as the model produced it; the client sends it back with the tool results
  content: AgentBlock[];
};

// --- What a tool did, in data the view model turns into a short card ---

export type AgentAction =
  | { kind: "add"; part: string; type: string }
  | { kind: "connect"; wire: string; from: PinRef; to: PinRef }
  | { kind: "autoWire"; wires: number; missing: string[] }
  | { kind: "remove"; part?: string; wire?: string }
  | { kind: "simulate" }
  | { kind: "enclosure" }
  | { kind: "sketch" };

export type AgentToolResult = { ok: boolean } & Record<string, unknown>;
export type AgentOutcome = { design: Design; result: AgentToolResult; action?: AgentAction };

// Optional pure providers the lab view model can pass to add data to the three "make" tools
// (simulation snapshot, enclosure size, sketch code). They run only after the tool's own gates pass.
export type AgentDetails = Partial<Record<"lab_simulate" | "lab_make_enclosure" | "lab_make_sketch", (design: Design) => Record<string, unknown>>>;

// --- Schemas ---

type Schema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};
export type AgentToolSchema = { name: string; description: string; input_schema: Schema };

const REF = {
  type: "string",
  description: 'A pin written as "partId.pinId", for example "hc-sr04-1.TRIG" or "arduino-uno-1.D7".',
} as const;
const NONE: Schema = { type: "object", properties: {}, additionalProperties: false };

export const AGENT_TOOLS: AgentToolSchema[] = [
  {
    name: "lab_catalog",
    description:
      "List the parts the lab has: id, kind (board or part), category, size, voltage, current draw and pins. Boards list which signals each pin offers; parts list which kinds of board pin each of their pins accepts. Only these ids can be placed.",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", enum: [...CATEGORIES], description: "Only this section. Omit for everything." } },
      additionalProperties: false,
    },
  },
  {
    name: "lab_view",
    description:
      "Read the bench: every placed part with its id and position, every wire, and the electrical check (level green, yellow or red, plus each issue). Call it before changing things you are unsure about.",
    input_schema: NONE,
  },
  {
    name: "lab_add_part",
    description:
      "Place a part on the bench. Returns its new id, which later calls need. It lands in a free spot near the board unless you give `near` (a placed part id) or x and z (bench units, 1 = 10 mm). Unknown types are refused.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", description: "A catalog id, for example arduino-uno or hc-sr04." },
        near: { type: "string", description: "Id of a placed part to put the new one next to." },
        x: { type: "number" },
        z: { type: "number" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "lab_connect",
    description:
      "Draw one wire between two pins. The wire is always drawn if both pins exist; the result then lists the checker's verdict. If the checker reports red issues, the wiring is NOT fine: say so, and fix or remove the wire.",
    input_schema: { type: "object", properties: { from: REF, to: REF }, required: ["from", "to"], additionalProperties: false },
  },
  {
    name: "lab_auto_wire",
    description:
      'Wire every unwired pin of one part to the board by the lab\'s own rules (power by voltage, ground and the I2C bus shared, signals on free pins). Use part "all" to do every part that is not a board. Prefer this over many lab_connect calls.',
    input_schema: {
      type: "object",
      properties: { part: { type: "string", description: 'A placed part id, or "all".' } },
      required: ["part"],
      additionalProperties: false,
    },
  },
  {
    name: "lab_remove",
    description: "Remove a placed part (and its wires) or a single wire. Give exactly one of `part` or `wire`.",
    input_schema: {
      type: "object",
      properties: { part: { type: "string", description: "Placed part id." }, wire: { type: "string", description: "Wire id, for example w3." } },
      additionalProperties: false,
    },
  },
  {
    name: "lab_simulate",
    description: "Start the live simulation of the bench so the person sees the circuit work. Refused while the checker shows red or there is no board.",
    input_schema: NONE,
  },
  {
    name: "lab_make_enclosure",
    description: "Generate a 3D-printable enclosure for the board and its parts, shown on the bench. Needs a board.",
    input_schema: NONE,
  },
  {
    name: "lab_make_sketch",
    description: "Generate the Arduino sketch (.ino) for what is wired. Needs a board. Parts the checker flags are left out of the code.",
    input_schema: NONE,
  },
];

export const AGENT_TOOL_NAMES: string[] = AGENT_TOOLS.map((t) => t.name);

// --- What each checker issue means, for the model (the person reads labCopy.check instead) ---

const MEANING: Record<IssueKey, string> = {
  short: "Power and ground are joined: a short circuit that can burn the board.",
  mixedPower: "5 V and 3.3 V are joined on one net.",
  overvoltage: "A 3.3 V part is wired to 5 V and can burn.",
  undervoltage: "A part that needs 5 V gets 3.3 V and may not work.",
  missing: "A required pin is not wired.",
  wrongPin: "That pin is wired to a board pin that cannot do that job.",
  pinShared: "Two parts share one board signal pin.",
  level: "A 5 V signal goes into a 3.3 V board; a voltage divider is needed (the lab does not model one).",
  budget: "The parts draw more current on 5 V than the board can supply; an external supply is needed.",
  noBoard: "There is no board to control the parts.",
};

const REFUSAL_MEANING: Record<ConnectRefusal, string> = {
  unknown: "One of the pins does not exist.",
  same: "Both ends are the same pin.",
  duplicate: "These two pins are already wired together.",
  full: "The bench has the maximum number of wires.",
};

// --- Small helpers ---

const MAX_ISSUES = 20;

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// "partId.pinId" (or { part, pin }) to a pin reference. Part ids never contain a dot; pin ids neither.
export function parsePinRef(value: unknown): PinRef | null {
  if (typeof value === "string") {
    const s = value.trim();
    const cut = s.lastIndexOf(".");
    return cut > 0 && cut < s.length - 1 ? { part: s.slice(0, cut).trim(), pin: s.slice(cut + 1).trim() } : null;
  }
  const o = record(value);
  return text(o.part) && text(o.pin) ? { part: text(o.part), pin: text(o.pin) } : null;
}

export function checkSummary(check: Check) {
  return {
    level: check.level,
    issues: check.issues.slice(0, MAX_ISSUES).map((i) => ({ ...i, meaning: MEANING[i.key] })),
    moreIssues: Math.max(0, check.issues.length - MAX_ISSUES),
    budget: check.budget,
  };
}

// The honest line the agent must not contradict
function verdict(check: Check): string {
  if (check.level === "red") return "RED: dangerous wiring. Do not call it fine; tell the person and fix it.";
  if (check.level === "yellow") return "YELLOW: something needs a look. Report it.";
  return "GREEN: the checker finds no problems (it does not model series resistors, flyback diodes or motor supplies).";
}

function pinsOf(spec: Component): string[] {
  return (spec.pins as (BoardPin | PartPin)[]).map((p) => p.id);
}

// A board's pins grouped by what they offer, so a 26-pin board is a short list
function boardPinGroups(board: Board): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const pin of board.pins) for (const k of pin.kinds) (groups[k] ??= []).push(pin.id);
  return groups;
}

function describeComponent(c: Component) {
  const base = {
    id: c.id,
    kind: c.kind,
    category: c.category,
    sizeMm: c.size,
  };
  if (c.kind === "board") {
    return { ...base, logicVolts: c.logic, budgetMa: c.budgetMa, pinsBySignal: boardPinGroups(c) };
  }
  return {
    ...base,
    volts: c.volts,
    supplyVolts: c.supplies,
    mA: c.mA,
    sends5vOnSignal: c.out5v || undefined,
    bus: c.bus,
    pins: c.pins.map((p) => ({ id: p.id, accepts: p.accepts, required: p.required || undefined })),
  };
}

// --- The tools ---

function view(design: Design): AgentOutcome {
  const check = checkDesign(design);
  return {
    design,
    result: {
      ok: true,
      description: describeDesign(design),
      parts: design.parts,
      wires: design.wires,
      check: checkSummary(check),
      verdict: verdict(check),
    },
  };
}

function catalog(design: Design, input: Record<string, unknown>): AgentOutcome {
  const category = text(input.category);
  if (category && !(CATEGORIES as readonly string[]).includes(category)) {
    return { design, result: { ok: false, error: "unknown_category", categories: [...CATEGORIES] } };
  }
  const parts = COMPONENTS.filter((c) => !category || c.category === category).map(describeComponent);
  return { design, result: { ok: true, parts } };
}

// Where a new part lands: next to `near`, else behind the first board, else at the origin
function placement(design: Design, type: string, input: Record<string, unknown>): { x: number; z: number } {
  const x = num(input.x);
  const z = num(input.z);
  if (x !== undefined && z !== undefined) return freeSpot(design, type, x, z);
  const nearPart = design.parts.find((p) => p.id === text(input.near));
  if (nearPart) return freeSpot(design, type, nearPart.x, nearPart.z);
  const board = design.parts.find((p) => componentOf(p.type)?.kind === "board");
  if (!board || componentOf(type)?.kind === "board") return freeSpot(design, type, 0, board ? board.z + 8 : 0);
  const gap = partBox(board).d / 2 + partBox({ type, x: 0, z: 0, rot: 0 }).d / 2 + 1.5;
  return freeSpot(design, type, board.x, board.z - gap);
}

function addTool(design: Design, input: Record<string, unknown>): AgentOutcome {
  const type = text(input.type);
  if (!componentOf(type)) {
    return { design, result: { ok: false, error: "unknown_part_type", given: type, hint: "Use an id from lab_catalog.", validTypes: COMPONENTS.map((c) => c.id) } };
  }
  const near = text(input.near);
  if (near && !design.parts.some((p) => p.id === near)) {
    return { design, result: { ok: false, error: "unknown_near", given: near, parts: design.parts.map((p) => p.id) } };
  }
  const at = placement(design, type, input);
  const rot = Math.round(num(input.rot) ?? 0);
  const added = addPart(design, type, { ...at, rot });
  if (!added.id) return { design, result: { ok: false, error: "bench_full", hint: "Remove something first." } };
  const check = checkDesign(added.design);
  return {
    design: added.design,
    result: { ok: true, id: added.id, type, at, check: checkSummary(check) },
    action: { kind: "add", part: added.id, type },
  };
}

// Says which end is wrong and what would be right, so the model can retry in one step
function explainUnknownPin(design: Design, ref: PinRef | null, given: unknown): AgentToolResult {
  if (!ref) return { ok: false, error: "bad_pin_ref", given, hint: 'Write pins as "partId.pinId".' };
  const part = design.parts.find((p) => p.id === ref.part);
  if (!part) return { ok: false, error: "unknown_part", given: ref.part, parts: design.parts.map((p) => p.id) };
  const spec = componentOf(part.type);
  return { ok: false, error: "unknown_pin", part: ref.part, given: ref.pin, pins: spec ? pinsOf(spec) : [] };
}

function connectTool(design: Design, input: Record<string, unknown>): AgentOutcome {
  const from = parsePinRef(input.from);
  const to = parsePinRef(input.to);
  const valid = (r: PinRef | null) => !!r && pinsOfPart(design, r.part).includes(r.pin);
  if (!valid(from)) return { design, result: explainUnknownPin(design, from, input.from) };
  if (!valid(to)) return { design, result: explainUnknownPin(design, to, input.to) };
  const done = connect(design, from!, to!);
  if (!done.ok) {
    const reason = done.reason ?? "unknown";
    return { design, result: { ok: false, error: reason, meaning: REFUSAL_MEANING[reason] } };
  }
  const check = checkDesign(done.design);
  return {
    design: done.design,
    result: { ok: true, wire: done.id, from, to, check: checkSummary(check), verdict: verdict(check) },
    action: { kind: "connect", wire: done.id ?? "", from: from!, to: to! },
  };
}

function pinsOfPart(design: Design, partId: string): string[] {
  const spec = componentOf(design.parts.find((p) => p.id === partId)?.type);
  return spec ? pinsOf(spec) : [];
}

function autoWireTool(design: Design, input: Record<string, unknown>): AgentOutcome {
  const target = text(input.part);
  if (!design.parts.some((p) => componentOf(p.type)?.kind === "board")) {
    return { design, result: { ok: false, error: "no_board", hint: "Place a board first (lab_add_part)." } };
  }
  const targets =
    target === "all"
      ? design.parts.filter((p) => componentOf(p.type)?.kind === "part")
      : design.parts.filter((p) => p.id === target && componentOf(p.type)?.kind === "part");
  if (!targets.length) {
    const isBoard = design.parts.some((p) => p.id === target);
    return {
      design,
      result: isBoard
        ? { ok: false, error: "is_board", hint: "Boards are not wired by themselves; give a part id or all." }
        : target === "all"
          ? { ok: false, error: "nothing_to_wire", hint: "There are no parts besides the board." }
          : { ok: false, error: "unknown_part", given: target, parts: design.parts.map((p) => p.id) },
    };
  }
  let next = design;
  let wires = 0;
  const missing: string[] = [];
  for (const part of targets) {
    const done = autoWire(next, part.id);
    next = done.design;
    wires += done.added.length;
    missing.push(...done.missing.map((pin) => `${part.id}.${pin}`));
  }
  const check = checkDesign(next);
  return {
    design: next,
    result: { ok: true, wiresAdded: wires, couldNotWire: missing, check: checkSummary(check), verdict: verdict(check) },
    action: { kind: "autoWire", wires, missing },
  };
}

function removeTool(design: Design, input: Record<string, unknown>): AgentOutcome {
  const part = text(input.part);
  const wire = text(input.wire);
  if (!!part === !!wire) return { design, result: { ok: false, error: "give_one", hint: "Give exactly one of part or wire." } };
  if (part) {
    if (!design.parts.some((p) => p.id === part)) return { design, result: { ok: false, error: "unknown_part", given: part, parts: design.parts.map((p) => p.id) } };
    const next = removePart(design, part);
    return { design: next, result: { ok: true, removed: part, check: checkSummary(checkDesign(next)) }, action: { kind: "remove", part } };
  }
  if (!design.wires.some((w) => w.id === wire)) return { design, result: { ok: false, error: "unknown_wire", given: wire, wires: design.wires.map((w) => w.id) } };
  const next = disconnect(design, wire);
  return { design: next, result: { ok: true, removed: wire, check: checkSummary(checkDesign(next)) }, action: { kind: "remove", wire } };
}

// The three tools that do not change the design: they gate, then ask the UI to act
function makeTool(name: "lab_simulate" | "lab_make_enclosure" | "lab_make_sketch", design: Design, details?: AgentDetails): AgentOutcome {
  const check = checkDesign(design);
  if (!design.parts.some((p) => componentOf(p.type)?.kind === "board")) {
    return { design, result: { ok: false, error: "no_board", hint: "Place a board first (lab_add_part)." } };
  }
  if (name === "lab_simulate" && check.level === "red") {
    return { design, result: { ok: false, error: "blocked_by_red", check: checkSummary(check), hint: "Fix the red issues first; the lab refuses to simulate dangerous wiring." } };
  }
  let extra: Record<string, unknown> = {};
  try {
    extra = details?.[name]?.(design) ?? {};
  } catch {
    extra = {};
  }
  const kind = name === "lab_simulate" ? "simulate" : name === "lab_make_enclosure" ? "enclosure" : "sketch";
  return { design, result: { ok: true, ...extra, check: checkSummary(check), verdict: verdict(check) }, action: { kind } };
}

// Runs one tool on a design. Never throws; the returned design is the same object when nothing changed.
export function applyAgentTool(design: Design, name: string, input: unknown, details?: AgentDetails): AgentOutcome {
  try {
    const args = record(input);
    switch (name) {
      case "lab_catalog":
        return catalog(design, args);
      case "lab_view":
        return view(design);
      case "lab_add_part":
        return addTool(design, args);
      case "lab_connect":
        return connectTool(design, args);
      case "lab_auto_wire":
        return autoWireTool(design, args);
      case "lab_remove":
        return removeTool(design, args);
      case "lab_simulate":
      case "lab_make_enclosure":
      case "lab_make_sketch":
        return makeTool(name, design, details);
      default:
        return { design, result: { ok: false, error: "unknown_tool", given: String(name).slice(0, 60), tools: AGENT_TOOL_NAMES } };
    }
  } catch {
    return { design, result: { ok: false, error: "tool_failed", hint: "The tool hit an unexpected problem; the bench was not changed." } };
  }
}

// The text the model receives for a tool result
export function resultText(result: AgentToolResult): string {
  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({ ok: false, error: "unserializable" });
  }
}

// What the agent is told about the bench at the start of every call
export function benchContext(design: Design): string {
  const check = checkDesign(design);
  return [
    "Estado actual del banco (puede haber cambiado desde tus herramientas anteriores):",
    describeDesign(design),
    `Revisión: ${check.level} (${check.issues.length} avisos)`,
    ...check.issues.slice(0, MAX_ISSUES).map((i) => `- ${i.level} ${i.key}${i.part ? ` en ${i.part}${i.pin ? `.${i.pin}` : ""}` : ""}: ${MEANING[i.key]}`),
  ].join("\n");
}

// --- Request hygiene: the route never trusts what the browser sends ---

export const WIRE_LIMITS = { messages: 80, text: 8000, result: 24000, blocks: 40, bodyBytes: 600_000 };

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

function cleanBlock(raw: unknown): AgentBlock | null {
  const b = record(raw);
  switch (b.type) {
    case "text":
      return typeof b.text === "string" && b.text ? { type: "text", text: clip(b.text, WIRE_LIMITS.text) } : null;
    case "tool_use":
      return typeof b.id === "string" && b.id && typeof b.name === "string" && b.name
        ? { type: "tool_use", id: clip(b.id, 80), name: clip(b.name, 60), input: record(b.input) }
        : null;
    case "tool_result":
      return typeof b.tool_use_id === "string" && b.tool_use_id && typeof b.content === "string"
        ? { type: "tool_result", tool_use_id: clip(b.tool_use_id, 80), content: clip(b.content, WIRE_LIMITS.result), ...(b.is_error ? { is_error: true } : {}) }
        : null;
    case "thinking":
      return typeof b.thinking === "string" && typeof b.signature === "string" ? { type: "thinking", thinking: b.thinking, signature: b.signature } : null;
    case "redacted_thinking":
      return typeof b.data === "string" ? { type: "redacted_thinking", data: b.data } : null;
    default:
      return null;
  }
}

// Validates the chat history from the browser: known roles and block types, bounded sizes, and a last
// turn from the user (a model turn cannot be prefilled). Returns null when it cannot be a real history.
export function sanitizeAgentMessages(input: unknown): AgentMessage[] | null {
  if (!Array.isArray(input) || !input.length || input.length > WIRE_LIMITS.messages) return null;
  const out: AgentMessage[] = [];
  for (const raw of input) {
    const m = record(raw);
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (typeof m.content === "string") {
      const content = clip(m.content.trim(), WIRE_LIMITS.text);
      if (!content) return null;
      out.push({ role: m.role, content });
      continue;
    }
    if (!Array.isArray(m.content) || !m.content.length || m.content.length > WIRE_LIMITS.blocks) return null;
    const blocks = m.content.map(cleanBlock);
    if (blocks.some((b) => !b)) return null;
    out.push({ role: m.role, content: blocks as AgentBlock[] });
  }
  return out[out.length - 1].role === "user" ? out : null;
}
