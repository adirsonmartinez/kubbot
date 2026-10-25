// The lab's simulation: what every part is doing and how much flows on every wire at a given time.
// Pure and deterministic: no Math.random, no Date; everything is a function of the design and tMs, so the
// same design at the same time gives the same picture (the view model passes the clock in).
//
// A part is "dead" (drawn at rest, wires to it dark) when it cannot work: a required pin does not reach a
// board, or the checker found a wiring fault on it (missing, wrongPin, under/overvoltage, a short). Softer
// warnings (pinShared, level, budget) do not stop it. A board that sits on a shorted net stops running.
//
// The "program" the parts run is the same one sketch.ts writes as Arduino code:
//   - triggers: a distance sensor closer than NEAR_CM, a PIR that sees movement, a pressed button
//   - LED, buzzer and relay follow the triggers when there is a sensor or button, and blink by themselves
//     when there is none
//   - the servo follows the distance, else sweeps; the motor follows the knob, else the distance, else cruises
//   - a display shows the distance, else the climate, else a greeting with the seconds

import { componentOf, isUserComponent } from "./catalog.ts";
import { RESISTOR, checkDesign, netsOf, reachOf, type Check, type Design, type IssueKey } from "./circuit.ts";
import { wireKind } from "./layout.ts";

export const NEAR_CM = 20;
export const SIM_KINDS = Object.freeze({
  board: "board",
  distance: "distance",
  motion: "motion",
  climate: "climate",
  soil: "soil",
  light: "light",
  button: "button",
  knob: "knob",
  led: "led",
  servo: "servo",
  buzzer: "buzzer",
  relay: "relay",
  display: "display",
  motors: "motors",
  battery: "battery",
  generic: "generic", // a part the person imported: alive or dead, nothing more
});

export type SimKind = (typeof SIM_KINDS)[keyof typeof SIM_KINDS] | "unknown";

// Live states carry `dead?: false` so a consumer can test `state.dead` on the union.
type Live<T> = T & { dead?: false };
export type SimState =
  | { kind: SimKind; dead: true }
  | Live<{ kind: "board"; running: boolean }>
  | Live<{ kind: "distance"; cm: number }>
  | Live<{ kind: "motion"; detected: boolean }>
  | Live<{ kind: "climate"; c: number; h: number }>
  | Live<{ kind: "soil"; percent: number }>
  | Live<{ kind: "light"; percent: number }>
  | Live<{ kind: "button"; pressed: boolean }>
  | Live<{ kind: "knob"; percent: number }>
  | Live<{ kind: "led"; on: boolean }>
  | Live<{ kind: "servo"; angle: number }>
  | Live<{ kind: "buzzer"; on: boolean }>
  | Live<{ kind: "relay"; on: boolean }>
  | Live<{ kind: "display"; lines: [string, string] }>
  | Live<{ kind: "motors"; speed: number }>
  | Live<{ kind: "battery"; on: boolean }>
  | Live<{ kind: "generic"; on: boolean }>;

export type SimResult = { parts: Record<string, SimState>; wires: Record<string, number> };

// --- Deterministic waves (all safe for negative time) ---
const mod = (a: number, n: number) => ((a % n) + n) % n;
const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const waveSin = (t: number, period: number, min: number, max: number) => min + ((max - min) * (1 + Math.sin((2 * Math.PI * mod(t, period)) / period))) / 2;
const waveTri = (t: number, period: number, min: number, max: number) => {
  const p = mod(t, period) / period;
  return min + (p < 0.5 ? p * 2 : 2 - p * 2) * (max - min);
};
const mapRange = (v: number, a: number, b: number, c: number, d: number) => c + Math.max(0, Math.min(1, (v - a) / (b - a))) * (d - c);

// What the world looks like at tMs: the same numbers feed the sensors and whoever reads them.
export function worldAt(tMs: number) {
  return {
    distanceCm: waveSin(tMs, 6000, 5, 60),
    tempC: round1(waveSin(tMs, 30000, 22, 28)),
    hum: round1(waveSin(tMs + 5000, 40000, 40, 60)),
    knob: round1(waveTri(tMs, 15000, 0, 100)),
    soil: round1(waveTri(tMs, 20000, 10, 90)),
    light: round1(waveTri(tMs, 25000, 5, 95)),
    pressed: mod(tMs, 3000) < 500,
    motion: mod(tMs, 7000) < 2000,
  };
}

// --- Which parts can work ---
type Analysis = { dead: Set<string>; shorted: Set<string> };
const FATAL: ReadonlySet<IssueKey> = new Set(["missing", "wrongPin", "undervoltage", "overvoltage", "short", "mixedPower"]);
const analysisCache = new WeakMap<Design, Analysis>(); // designs are never mutated, so one analysis per design

function analyze(design: Design, check: Check): Analysis {
  const hit = analysisCache.get(design);
  if (hit) return hit;
  const nets = netsOf(design);
  const typeOf = new Map(design.parts.map((p) => [p.id, p.type]));
  const isBoard = (id: string) => componentOf(typeOf.get(id))?.kind === "board";
  const dead = new Set<string>();
  const shorted = new Set<string>(); // boards on a shorted net
  const kill = (id: string) => (isBoard(id) ? shorted.add(id) : dead.add(id));

  for (const issue of check.issues) {
    if (!FATAL.has(issue.key) || !issue.part) continue;
    if (issue.key === "short" || issue.key === "mixedPower") {
      // The whole net is in trouble, whichever pin the checker named first
      for (const m of nets.get(`${issue.part}:${issue.pin}`) ?? [{ part: issue.part, pin: issue.pin ?? "" }]) kill(m.part);
    } else kill(issue.part);
  }
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (!spec || spec.kind !== "part") continue;
    const reaches = spec.pins
      .filter((pin) => pin.required)
      .every((pin) => reachOf(design, { part: part.id, pin: pin.id }, nets).some((m) => isBoard(m.part)));
    if (!reaches) dead.add(part.id);
  }
  const result = { dead, shorted };
  analysisCache.set(design, result);
  return result;
}

// Ids of the parts that cannot work (the sketch leaves them out too)
export function deadParts(design: Design): Set<string> {
  return analyze(design, checkDesign(design)).dead;
}

const dead = (kind: SimKind): SimState => ({ kind, dead: true });

export function simulate(design: Design, tMs: number): SimResult {
  const check = checkDesign(design);
  const { dead: deadSet, shorted } = analyze(design, check);
  const world = worldAt(tMs);
  const result: SimResult = { parts: {}, wires: {} };
  const alive = (id: string) => !deadSet.has(id) && !shorted.has(id);

  // What is around: only working sensors and buttons count
  const types = new Set(design.parts.filter((p) => alive(p.id)).map((p) => p.type));
  const hasDistance = types.has("hc-sr04");
  const hasMotion = types.has("pir");
  const hasButton = types.has("button");
  const hasClimate = types.has("dht22");
  const hasKnob = types.has("potentiometer");
  const near = hasDistance && world.distanceCm < NEAR_CM;
  const triggered = near || (hasMotion && world.motion) || (hasButton && world.pressed);
  const controlled = hasDistance || hasMotion || hasButton;

  const stateOf = (type: string): SimState => {
    switch (type) {
      case "led": return { kind: "led", on: controlled ? triggered : mod(tMs, 1000) < 500 };
      case "buzzer": return { kind: "buzzer", on: controlled ? triggered : mod(tMs, 1000) < 150 };
      case "relay": return { kind: "relay", on: controlled ? triggered : mod(tMs, 2000) < 1000 };
      case "servo-sg90": return { kind: "servo", angle: hasDistance ? mapRange(world.distanceCm, 5, 60, 0, 180) : waveTri(tMs, 4000, 0, 180) };
      case "hc-sr04": return { kind: "distance", cm: world.distanceCm };
      case "pir": return { kind: "motion", detected: world.motion };
      case "dht22": return { kind: "climate", c: world.tempC, h: world.hum };
      case "soil": return { kind: "soil", percent: world.soil };
      case "ldr": return { kind: "light", percent: world.light };
      case "button": return { kind: "button", pressed: world.pressed };
      case "potentiometer": return { kind: "knob", percent: world.knob };
      case "oled-128x64":
      case "lcd-1602-i2c": {
        if (hasDistance) return { kind: "display", lines: [`Dist: ${Math.round(world.distanceCm)} cm`, ""] };
        if (hasClimate) return { kind: "display", lines: [`${world.tempC.toFixed(1)}°C`, `H: ${world.hum.toFixed(1)}%`] };
        return { kind: "display", lines: ["¡Hola!", `${Math.floor(Math.max(0, tMs) / 1000)} s`] };
      }
      case "l298n": {
        const speed = hasKnob ? world.knob / 100 : hasDistance ? 1 - mapRange(world.distanceCm, 5, 60, 0, 1) : 0.6;
        return { kind: "motors", speed: Math.max(0, Math.min(1, speed)) };
      }
      case "battery-aa4": return { kind: "battery", on: true };
      default: return { kind: "generic", on: true }; // imported parts: we do not know what they do, only that they are powered
    }
  };
  const deadKind: Record<string, SimKind> = {
    led: "led", "servo-sg90": "servo", "hc-sr04": "distance", pir: "motion", dht22: "climate", soil: "soil", ldr: "light",
    buzzer: "buzzer", relay: "relay", "oled-128x64": "display", "lcd-1602-i2c": "display", button: "button",
    potentiometer: "knob", l298n: "motors", "battery-aa4": "battery", [RESISTOR]: "generic",
  };

  for (const p of design.parts) {
    const spec = componentOf(p.type);
    if (!spec) result.parts[p.id] = dead("unknown");
    else if (spec.kind === "board") result.parts[p.id] = { kind: "board", running: !shorted.has(p.id) };
    else result.parts[p.id] = alive(p.id) ? stateOf(p.type) : dead(deadKind[p.type] ?? (isUserComponent(p.type) ? "generic" : "unknown"));
  }

  // Wires: power and ground carry a steady 1 while both ends work; signals and the bus pulse
  let signalIndex = 0;
  for (const w of design.wires) {
    const kind = wireKind(design, w);
    const index = kind === "power" || kind === "gnd" ? 0 : signalIndex++;
    const live = alive(w.from.part) && alive(w.to.part);
    if (!live) result.wires[w.id] = 0;
    else if (kind === "power" || kind === "gnd") result.wires[w.id] = 1;
    else {
      const period = kind === "bus" ? 350 : 600;
      result.wires[w.id] = round3(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (mod(tMs, period) / period + index * 0.3))));
    }
  }
  return result;
}
