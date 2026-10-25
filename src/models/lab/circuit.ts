// The lab's circuit: what is on the bench and how it is wired. Pure and deterministic: the view model,
// the chat's agent tools and the tests share it. The agent proposes; checkDesign decides whether a
// wiring is safe, never a model.
// x and z are bench units (1 = 10 mm); rot is a quarter turn count (0..3).

import { componentOf, type Board, type BoardPin, type Component, type PartPin } from "./catalog.ts";

export type PinRef = { part: string; pin: string };
export type PlacedPart = { id: string; type: string; x: number; z: number; rot: number };
export type Wire = { id: string; from: PinRef; to: PinRef };
export type Design = { version: 1; parts: PlacedPart[]; wires: Wire[] };

export type Level = "green" | "yellow" | "red";
export type IssueKey =
  | "short" | "mixedPower" | "overvoltage"
  | "missing" | "wrongPin" | "undervoltage" | "pinShared" | "level" | "budget" | "noBoard";
export type Issue = {
  level: Exclude<Level, "green">;
  key: IssueKey;
  part?: string;
  pin?: string;
  board?: string;
  boardPin?: string;
  usedMa?: number;
  budgetMa?: number;
};
export type Check = {
  level: Level;
  issues: Issue[];
  parts: Record<string, Level>;
  budget: { board: string; usedMa: number; budgetMa: number }[];
};
export type ConnectRefusal = "unknown" | "same" | "duplicate" | "full";

export const LIMITS = { parts: 60, wires: 240, coord: 500 };

const POWER_KINDS = new Set(["5v", "3v3", "vin"]);
const BUS_KINDS = new Set(["sda", "scl"]);
const STRAPPING = new Set(["GPIO2", "GPIO12", "GPIO15"]);

export function emptyDesign(): Design {
  return { version: 1, parts: [], wires: [] };
}

const finite = (n: unknown, fallback = 0) =>
  Number.isFinite(Number(n)) ? Math.max(-LIMITS.coord, Math.min(LIMITS.coord, Number(n))) : fallback;
const quarter = (n: unknown) => ((Math.round(Number(n) || 0) % 4) + 4) % 4;
const sameEnd = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;
const sameWire = (w: Wire, a: PinRef, b: PinRef) => (sameEnd(w.from, a) && sameEnd(w.to, b)) || (sameEnd(w.from, b) && sameEnd(w.to, a));

type FoundPin = { part: PlacedPart; spec: Component; pin: BoardPin | PartPin };
function pinOf(design: Design, end: Partial<PinRef> | undefined): FoundPin | null {
  const part = design.parts.find((p) => p.id === end?.part);
  const spec = part && componentOf(part.type);
  const pin = spec && (spec.pins as (BoardPin | PartPin)[]).find((p) => p.id === end?.pin);
  return part && spec && pin ? { part, spec, pin } : null;
}
const kindsOf = (pin: BoardPin | PartPin) => ("kinds" in pin ? pin.kinds : []);
const acceptsOf = (pin: BoardPin | PartPin) => ("accepts" in pin ? pin.accepts : []);

// Reads a saved design. Anything unknown or broken is dropped (a part of a type not in the catalog, a
// wire to a pin that does not exist), so a hand-edited or agent-written file can never break the bench.
export function parseDesign(input: unknown): { design: Design; dropped: number; error: "json" | null } {
  let raw: unknown;
  try {
    raw = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    return { design: emptyDesign(), dropped: 1, error: "json" };
  }
  const src = (raw ?? {}) as { parts?: unknown; wires?: unknown };
  const design = emptyDesign();
  let dropped = 0;
  const ids = new Set<string>();
  for (const p of Array.isArray(src.parts) ? (src.parts as Record<string, unknown>[]) : []) {
    const id = typeof p?.id === "string" ? p.id.slice(0, 40) : "";
    if (!id || ids.has(id) || !componentOf(p.type as string) || design.parts.length >= LIMITS.parts) {
      dropped++;
      continue;
    }
    ids.add(id);
    design.parts.push({ id, type: p.type as string, x: finite(p.x), z: finite(p.z), rot: quarter(p.rot) });
  }
  for (const w of Array.isArray(src.wires) ? (src.wires as { from?: PinRef; to?: PinRef }[]) : []) {
    const from = { part: String(w?.from?.part ?? ""), pin: String(w?.from?.pin ?? "") };
    const to = { part: String(w?.to?.part ?? ""), pin: String(w?.to?.pin ?? "") };
    if (!pinOf(design, from) || !pinOf(design, to) || sameEnd(from, to) || design.wires.some((x) => sameWire(x, from, to)) || design.wires.length >= LIMITS.wires) {
      dropped++;
      continue;
    }
    design.wires.push({ id: `w${design.wires.length + 1}`, from, to });
  }
  return { design, dropped, error: null };
}

export function serializeDesign(design: Design): string {
  return `${JSON.stringify(design, null, 2)}\n`;
}

function nextId(list: { id: string }[], prefix: string) {
  const used = new Set(list.map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// The same design and id null when the type is unknown or the bench is full
export function addPart(design: Design, type: string, { x = 0, z = 0, rot = 0 } = {}): { design: Design; id: string | null } {
  if (!componentOf(type) || design.parts.length >= LIMITS.parts) return { design, id: null };
  const id = nextId(design.parts, `${type}-`);
  return { design: { ...design, parts: [...design.parts, { id, type, x: finite(x), z: finite(z), rot: quarter(rot) }] }, id };
}

export function movePart(design: Design, id: string, { x, z }: { x: number; z: number }): Design {
  return { ...design, parts: design.parts.map((p) => (p.id === id ? { ...p, x: finite(x, p.x), z: finite(z, p.z) } : p)) };
}

export function rotatePart(design: Design, id: string): Design {
  return { ...design, parts: design.parts.map((p) => (p.id === id ? { ...p, rot: (p.rot + 1) % 4 } : p)) };
}

// Removing a part takes its wires with it
export function removePart(design: Design, id: string): Design {
  return { ...design, parts: design.parts.filter((p) => p.id !== id), wires: design.wires.filter((w) => w.from.part !== id && w.to.part !== id) };
}

export function connect(
  design: Design,
  from: PinRef,
  to: PinRef,
): { design: Design; ok: boolean; id?: string; reason?: ConnectRefusal } {
  if (!pinOf(design, from) || !pinOf(design, to)) return { design, ok: false, reason: "unknown" };
  if (sameEnd(from, to)) return { design, ok: false, reason: "same" };
  if (design.wires.some((w) => sameWire(w, from, to))) return { design, ok: false, reason: "duplicate" };
  if (design.wires.length >= LIMITS.wires) return { design, ok: false, reason: "full" };
  const id = nextId(design.wires, "w");
  const wire: Wire = { id, from: { part: from.part, pin: from.pin }, to: { part: to.part, pin: to.pin } };
  return { design: { ...design, wires: [...design.wires, wire] }, ok: true, id };
}

export function disconnect(design: Design, wireId: string): Design {
  return { ...design, wires: design.wires.filter((w) => w.id !== wireId) };
}

// --- Nets: pins joined by wires (directly or through other pins) ---
const keyOf = (end: PinRef) => `${end.part}:${end.pin}`;
export function netsOf(design: Design): Map<string, PinRef[]> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)!)!);
      k = parent.get(k)!;
    }
    return k;
  };
  const add = (k: string) => {
    if (!parent.has(k)) parent.set(k, k);
  };
  for (const w of design.wires) {
    add(keyOf(w.from));
    add(keyOf(w.to));
    parent.set(find(keyOf(w.from)), find(keyOf(w.to)));
  }
  const nets = new Map<string, PinRef[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!nets.has(root)) nets.set(root, []);
    const cut = k.lastIndexOf(":");
    nets.get(root)!.push({ part: k.slice(0, cut), pin: k.slice(cut + 1) });
  }
  const byPin = new Map<string, PinRef[]>();
  for (const members of nets.values()) members.forEach((m) => byPin.set(keyOf(m), members));
  return byPin;
}

// What a net holds: the board pins in it, and whether it carries power or ground
function describeNet(design: Design, members: PinRef[]) {
  const boardPins: { part: PlacedPart; spec: Board; pin: BoardPin }[] = [];
  const power = new Set<string>();
  let ground = false;
  for (const m of members) {
    const found = pinOf(design, m);
    if (!found) continue;
    if (found.spec.kind === "board") {
      const pin = found.pin as BoardPin;
      boardPins.push({ part: found.part, spec: found.spec, pin });
      pin.kinds.forEach((k) => {
        if (POWER_KINDS.has(k)) power.add(k);
        if (k === "gnd") ground = true;
      });
    } else if (found.spec.supplies && found.pin.id === "+") power.add("vin");
    else {
      const accepts = acceptsOf(found.pin);
      if (accepts.length === 1 && accepts[0] === "gnd") ground = true;
    }
  }
  return { boardPins, power, ground };
}

const LEVEL_RANK: Record<Level, number> = { green: 0, yellow: 1, red: 2 };
const worse = (a: Level, b: Level): Level => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);

// The deterministic checker.
//   red:    short (power and ground joined), mixedPower (5 V and 3.3 V joined), overvoltage (a 3.3 V part on 5 V)
//   yellow: missing (a required pin unwired), wrongPin (a pin that cannot do that), undervoltage,
//           pinShared (one board signal pin for two parts), level (a 5 V signal into a 3.3 V board),
//           budget (the board cannot feed everything on its 5 V), noBoard
export function checkDesign(design: Design): Check {
  const issues: Issue[] = [];
  const nets = netsOf(design);
  const boards = design.parts.filter((p) => componentOf(p.type)?.kind === "board");
  if (!boards.length && design.parts.length) issues.push({ level: "yellow", key: "noBoard" });

  for (const members of new Set(nets.values())) {
    const net = describeNet(design, members);
    if (net.ground && net.power.size) issues.push({ level: "red", key: "short", part: members[0].part, pin: members[0].pin });
    if (net.power.has("5v") && net.power.has("3v3")) issues.push({ level: "red", key: "mixedPower", part: members[0].part, pin: members[0].pin });
    // A board signal pin used by more than one part (power, ground and the I2C bus can be shared)
    for (const bp of net.boardPins) {
      if (bp.pin.kinds.some((k) => POWER_KINDS.has(k) || k === "gnd")) continue;
      const users = members.filter((m) => m.part !== bp.part.id && componentOf(design.parts.find((p) => p.id === m.part)?.type)?.kind === "part");
      const bus = users.length > 1 && users.every((u) => acceptsOf(pinOf(design, u)!.pin).some((k) => BUS_KINDS.has(k)));
      if (users.length > 1 && !bus) {
        issues.push({ level: "yellow", key: "pinShared", part: users[1].part, pin: users[1].pin, board: bp.part.id, boardPin: bp.pin.id });
      }
    }
  }

  const draw = new Map<string, number>(); // board id -> mA on its 5 V
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind !== "part") continue;
    for (const pin of spec.pins) {
      const members = nets.get(keyOf({ part: part.id, pin: pin.id }));
      if (!members) {
        if (pin.required) issues.push({ level: "yellow", key: "missing", part: part.id, pin: pin.id });
        continue;
      }
      const net = describeNet(design, members);
      if (!net.boardPins.length) continue; // wired only to other parts: nothing to compare with
      const offered = new Set(net.boardPins.flatMap((bp) => bp.pin.kinds as string[]));
      const fits = pin.accepts.some((k) => offered.has(k));
      if (pin.accepts.some((k) => POWER_KINDS.has(k))) {
        if (!fits && offered.has("5v") && !pin.accepts.includes("5v")) issues.push({ level: "red", key: "overvoltage", part: part.id, pin: pin.id });
        else if (!fits && offered.has("3v3") && !pin.accepts.includes("3v3")) issues.push({ level: "yellow", key: "undervoltage", part: part.id, pin: pin.id });
        else if (!fits) issues.push({ level: "yellow", key: "wrongPin", part: part.id, pin: pin.id });
        if (offered.has("5v")) {
          net.boardPins.filter((bp) => bp.pin.kinds.includes("5v")).forEach((bp) => draw.set(bp.part.id, (draw.get(bp.part.id) ?? 0) + spec.mA));
        }
        continue;
      }
      if (!fits) {
        if (!(pin.accepts.includes("gnd") && offered.has("gnd"))) issues.push({ level: "yellow", key: "wrongPin", part: part.id, pin: pin.id });
        continue;
      }
      if (spec.out5v && !pin.accepts.includes("gnd") && net.boardPins.some((bp) => bp.spec.logic < 5)) {
        issues.push({ level: "yellow", key: "level", part: part.id, pin: pin.id });
      }
    }
  }
  const budget = boards.map((b) => ({ board: b.id, usedMa: draw.get(b.id) ?? 0, budgetMa: (componentOf(b.type) as Board).budgetMa }));
  budget
    .filter((b) => b.usedMa > b.budgetMa)
    .forEach((b) => issues.push({ level: "yellow", key: "budget", part: b.board, usedMa: b.usedMa, budgetMa: b.budgetMa }));

  const parts: Record<string, Level> = Object.fromEntries(design.parts.map((p) => [p.id, "green" as Level]));
  let level: Level = "green";
  for (const issue of issues) {
    level = worse(level, issue.level);
    if (issue.part && parts[issue.part]) parts[issue.part] = worse(parts[issue.part], issue.level);
  }
  return { level, issues, parts, budget };
}

// --- Automatic wiring: the "Conectar solo" button and the agent's suggestion ---
// Which board pins a part pin should try first: power and ground by name, the I2C bus by kind (shared),
// a signal by the scarcest-first rule (a plain digital need takes a pin that is neither PWM nor analog).
function candidatesFor(pin: PartPin, board: Board): BoardPin[] {
  const pins = board.pins;
  const has = (p: BoardPin, k: string) => (p.kinds as string[]).includes(k);
  if (pin.accepts.includes("gnd")) return pins.filter((p) => has(p, "gnd"));
  if (pin.accepts.includes("vin")) return pins.filter((p) => has(p, "vin"));
  if (pin.accepts.some((k) => POWER_KINDS.has(k))) {
    // A 3.3 V board feeds parts that take both from 3.3 V (its signals are 3.3 V too)
    const order = board.logic < 5 ? ["3v3", "5v"] : ["5v", "3v3"];
    return order.filter((k) => (pin.accepts as string[]).includes(k)).flatMap((k) => pins.filter((p) => has(p, k)));
  }
  const bus = pin.accepts.find((k) => BUS_KINDS.has(k));
  if (bus) return pins.filter((p) => has(p, bus));
  // ESP32 strapping pins (GPIO2, GPIO12, GPIO15) decide how it boots: used last, never first
  const strapping = (p: BoardPin) => board.id === "esp32-devkit" && STRAPPING.has(p.id);
  const cost = (p: BoardPin) =>
    (has(p, "pwm") ? 1 : 0) + (has(p, "analog") ? 2 : 0) + (has(p, "sda") || has(p, "scl") ? 4 : 0) + (strapping(p) ? 8 : 0);
  return pins.filter((p) => pin.accepts.some((k) => has(p, k))).sort((a, b) => cost(a) - cost(b) || pins.indexOf(a) - pins.indexOf(b));
}

// Wires every unwired pin of a part to the board (the first one, or boardId). Only power, ground and the
// I2C bus are shared; a signal takes a free pin.
export function autoWire(design: Design, partId: string, boardId: string | null = null): { design: Design; added: Wire[]; missing: string[] } {
  const part = design.parts.find((p) => p.id === partId);
  const spec = part && componentOf(part.type);
  const board = design.parts.find((p) => (boardId ? p.id === boardId : componentOf(p.type)?.kind === "board"));
  if (!part || !spec || spec.kind !== "part" || !board) return { design, added: [], missing: spec?.pins.map((p) => p.id) ?? [] };
  const boardSpec = componentOf(board.type) as Board;
  const added: Wire[] = [];
  const missing: string[] = [];
  let next = design;
  for (const pin of spec.pins) {
    const end = { part: part.id, pin: pin.id };
    if (next.wires.some((w) => sameEnd(w.from, end) || sameEnd(w.to, end))) continue;
    const shared = pin.accepts.some((k) => POWER_KINDS.has(k) || k === "gnd" || BUS_KINDS.has(k));
    const taken = new Set(next.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === board.id).map((e) => e.pin));
    const target = candidatesFor(pin, boardSpec).find((p) => shared || !taken.has(p.id));
    if (!target) {
      missing.push(pin.id);
      continue;
    }
    const result = connect(next, end, { part: board.id, pin: target.id });
    if (!result.ok) {
      missing.push(pin.id);
      continue;
    }
    next = result.design;
    added.push(next.wires[next.wires.length - 1]);
  }
  return { design: next, added, missing };
}

// The board pin each of a part's pins ends up on (through any wires), for the code and the simulation
export function boardPinsOf(design: Design, partId: string): Record<string, { board: string; pin: string } | null> {
  const nets = netsOf(design);
  const spec = componentOf(design.parts.find((p) => p.id === partId)?.type);
  if (!spec) return {};
  return Object.fromEntries(
    (spec.pins as (BoardPin | PartPin)[]).map((pin) => {
      const members = nets.get(keyOf({ part: partId, pin: pin.id })) ?? [];
      const hit = members.find((m) => componentOf(design.parts.find((p) => p.id === m.part)?.type)?.kind === "board");
      return [pin.id, hit ? { board: hit.part, pin: hit.pin } : null];
    }),
  );
}

// A short text of the bench for the agent: one line per part with its wires
export function describeDesign(design: Design): string {
  if (!design.parts.length) return "(banco vacío)";
  return design.parts
    .map((p) => {
      const links = design.wires
        .filter((w) => w.from.part === p.id || w.to.part === p.id)
        .map((w) => (w.from.part === p.id ? `${w.from.pin}→${w.to.part}.${w.to.pin}` : `${w.to.pin}→${w.from.part}.${w.from.pin}`));
      return `${p.id} (${p.type})${links.length ? `: ${links.join(", ")}` : ""}`;
    })
    .join("\n");
}

export { kindsOf };
