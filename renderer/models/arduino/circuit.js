// A lab project (spec/005-arduino-lab.md) = diagram.json + lab.json + a sketch.
//   · diagram.json is Wokwi's format: { version, parts: [{ type, id, top, left, attrs }],
//     connections: [["uno:13", "r1:1", "green", []], …] }. It may come from an agent, so everything is
//     checked and capped; an unknown part is kept (validate.js says so), a bad entry is dropped.
//   · lab.json is Qubbot's: what the agent explains (level, goal, components, steps, cautions, sources).
// The parts' pins joined by wires make nets; the board's GND pins are one net (they are inside the board).
import { partOf, isGroundPin } from './parts.js';

const MAX_PARTS = 60;
const MAX_WIRES = 240;
const MAX_TEXT = 300;
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const PIN = /^[A-Za-z0-9.+\-]{1,12}$/;
export const LEVELS = ['principiante', 'intermedio', 'avanzado'];

const text = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// "uno:13" -> { part: 'uno', pin: '13' } or null
export function endpoint(value) {
  if (typeof value !== 'string') return null;
  const i = value.indexOf(':');
  if (i < 1) return null;
  const part = value.slice(0, i), pin = value.slice(i + 1);
  return ID.test(part) && PIN.test(pin) ? { part, pin } : null;
}
const key = (e) => `${e.part}:${e.pin}`;

// json: object or string -> { parts, wires, dropped } (dropped: how many entries were not usable)
export function parseDiagram(json) {
  let d = json;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return { parts: [], wires: [], dropped: 0, invalid: true }; }
  }
  if (!d || typeof d !== 'object') return { parts: [], wires: [], dropped: 0, invalid: true };
  let dropped = 0;
  const parts = [];
  const ids = new Set();
  for (const p of Array.isArray(d.parts) ? d.parts.slice(0, MAX_PARTS) : []) {
    const id = text(p?.id, 32), type = text(p?.type, 48);
    if (!ID.test(id) || !type || ids.has(id)) { dropped++; continue; }
    ids.add(id);
    const attrs = {};
    for (const [k, v] of Object.entries(p.attrs ?? {}).slice(0, 12)) if (/^\w{1,24}$/.test(k)) attrs[k] = text(String(v), 40);
    parts.push({ id, type, spec: partOf(type), attrs, top: num(p.top), left: num(p.left) });
  }
  const wires = [];
  for (const c of Array.isArray(d.connections) ? d.connections.slice(0, MAX_WIRES) : []) {
    const from = endpoint(c?.[0]), to = endpoint(c?.[1]);
    if (!from || !to || !ids.has(from.part) || !ids.has(to.part)) { dropped++; continue; }
    wires.push({ from, to, color: text(c[2], 16) || 'green' });
  }
  return { parts, wires, dropped };
}

// The nets: every pin joined to others by wires (union-find); the board's GND pins are joined too
export function buildNets(circuit) {
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    parent.set(k, r);
    return r;
  };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of circuit.parts) {
    if (p.spec?.kind !== 'board') continue;
    const grounds = p.spec.pins.filter(isGroundPin).map((pin) => key({ part: p.id, pin }));
    grounds.forEach((g) => join(g, grounds[0]));
  }
  for (const w of circuit.wires) join(key(w.from), key(w.to));
  const nets = new Map(); // root -> [{ part, pin }]
  for (const k of parent.keys()) {
    const r = find(k);
    const i = k.indexOf(':');
    if (!nets.has(r)) nets.set(r, []);
    nets.get(r).push({ part: k.slice(0, i), pin: k.slice(i + 1) });
  }
  return { of: (part, pin) => (parent.has(`${part}:${pin}`) ? nets.get(find(`${part}:${pin}`)) : [{ part, pin }]), all: [...nets.values()] };
}

export const boardOf = (circuit) => circuit.parts.find((p) => p.spec?.kind === 'board') ?? null;

// The board pins on the same net as `part:pin` (e.g. which Arduino pin drives an LED)
export function boardPinsOn(circuit, nets, part, pin) {
  const b = boardOf(circuit);
  if (!b) return [];
  return nets.of(part, pin).filter((e) => e.part === b.id).map((e) => e.pin);
}

// The board pins that drive `part:pin`, directly or through one resistor (an LED's series resistor)
export function drivingPins(circuit, nets, part, pin) {
  const b = boardOf(circuit);
  if (!b) return [];
  const kinds = new Map(circuit.parts.map((p) => [p.id, p.spec?.kind]));
  const out = new Set();
  for (const e of nets.of(part, pin)) {
    if (e.part === b.id) out.add(e.pin);
    else if (kinds.get(e.part) === 'resistor') {
      for (const f of nets.of(e.part, e.pin === '1' ? '2' : '1')) if (f.part === b.id) out.add(f.pin);
    }
  }
  return [...out];
}

// lab.json -> what the card and the agent show; unknown keys are ignored, texts capped
export function parseLab(json) {
  let l = json;
  if (typeof l === 'string') {
    try { l = JSON.parse(l); } catch { l = {}; }
  }
  l = l && typeof l === 'object' ? l : {};
  const list = (v, max = 20) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    title: text(l.title, 80),
    level: LEVELS.includes(l.level) ? l.level : 'principiante',
    goal: text(l.goal),
    components: list(l.components, 30).map((c) => ({ name: text(c?.name, 60), qty: Math.max(1, Math.min(99, Math.round(num(c?.qty) || 1))), why: text(c?.why, 160) })).filter((c) => c.name),
    steps: list(l.steps).map((s) => text(s)).filter(Boolean),
    cautions: list(l.cautions, 10).map((s) => text(s)).filter(Boolean),
    // Only https links; verified says whether the agent checked it (platanus_github_repo)
    sources: list(l.sources, 10).map((s) => ({ url: /^https:\/\/[^\s]+$/.test(s?.url ?? '') ? text(s.url, 200) : '', license: text(s?.license, 40), verified: s?.verified === true })).filter((s) => s.url),
  };
}
