// Bridge for the Arduino lab (spec/005-arduino-lab.md), no logic: the main process (the project's lab
// folder, the app's examples, compiling with arduino-cli) and the emulator. The emulator runs in a Worker
// that says "ready" once avr8js loaded; if it cannot start (file:// rules, no vendor bundle) the same loop
// runs in the page. Without the desktop app there is no lab.
import { createEmulatorLoop } from '../models/arduino/emulatorLoop.js';

const WORKER_READY_MS = 2500;

export function createLabService({ bridge = window.platanus?.arduino ?? null } = {}) {
  let listener = () => {};
  let target = null; // { postMessage, terminate }
  let starting = null;
  const deliver = (message) => listener(message);

  function startWorker() {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(new URL('./avrWorker.js', import.meta.url), { type: 'module' });
      } catch (err) {
        reject(err);
        return;
      }
      const fail = (why) => { clearTimeout(timer); worker.terminate(); reject(new Error(why)); };
      const timer = setTimeout(() => fail('timeout'), WORKER_READY_MS);
      worker.onerror = (e) => { e.preventDefault?.(); fail('worker'); };
      worker.onmessage = (e) => {
        if (e.data?.type !== 'ready') return;
        clearTimeout(timer);
        worker.onmessage = (ev) => deliver(ev.data);
        worker.onerror = (ev) => { ev.preventDefault?.(); deliver({ type: 'error', message: 'noEmulator' }); };
        resolve({ postMessage: (m) => worker.postMessage(m), terminate: () => worker.terminate() });
      };
    });
  }

  async function startInPage() {
    const avr = await import('../vendor/avr8js.js');
    const loop = createEmulatorLoop({ avr, post: (m) => setTimeout(() => deliver(m), 0) });
    return { postMessage: (m) => loop.handle(m), terminate: () => loop.handle({ type: 'stop' }) };
  }

  function emulator() {
    if (target) return Promise.resolve(target);
    starting ??= startWorker()
      .catch(() => startInPage())
      .then((t) => (target = t))
      .catch(() => { deliver({ type: 'error', message: 'noEmulator' }); return null; })
      .finally(() => { starting = null; });
    return starting;
  }

  const send = async (message) => (await emulator())?.postMessage(message);

  return {
    available: Boolean(bridge),
    status: () => bridge.status(),
    project: () => bridge.project(),
    example: (id) => bridge.example(id),
    compile: (req) => bridge.compile(req),
    onMessage(fn) { listener = fn; },
    load: (hex, diagram) => send({ type: 'load', hex, diagram }),
    start: () => send({ type: 'start' }),
    stop: () => target?.postMessage({ type: 'stop' }),
    setDistance: (id, cm) => target?.postMessage({ type: 'distance', id, cm }),
    sendSerial: (text) => target?.postMessage({ type: 'serial', text }),
    dispose() { target?.terminate(); target = null; },
  };
}
