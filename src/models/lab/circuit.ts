// The lab's circuit: what is on the bench and how it is wired. Pure and deterministic: the view model,
// the chat's agent tools and the tests share it. The agent proposes; checkDesign decides whether a
// wiring is safe, never a model.
// x and z are bench units (1 = 10 mm); rot is a quarter turn count (0..3).

import { freeSpot } from "./layout.ts";
import { componentOf, type Board, type BoardPin, type Component, type PartPin } from "./catalog.ts";

export type PinRef = { part: string; pin: string };
export type PlacedPart = { id: string; type: string; x: number; z: number; rot: number };
export type Wire = { id: string; from: PinRef; to: PinRef };
export type Design = { version: 1; parts: PlacedPart[]; wires: Wire[] };

export type Level = "green" | "yellow" | "red";
export type IssueKey =
  | "short" | "mixedPower" | "overvoltage" | "ledNoResistor" | "i2cDuplicate" | "externalPower" | "inputOnly"
  | "missing" | "wrongPin" | "undervoltage" | "pinShared" | "level" | "budget" | "noBoard" | "strapping" | "pinCurrent";
// The rule codes of the research spec (R1..R20) so the UI and the agent can cite them
export const RULE_CODES: Record<IssueKey, string> = {
  short: "R1", overvoltage: "R2", undervoltage: "R3", ledNoResistor: "R4", level: "R5", wrongPin: "R6", strapping: "R7",
  inputOnly: "R8", i2cDuplicate: "R10", externalPower: "R14", pinCurrent: "R15", budget: "R16", mixedPower: "R19",
  missing: "R20", noBoard: "R20", pinShared: "R20",
};
export type Issue = {
  level: Exclude<Level, "green">;
  key: IssueKey;
  code?: string; // the rule code (R4...) checkDesign sets on every issue
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
// ESP32 pins that decide how it boots (R7) and pins that can only read (R8)
export const STRAPPING = new Set(["GPIO0", "GPIO2", "GPIO5", "GPIO12", "GPIO15"]);
const INPUT_ONLY = new Set(["GPIO34", "GPIO35", "GPIO36", "GPIO37", "GPIO38", "GPIO39"]);
// The resistor: a 2-pin part that joins two nets (the checker sees through it, R4 does not)
export const RESISTOR = "resistor-220";
// Part pins the board drives (outputs), "type.pin"
const DRIVEN = new Set(["servo-sg90.SIG", "relay.IN", "buzzer.SIG", "led.SIG", "l298n.ENA", "l298n.IN1", "l298n.IN2", "hc-sr04.TRIG"]);
// mA a part pulls straight from its signal pin when no resistor or driver is in between (R15)
const DIRECT_LOAD_MA: Record<string, number> = { buzzer: 30 };
export const PIN_SAFE_MA = 20; // above this a board pin is stressed (yellow); above PIN_MAX_MA it is red
export const PIN_MAX_MA = 40;
// What a part pulls at its peak from the 5 V it is fed (R14): a servo's stall surge, a small motor
const PEAK_MA: Record<string, number> = { "servo-sg90": 500, l298n: 500 };

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
    const id = typeof p?.id === "string" && PART_ID.test(p.id) ? p.id : "";
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

// A part id travels in prompts and messages: only a short lowercase slug is accepted from a file
export const PART_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

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

// The pins a pin reaches: its net, and through any resistor the net on the other side (a resistor lets the
// signal pass; a short does not go through it)
export function reachOf(design: Design, end: PinRef, nets: Map<string, PinRef[]> = netsOf(design)): PinRef[] {
  const seen = new Set<string>();
  const out: PinRef[] = [];
  const queue = [end];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const m of nets.get(keyOf(cur)) ?? [cur]) {
      if (seen.has(keyOf(m))) continue;
      seen.add(keyOf(m));
      out.push(m);
      if (design.parts.find((p) => p.id === m.part)?.type === RESISTOR) queue.push({ part: m.part, pin: m.pin === "A" ? "B" : "A" });
    }
  }
  return out;
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

// The deterministic checker. Every issue carries its rule code (RULE_CODES).
//   red:    short R1, overvoltage R2, ledNoResistor R4 (an LED's signal on a board pin with no resistor),
//           inputOnly R8 (ESP32 GPIO34-39 as an output), i2cDuplicate R10 (two displays of one type on a bus),
//           externalPower R14 (servo/motor peak on the board's 5 V above what it gives), pinCurrent R15 above 40 mA,
//           mixedPower R19
//   yellow: undervoltage R3, wrongPin R6, strapping R7 (ESP32 boot pins), pinCurrent R15 (20-40 mA straight from a pin),
//           level R5, budget R16, missing / noBoard / pinShared R20
// A resistor joins its two nets for the pin checks (reachOf) but not for R4, which looks at the LED's own net.
export function checkDesign(design: Design): Check {
  const raw: Omit<Issue, "code">[] = [];
  const issues = { push: (i: Omit<Issue, "code">) => void raw.push(i) };
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

  // R10: two displays of the same type on one I2C bus answer to the same address
  for (const members of new Set(nets.values())) {
    const net = describeNet(design, members);
    const bus = net.boardPins.find((bp) => bp.pin.kinds.includes("sda"));
    if (!bus) continue;
    const byType = new Map<string, PinRef[]>();
    for (const m of members) {
      const found = pinOf(design, m);
      if (found && found.spec.kind === "part" && found.spec.bus === "i2c" && acceptsOf(found.pin).includes("sda")) {
        byType.set(found.spec.id, [...(byType.get(found.spec.id) ?? []), m]);
      }
    }
    for (const same of byType.values()) {
      if (same.length > 1) issues.push({ level: "red", key: "i2cDuplicate", part: same[1].part, pin: same[1].pin, board: bus.part.id, boardPin: bus.pin.id });
    }
  }

  // R4: an LED whose signal pin is on a board pin with no resistor in between
  for (const part of design.parts) {
    if (part.type !== "led") continue;
    const members = nets.get(keyOf({ part: part.id, pin: "SIG" }));
    const hit = members && describeNet(design, members).boardPins.find((bp) => !bp.pin.kinds.includes("gnd"));
    if (hit) issues.push({ level: "red", key: "ledNoResistor", part: part.id, pin: "SIG", board: hit.part.id, boardPin: hit.pin.id });
  }

  const draw = new Map<string, number>(); // board id -> mA on its 5 V
  const peak = new Map<string, { ma: number; part: string; pin: string }>(); // board id -> peak mA of servos and motors on its 5 V
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind !== "part") continue;
    for (const pin of spec.pins) {
      const end = { part: part.id, pin: pin.id };
      if (!nets.has(keyOf(end))) {
        if (pin.required) issues.push({ level: "yellow", key: "missing", part: part.id, pin: pin.id });
        continue;
      }
      const members = reachOf(design, end, nets);
      const net = describeNet(design, members);
      if (!net.boardPins.length) continue; // wired only to other parts: nothing to compare with
      const offered = new Set(net.boardPins.flatMap((bp) => bp.pin.kinds as string[]));
      const fits = pin.accepts.some((k) => offered.has(k));
      if (pin.accepts.some((k) => POWER_KINDS.has(k))) {
        if (!fits && offered.has("5v") && !pin.accepts.includes("5v")) issues.push({ level: "red", key: "overvoltage", part: part.id, pin: pin.id });
        else if (!fits && offered.has("3v3") && !pin.accepts.includes("3v3")) issues.push({ level: "yellow", key: "undervoltage", part: part.id, pin: pin.id });
        else if (!fits) issues.push({ level: "yellow", key: "wrongPin", part: part.id, pin: pin.id });
        if (offered.has("5v")) {
          net.boardPins.filter((bp) => bp.pin.kinds.includes("5v")).forEach((bp) => {
            draw.set(bp.part.id, (draw.get(bp.part.id) ?? 0) + spec.mA);
            const own = PEAK_MA[spec.id];
            if (own) peak.set(bp.part.id, { ma: (peak.get(bp.part.id)?.ma ?? 0) + own, part: peak.get(bp.part.id)?.part ?? part.id, pin: peak.get(bp.part.id)?.pin ?? pin.id });
          });
        }
        continue;
      }
      if (spec.id !== RESISTOR) {
        const direct = describeNet(design, nets.get(keyOf(end)) ?? []).boardPins;
        for (const bp of net.boardPins) {
          if (bp.pin.kinds.some((k) => POWER_KINDS.has(k) || k === "gnd")) continue;
          const at = { part: part.id, pin: pin.id, board: bp.part.id, boardPin: bp.pin.id };
          if (bp.spec.id === "esp32-devkit" && STRAPPING.has(bp.pin.id)) issues.push({ level: "yellow", key: "strapping", ...at });
          if (bp.spec.id === "esp32-devkit" && INPUT_ONLY.has(bp.pin.id) && DRIVEN.has(`${spec.id}.${pin.id}`)) issues.push({ level: "red", key: "inputOnly", ...at });
          const load = DIRECT_LOAD_MA[spec.id];
          if (load && load > PIN_SAFE_MA && direct.some((d) => d.part.id === bp.part.id && d.pin.id === bp.pin.id)) {
            issues.push({ level: load > PIN_MAX_MA ? "red" : "yellow", key: "pinCurrent", ...at, usedMa: load, budgetMa: PIN_SAFE_MA });
          }
        }
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

  // R14: servos and motors fed from the board's 5 V whose peak is more than the board can give
  for (const [board, p] of peak) {
    const budgetMa = (componentOf(design.parts.find((x) => x.id === board)?.type) as Board).budgetMa;
    if (p.ma > budgetMa) issues.push({ level: "red", key: "externalPower", part: p.part, pin: p.pin, board, usedMa: p.ma, budgetMa });
  }

  const all = raw.map((i): Issue => ({ ...i, code: RULE_CODES[i.key] }));
  const parts: Record<string, Level> = Object.fromEntries(design.parts.map((p) => [p.id, "green" as Level]));
  let level: Level = "green";
  for (const issue of all) {
    level = worse(level, issue.level);
    if (issue.part && parts[issue.part]) parts[issue.part] = worse(parts[issue.part], issue.level);
  }
  return { level, issues: all, parts, budget };
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
// I2C bus are shared; a signal takes a free pin. An LED's signal goes through a 220 Ω resistor: a free one
// on the bench is used, else one is placed next to the LED (the board pin goes to its A, its B to the LED).
// A resistor on its own gets only its A wired: B belongs to whatever it protects.
export function autoWire(
  design: Design,
  partId: string,
  boardId: string | null = null,
): { design: Design; added: Wire[]; missing: string[]; addedParts: string[] } {
  const part = design.parts.find((p) => p.id === partId);
  const spec = part && componentOf(part.type);
  const board = design.parts.find((p) => (boardId ? p.id === boardId : componentOf(p.type)?.kind === "board"));
  if (!part || !spec || spec.kind !== "part" || !board) return { design, added: [], missing: spec?.pins.map((p) => p.id) ?? [], addedParts: [] };
  const boardSpec = componentOf(board.type) as Board;
  const added: Wire[] = [];
  const addedParts: string[] = [];
  const missing: string[] = [];
  let next = design;
  const wired = (end: PinRef) => next.wires.some((w) => sameEnd(w.from, end) || sameEnd(w.to, end));
  const takenPins = () => new Set(next.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === board.id).map((e) => e.pin));
  const link = (from: PinRef, to: PinRef): boolean => {
    const result = connect(next, from, to);
    if (result.ok) {
      next = result.design;
      added.push(next.wires[next.wires.length - 1]);
    }
    return result.ok;
  };
  for (const pin of spec.pins) {
    const end = { part: part.id, pin: pin.id };
    if (wired(end)) continue;
    if (part.type === RESISTOR && pin.id === "B") {
      missing.push(pin.id);
      continue;
    }
    if (part.type === "led" && pin.id === "SIG") {
      const taken = takenPins();
      const target = candidatesFor(pin, boardSpec).find((p) => !taken.has(p.id));
      // A resistor with its B free is ours; with none, one goes next to the LED
      let resistor = next.parts.find((p) => p.type === RESISTOR && !wired({ part: p.id, pin: "B" }));
      if (!resistor && target) {
        const at = freeSpot(next, RESISTOR, part.x, part.z);
        const placed = addPart(next, RESISTOR, at);
        if (placed.id) {
          next = placed.design;
          addedParts.push(placed.id);
          resistor = next.parts.find((p) => p.id === placed.id);
        }
      }
      const inA = resistor && { part: resistor.id, pin: "A" };
      const ok = !!(target && resistor && inA && (wired(inA) || link(inA, { part: board.id, pin: target.id })) && link({ part: resistor.id, pin: "B" }, end));
      if (!ok) missing.push(pin.id);
      continue;
    }
    const shared = pin.accepts.some((k) => POWER_KINDS.has(k) || k === "gnd" || BUS_KINDS.has(k));
    const taken = takenPins();
    const target = candidatesFor(pin, boardSpec).find((p) => shared || !taken.has(p.id));
    if (!target || !link(end, { part: board.id, pin: target.id })) missing.push(pin.id);
  }
  return { design: next, added, missing, addedParts };
}

// The board pin each of a part's pins ends up on (through any wires), for the code and the simulation
export function boardPinsOf(design: Design, partId: string): Record<string, { board: string; pin: string } | null> {
  const nets = netsOf(design);
  const spec = componentOf(design.parts.find((p) => p.id === partId)?.type);
  if (!spec) return {};
  return Object.fromEntries(
    (spec.pins as (BoardPin | PartPin)[]).map((pin) => {
      const members = reachOf(design, { part: partId, pin: pin.id }, nets);
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
