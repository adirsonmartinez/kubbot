// The Arduino lab's screen state (spec/005-arduino-lab.md): which lab is open (a folder of the project
// with diagram.json, or an example of the app), its circuit and the rules' issues, the emulator's state
// (empty, loading, ready, compiling, running, error), what each part shows, the serial monitor and the
// obstacle in front of the HC-SR04. No DOM: the bench in 3D and the card draw this store.
import { Observable } from '../core/observable.js';
import { parseDiagram, parseLab, boardOf } from '../models/arduino/circuit.js';
import { validate, hasErrors } from '../models/arduino/validate.js';
import { ULTRASONIC } from '../models/arduino/peripherals.js';

export const EXAMPLE_ID = 'sensor-proximidad';
const MAX_LINES = 60;
const COMPILE_ERRORS = ['noCli', 'noCore', 'compile', 'timeout', 'unsafe'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const unwrap = (res) => (res && typeof res === 'object' && 'ok' in res && 'data' in res ? res.data : res);

export class LabViewModel {
  #service;
  #diagram = null; // the diagram.json object, for the emulator
  #hex = null;
  #compileReq = null;
  #pending = ''; // serial text after the last newline

  store = new Observable({
    available: false, status: 'empty', error: null, errorLines: [], source: null, exampleId: null,
    title: '', lab: null, board: null, emulated: false, parts: [], wires: [], issues: [],
    live: {}, serial: [], distance: {}, speed: null, selected: null, version: 0,
  });

  constructor({ service }) {
    this.#service = service;
    service.onMessage?.((m) => this.#onEmulator(m));
  }

  get #s() {
    return this.store.state;
  }

  // A project opened or its files changed: the first folder with a diagram.json becomes the lab
  async refresh() {
    if (!this.#service.available) return;
    let data = null;
    try {
      data = unwrap(await this.#service.project());
    } catch {
      data = null;
    }
    if (!data?.diagram) {
      if (this.#s.source === 'project') this.#reset();
      return;
    }
    this.#load('project', data);
  }

  // The example that ships with the app (the scripted chat opens it too)
  async openExample(id = EXAMPLE_ID) {
    if (!this.#service.available) return this.store.set({ available: true, status: 'error', error: 'desktopOnly' });
    this.store.set({ available: true, status: 'loading', error: null });
    try {
      const data = unwrap(await this.#service.example(id));
      if (!data?.diagram) throw new Error('example');
      this.#load('example', { ...data, id });
    } catch {
      this.store.set({ status: 'error', error: 'failed' });
    }
  }

  #load(source, data) {
    this.stop();
    const circuit = parseDiagram(data.diagram);
    if (circuit.invalid) return this.store.set({ available: true, status: 'error', error: 'failed', source });
    const lab = parseLab(data.lab ?? {});
    const board = boardOf(circuit);
    const distance = {};
    for (const p of circuit.parts) if (p.spec?.kind === 'ultrasonic') distance[p.id] = clamp(Number(p.attrs.distance) || 100, ULTRASONIC.minCm, ULTRASONIC.maxCm);
    this.#diagram = typeof data.diagram === 'string' ? JSON.parse(data.diagram) : data.diagram;
    this.#hex = data.hexStale ? null : data.hex ?? null;
    const fqbn = board?.spec?.fqbn;
    this.#compileReq = source === 'example' ? { example: data.id, board: fqbn } : data.sketchPath ? { path: data.sketchPath, board: fqbn } : null;
    this.#pending = '';
    this.store.set({
      available: true, status: 'ready', error: null, errorLines: [], source, exampleId: source === 'example' ? data.id : null,
      title: lab.title || data.id || data.dir || '', lab, board: board?.spec?.key ?? null, emulated: Boolean(board?.spec?.emulated),
      parts: circuit.parts.map((p) => ({ id: p.id, type: p.type, key: p.spec?.key ?? 'unknown', kind: p.spec?.kind ?? 'unknown', attrs: p.attrs, pins: p.spec?.pins ?? [], top: p.top, left: p.left })),
      wires: circuit.wires, issues: validate(circuit), live: {}, serial: [], distance, speed: null, selected: null,
      version: this.#s.version + 1,
    });
  }

  #reset() {
    this.stop();
    this.#diagram = this.#hex = this.#compileReq = null;
    this.store.set({ available: false, status: 'empty', error: null, errorLines: [], source: null, exampleId: null, title: '', lab: null, board: null, emulated: false, parts: [], wires: [], issues: [], live: {}, serial: [], distance: {}, speed: null, selected: null, version: this.#s.version + 1 });
  }

  // «Probar»: compile if there is no fresh .hex, then run it in the emulator
  async run() {
    const st = this.#s;
    if (!this.#diagram || st.status === 'running' || st.status === 'compiling') return;
    if (hasErrors(st.issues)) return this.store.set({ status: 'error', error: 'hasErrors' });
    if (!st.emulated) return this.store.set({ status: 'error', error: 'notEmulated' });
    if (!this.#hex) {
      if (!this.#compileReq) return this.store.set({ status: 'error', error: 'compile', errorLines: [] });
      this.store.set({ status: 'compiling', error: null, errorLines: [] });
      let result;
      try {
        result = unwrap(await this.#service.compile(this.#compileReq));
      } catch {
        result = null;
      }
      if (!result?.ok) {
        const error = COMPILE_ERRORS.includes(result?.error) ? result.error : 'failed';
        return this.store.set({ status: 'error', error, errorLines: result?.lines ?? [] });
      }
      this.#hex = result.hex;
    }
    this.store.set({ status: 'running', error: null, errorLines: [], serial: [], speed: null });
    this.#pending = '';
    await this.#service.load(this.#hex, this.#diagram);
    for (const [id, cm] of Object.entries(this.#s.distance)) this.#service.setDistance(id, cm);
    await this.#service.start();
  }

  stop() {
    if (this.#s.status === 'running') {
      this.#service.stop?.();
      this.store.set({ status: 'ready' });
    }
  }

  #onEmulator(m) {
    if (m?.type === 'error') {
      const error = m.message === 'noEmulator' ? 'noEmulator' : /not emulated/.test(m.message ?? '') ? 'notEmulated' : 'failed';
      return this.store.set({ status: 'error', error });
    }
    if (m?.type !== 'state' && m?.type !== 'loaded') return;
    if (this.#s.status !== 'running') return;
    const patch = { live: m.state?.parts ?? {} };
    if (Number.isFinite(m.speed)) patch.speed = m.speed;
    const text = m.state?.serial ?? '';
    if (text) {
      const lines = (this.#pending + text).split('\n');
      this.#pending = lines.pop().slice(-200);
      patch.serial = [...this.#s.serial, ...lines.map((l) => l.replace(/\r$/, ''))].slice(-MAX_LINES);
    }
    this.store.set(patch);
  }

  // The obstacle in front of an HC-SR04 (the first one when no id is given)
  setDistance(cm, id = Object.keys(this.#s.distance)[0]) {
    if (!id || !(id in this.#s.distance)) return;
    const value = Math.round(clamp(Number(cm) || 0, ULTRASONIC.minCm, ULTRASONIC.maxCm));
    this.store.set({ distance: { ...this.#s.distance, [id]: value } });
    this.#service.setDistance?.(id, value);
  }

  nudge(deltaCm) {
    const id = Object.keys(this.#s.distance)[0];
    if (id) this.setDistance(this.#s.distance[id] + deltaCm, id);
  }

  select(id) {
    this.store.set({ selected: this.#s.parts.some((p) => p.id === id) ? id : null });
  }

  // Clicks in the 3D bench (with the mouse or the hand's cursor)
  handlePick(pick) {
    if (pick?.type === 'lab-part') this.select(pick.id);
    else if (pick?.type === 'lab-ruler') this.setDistance(pick.cm, pick.id);
  }

  escape() {
    this.select(null);
  }

  // The project closed: its lab goes away (an open example stays until another project opens)
  projectClosed() {
    if (this.#s.source === 'project') this.#reset();
    else this.stop();
  }
}
