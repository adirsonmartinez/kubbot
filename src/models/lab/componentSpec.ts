// The "ficha" of a component the person imports from a photo or a datasheet: what Qubi read, what the
// person edited, and the deterministic checks before it enters "Mi catálogo". Pure: no React, no fetch.
//
//   validateSpec(spec)        -> { ok, issues: [{ level, key, field }] }   red blocks saving, yellow only warns
//   specToComponent(spec)     -> catalog Component (roles become accepts / kinds)
//   userEntryOf(spec, photo?) -> what catalog.registerUserComponents wants
//   parseSpec(raw)            -> a clean ComponentSpec from anything (the model's JSON, a .json file, storage)
//   slugId(name, taken)       -> "usr-" + slug, unique
//
// The model proposes, this file decides: the same rules apply to a ficha read by Claude, typed by hand or
// loaded from a file. Text for the keys is in views/copy/import.ts.

import { CATEGORIES, COMPONENTS, PIN_KINDS, type BoardPin, type Category, type Component, type PartPin, type PinKind, type Source, type UserEntry } from "./catalog.ts";
import { PART_ROLE_IDS } from "./guide.ts";

export const BOARD_ROLE_IDS = ["board-5v", "board-3v3", "board-vin", "board-gnd", "board-digital", "board-pwm", "board-analog", "board-sda", "board-scl"] as const;
export const SPEC_ROLES: readonly string[] = [...PART_ROLE_IDS, ...BOARD_ROLE_IDS];

export const SPEC_LIMITS = { sizeMin: 1, sizeMax: 300, pinsMax: 64, voltsMax: 60, mAMax: 5000, nameMax: 60, descMax: 200 } as const;
export const ID_PREFIX = "usr-";

export type SpecPin = {
  id: string; // the pin name in code and wires: letters, numbers, "_"
  label?: string; // what the silkscreen says, when it differs ("+5V")
  role: string; // PART_ROLE_IDS for a part, BOARD_ROLE_IDS for a board
  accepts?: PinKind[]; // part pins: overrides what the role gives
  kinds?: PinKind[]; // board pins: overrides what the role gives
  optional?: boolean; // not required for the part to work
};

export type ComponentSpec = {
  id: string;
  name: string;
  desc: string;
  category: Category;
  kind: "part" | "board";
  size: [number, number, number]; // mm
  sizeEstimated?: boolean; // the numbers come from a photo, not from a datasheet
  pins: SpecPin[];
  volts?: [number, number];
  mA: number;
  logic?: 3.3 | 5; // boards
  budgetMa?: number; // boards
  holes?: [number, number][]; // boards
  color?: number;
  source: Source;
};

export type SpecIssue = { level: "red" | "yellow"; key: SpecIssueKey; field: string };
export type SpecIssueKey =
  | "name" | "id" | "idTaken" | "category" | "kindCategory"
  | "size" | "volts" | "voltsOrder" | "voltsMissing" | "mA" | "logic"
  | "noPins" | "tooManyPins" | "pinId" | "pinDuplicate" | "pinRole" | "pinKinds"
  | "noGround" | "noPower" | "boardPower" | "noSignal"
  | "licenseMissing" | "licensePersonal";
export type SpecCheck = { ok: boolean; issues: SpecIssue[] };

const PIN_ID = /^[A-Za-z0-9_]{1,12}$/;
const ID_RE = /^usr-[a-z0-9]+(-[a-z0-9]+)*$/;
const KIND_SET = new Set<string>(PIN_KINDS);
const isPartRole = (r: string) => (PART_ROLE_IDS as readonly string[]).includes(r);
const isBoardRole = (r: string) => (BOARD_ROLE_IDS as readonly string[]).includes(r);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// Licenses that only allow personal use (Creative Commons NonCommercial) or that nobody wrote down
export const isPersonalOnly = (license: string): boolean => /\b(nc|non-?commercial)\b/i.test(license.replace(/[_]/g, " ")) || /-nc\b/i.test(license);

export function validateSpec(spec: ComponentSpec): SpecCheck {
  const issues: SpecIssue[] = [];
  const add = (level: SpecIssue["level"], key: SpecIssueKey, field: string) => issues.push({ level, key, field });

  if (!spec.name.trim() || spec.name.length > SPEC_LIMITS.nameMax || CONTROL.test(spec.name)) add("red", "name", "name");
  if (!ID_RE.test(spec.id) || spec.id.length > 40) add("red", "id", "id");
  else if (COMPONENTS.some((c) => c.id === spec.id)) add("red", "idTaken", "id");
  if (!(CATEGORIES as readonly string[]).includes(spec.category)) add("red", "category", "category");
  else if ((spec.kind === "board") !== (spec.category === "boards")) add("red", "kindCategory", "category");

  const sizeOk = Array.isArray(spec.size) && spec.size.length === 3 && spec.size.every((v) => finite(v) && v >= SPEC_LIMITS.sizeMin && v <= SPEC_LIMITS.sizeMax);
  if (!sizeOk) add("red", "size", "size");

  if (!finite(spec.mA) || spec.mA < 0 || spec.mA > SPEC_LIMITS.mAMax) add("red", "mA", "mA");

  const pins = Array.isArray(spec.pins) ? spec.pins : [];
  if (pins.length === 0) add("red", "noPins", "pins");
  if (pins.length > SPEC_LIMITS.pinsMax) add("red", "tooManyPins", "pins");
  const seen = new Set<string>();
  pins.forEach((pin, i) => {
    const field = `pins.${i}`;
    if (!PIN_ID.test(pin.id)) add("red", "pinId", field);
    else if (seen.has(pin.id)) add("red", "pinDuplicate", field);
    seen.add(pin.id);
    if (!(spec.kind === "board" ? isBoardRole(pin.role) : isPartRole(pin.role))) add("red", "pinRole", field);
    const kinds = spec.kind === "board" ? pin.kinds : pin.accepts;
    if (kinds && (kinds.length === 0 || !kinds.every((k) => KIND_SET.has(k)))) add("red", "pinKinds", field);
  });

  if (spec.kind === "part") {
    const roles = pins.map((p) => p.role);
    const hasPowerPin = roles.some((r) => r === "power" || r === "vin");
    if (!roles.includes("ground")) add("red", "noGround", "pins");
    if (!pins.some((p) => !["power", "ground", "vin"].includes(p.role))) add("yellow", "noSignal", "pins");
    // The supply range and the power pin go together: a power pin needs volts, and volts need a way in
    const volts = spec.volts;
    if (volts !== undefined) {
      if (!Array.isArray(volts) || volts.length !== 2 || !volts.every((v) => finite(v) && v >= 0 && v <= SPEC_LIMITS.voltsMax)) add("red", "volts", "volts");
      else if (volts[0] > volts[1]) add("red", "voltsOrder", "volts");
      else if (!hasPowerPin && volts[1] > 0) add("yellow", "noPower", "pins");
    } else if (hasPowerPin) add("red", "voltsMissing", "volts");
  } else {
    if (spec.logic !== 3.3 && spec.logic !== 5) add("red", "logic", "logic");
    if (!pins.some((p) => ["board-5v", "board-3v3", "board-vin"].includes(p.role))) add("yellow", "boardPower", "pins");
    if (!pins.some((p) => p.role === "board-gnd")) add("red", "noGround", "pins");
  }

  const license = spec.source?.license?.trim() ?? "";
  if (!license) add("yellow", "licenseMissing", "source.license");
  else if (isPersonalOnly(license)) add("yellow", "licensePersonal", "source.license");

  return { ok: !issues.some((i) => i.level === "red"), issues };
}

// --- Roles -> catalog pins ---
const BOARD_KINDS: Record<string, PinKind[]> = {
  "board-5v": ["5v"], "board-3v3": ["3v3"], "board-vin": ["vin"], "board-gnd": ["gnd"],
  "board-digital": ["digital"], "board-pwm": ["digital", "pwm"], "board-analog": ["analog", "digital"],
  "board-sda": ["digital", "sda"], "board-scl": ["digital", "scl"],
};

function acceptsOf(role: string, volts: [number, number] | undefined): PinKind[] {
  switch (role) {
    case "ground": return ["gnd"];
    case "vin": return ["vin"];
    case "power": {
      if (!volts) return ["5v", "3v3"];
      return volts[0] > 3.6 ? ["5v"] : volts[1] < 4 ? ["3v3"] : ["5v", "3v3"];
    }
    case "pwm": return ["pwm"];
    case "analog-in": return ["analog"];
    case "sda": return ["sda"];
    case "scl": return ["scl"];
    case "signal-out": return ["digital", "pwm"];
    default: return ["digital"]; // signal-in, trigger, echo, data, direction
  }
}

const CATEGORY_COLOR: Record<Category, number> = {
  boards: 0x1f6fa8, sensors: 0x1f5fbf, actuators: 0x2b5bd7, displays: 0x2e7d32, inputs: 0x1d1d1f, power: 0x1d1d1f,
};

// Four mounting holes 3 mm in from the corners when a board brings none
export function defaultHoles(size: readonly number[]): [number, number][] {
  const [w, d] = size;
  const m = Math.min(3, w / 4, d / 4);
  return [[m, m], [w - m, m], [m, d - m], [w - m, d - m]];
}

export function specToComponent(spec: ComponentSpec): Component {
  const common = {
    id: spec.id,
    category: spec.category,
    size: [...spec.size] as [number, number, number],
    color: spec.color ?? CATEGORY_COLOR[spec.category],
    source: { ...spec.source },
  };
  if (spec.kind === "board") {
    const pins: BoardPin[] = spec.pins.map((p) => ({ id: p.id, kinds: [...(p.kinds ?? BOARD_KINDS[p.role] ?? ["digital"])] }));
    return { ...common, kind: "board", pins, logic: spec.logic === 3.3 ? 3.3 : 5, budgetMa: spec.budgetMa ?? 500, holes: spec.holes?.length ? spec.holes : defaultHoles(spec.size) };
  }
  const pins: PartPin[] = spec.pins.map((p) => ({ id: p.id, accepts: [...(p.accepts ?? acceptsOf(p.role, spec.volts))], required: !p.optional }));
  const part: Component = { ...common, kind: "part", pins, mA: spec.mA };
  if (spec.volts) part.volts = [spec.volts[0], spec.volts[1]];
  if (spec.pins.some((p) => p.role === "sda" || p.role === "scl")) part.bus = "i2c";
  return part;
}

export function userEntryFor(spec: ComponentSpec, photo?: string): UserEntry {
  return { component: specToComponent(spec), name: spec.name, roles: Object.fromEntries(spec.pins.map((p) => [p.id, p.role])), ...(photo ? { photo } : {}) };
}

// --- Ids ---
export function slugId(name: string, taken: Iterable<string> = []): string {
  const base =
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28).replace(/-+$/g, "") || "pieza";
  const used = new Set(taken);
  let id = ID_PREFIX + base;
  for (let n = 2; used.has(id) || COMPONENTS.some((c) => c.id === id); n++) id = `${ID_PREFIX}${base}-${n}`;
  return id;
}

// --- Reading a ficha from anything ---
// Control characters and line breaks never belong in a ficha text: they are collapsed to a space, so a name
// cannot break out of a comment in the generated code or add lines to the text the agent reads
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const CONTROLS = new RegExp(`${CONTROL.source}+`, "g");
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(CONTROLS, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | null => (finite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function parsePin(raw: unknown): SpecPin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 12).replace(/[^A-Za-z0-9_]/g, "");
  if (!id) return null;
  const kinds = (v: unknown): PinKind[] | undefined => (Array.isArray(v) ? (v.filter((k) => typeof k === "string" && KIND_SET.has(k)) as PinKind[]) : undefined);
  const pin: SpecPin = { id, role: str(r.role, 20) };
  const label = str(r.label, 20);
  if (label && label !== id) pin.label = label;
  const accepts = kinds(r.accepts);
  const k = kinds(r.kinds);
  if (accepts?.length) pin.accepts = accepts;
  if (k?.length) pin.kinds = k;
  if (r.optional === true) pin.optional = true;
  return pin;
}

// Anything in, a ComponentSpec out (never throws). Fields it cannot read stay out of range on purpose, so
// validateSpec reports them and the person fixes them in the form instead of getting a silent default.
export function parseSpec(raw: unknown, taken: Iterable<string> = []): ComponentSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = str(r.name, SPEC_LIMITS.nameMax);
  const kind = r.kind === "board" ? "board" : "part";
  const category = (CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as Category) : kind === "board" ? "boards" : "sensors";
  const sizeRaw = Array.isArray(r.size) ? r.size.map(num) : [];
  const size = [0, 1, 2].map((i) => sizeRaw[i] ?? 0) as [number, number, number];
  const voltsRaw = Array.isArray(r.volts) ? r.volts.map(num) : [];
  const volts = voltsRaw.length === 2 && voltsRaw[0] !== null && voltsRaw[1] !== null ? ([voltsRaw[0], voltsRaw[1]] as [number, number]) : undefined;
  const srcRaw = (r.source && typeof r.source === "object" ? r.source : {}) as Record<string, unknown>;
  const spec: ComponentSpec = {
    id: typeof r.id === "string" && ID_RE.test(r.id) ? r.id : slugId(name, taken),
    name,
    desc: str(r.desc, SPEC_LIMITS.descMax),
    category,
    kind,
    size,
    pins: (Array.isArray(r.pins) ? r.pins : []).slice(0, SPEC_LIMITS.pinsMax + 1).map(parsePin).filter((p): p is SpecPin => p !== null),
    mA: num(r.mA) ?? 0,
    source: { name: str(srcRaw.name, 80), license: str(srcRaw.license, 40), url: str(srcRaw.url, 300) },
  };
  if (r.sizeEstimated === true) spec.sizeEstimated = true;
  if (volts) spec.volts = volts;
  if (kind === "board") {
    spec.logic = num(r.logic) === 3.3 ? 3.3 : 5;
    spec.budgetMa = Math.max(0, num(r.budgetMa) ?? 500);
    if (Array.isArray(r.holes)) {
      spec.holes = r.holes
        .map((h) => (Array.isArray(h) ? [num(h[0]), num(h[1])] : null))
        .filter((h): h is [number, number] => !!h && h[0] !== null && h[1] !== null)
        .slice(0, 8);
    }
  }
  const color = num(r.color);
  if (color !== null && color >= 0 && color <= 0xffffff) spec.color = Math.round(color);
  return spec;
}
