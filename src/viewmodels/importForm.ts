// The import form's state as the person types it (numbers as text, so an empty field stays empty) and the
// two-way conversion with the ficha. Pure: the view model owns the state, this file only converts.
// Relative imports with the .ts extension so the tests can run it.

import { CATEGORIES, type Category } from "../models/lab/catalog.ts";
import { BOARD_ROLE_IDS, ID_PREFIX, slugId, type ComponentSpec, type SpecPin } from "../models/lab/componentSpec.ts";
import { PART_ROLE_IDS } from "../models/lab/guide.ts";

export type Form = {
  name: string;
  desc: string;
  kind: "part" | "board";
  category: Category;
  size: [string, string, string];
  sizeEstimated: boolean;
  volts: [string, string];
  mA: string;
  logic: "3.3" | "5";
  pins: SpecPin[];
  sourceName: string;
  license: string;
  color: number | null;
};

export const emptyForm = (): Form => ({
  name: "", desc: "", kind: "part", category: "sensors", size: ["", "", ""], sizeEstimated: false, volts: ["", ""], mA: "", logic: "5",
  pins: [
    { id: "VCC", role: "power" },
    { id: "GND", role: "ground" },
    { id: "SIG", role: "signal-in" },
  ],
  sourceName: "", license: "", color: null,
});

const text = (n: number | undefined): string => (n === undefined || !Number.isFinite(n) || n === 0 ? "" : String(Math.round(n * 100) / 100));
const read = (s: string): number => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : Number.NaN;
};

export function specToForm(spec: ComponentSpec): Form {
  return {
    name: spec.name, desc: spec.desc, kind: spec.kind, category: spec.category,
    size: [text(spec.size[0]), text(spec.size[1]), text(spec.size[2])], sizeEstimated: !!spec.sizeEstimated,
    volts: [spec.volts ? String(spec.volts[0]) : "", spec.volts ? String(spec.volts[1]) : ""],
    mA: spec.mA ? String(spec.mA) : "", logic: spec.logic === 3.3 ? "3.3" : "5",
    pins: spec.pins.map((p) => ({ ...p })), sourceName: spec.source.name, license: spec.source.license, color: spec.color ?? null,
  };
}

// The ficha the form describes. A blank number is NaN (the validator reports it); blank volts mean "no supply range".
export function formToSpec(form: Form, taken: Iterable<string> = []): ComponentSpec {
  const volts: [number, number] | undefined = form.volts[0].trim() === "" && form.volts[1].trim() === "" ? undefined : [read(form.volts[0]), read(form.volts[1])];
  const spec: ComponentSpec = {
    id: slugId(form.name, taken),
    name: form.name.trim(),
    desc: form.desc.trim(),
    category: form.kind === "board" ? "boards" : form.category,
    kind: form.kind,
    size: [read(form.size[0]), read(form.size[1]), read(form.size[2])],
    pins: form.pins.map((p) => ({ ...p })),
    mA: form.mA.trim() === "" ? 0 : read(form.mA),
    source: { name: form.sourceName.trim(), license: form.license.trim(), url: "" },
  };
  if (form.sizeEstimated) spec.sizeEstimated = true;
  if (form.kind === "part" && volts) spec.volts = volts;
  if (form.kind === "board") spec.logic = form.logic === "3.3" ? 3.3 : 5;
  if (form.color !== null) spec.color = form.color;
  return spec;
}

// --- Roles and categories for each kind ---
export const rolesFor = (kind: Form["kind"]): readonly string[] => (kind === "board" ? BOARD_ROLE_IDS : PART_ROLE_IDS);
export const categoriesFor = (kind: Form["kind"]): readonly Category[] => (kind === "board" ? ["boards"] : CATEGORIES.filter((c) => c !== "boards"));

const TO_BOARD: Record<string, string> = {
  power: "board-5v", ground: "board-gnd", vin: "board-vin", pwm: "board-pwm", "analog-in": "board-analog", sda: "board-sda", scl: "board-scl",
};
// A pin's role after the part turns into a board or back (what it means stays the closest it can)
export function convertRole(role: string, to: Form["kind"]): string {
  if (to === "board") return (BOARD_ROLE_IDS as readonly string[]).includes(role) ? role : (TO_BOARD[role] ?? "board-digital");
  if (!(BOARD_ROLE_IDS as readonly string[]).includes(role)) return role;
  const back = Object.entries(TO_BOARD).find(([, v]) => v === role)?.[0];
  return back ?? "signal-in";
}

// A pin name that is not taken yet: PIN1, PIN2...
export function freshPinId(pins: readonly SpecPin[], base = "PIN"): string {
  const used = new Set(pins.map((p) => p.id));
  for (let n = 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

export { ID_PREFIX };
