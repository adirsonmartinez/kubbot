// Runs the emulator in real time (spec/005-arduino-lab.md): every ~33 ms it emulates the time that passed
// (at most 100 ms, so a slow computer falls behind instead of freezing) and posts what the parts show.
// The same loop runs in the Worker (services/avrWorker.js) and, if a Worker cannot start, in the page.
// Messages in: load { hex, diagram }, start, stop, distance { id, cm }, serial { text }.
// Messages out: loaded { parts }, state { state, speed }, error { message }.
import { ArduinoEmulator } from './emulator.js';
import { parseDiagram } from './circuit.js';
import { F_CPU } from './peripherals.js';

const SLICE_MS = 33;
const MAX_STEP_MS = 100;

export function createEmulatorLoop({ avr, post, now = () => performance.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id) }) {
  let emu = null, running = false, timer = null, last = 0, wall = 0, simulated = 0;

  function tick() {
    if (!running || !emu) return;
    const t = now();
    const dt = Math.min(MAX_STEP_MS, t - last);
    last = t;
    try {
      emu.run(Math.round((dt / 1000) * F_CPU));
    } catch (err) {
      running = false;
      post({ type: 'error', message: err.message });
      return;
    }
    const spent = now() - t;
    simulated += dt;
    wall += Math.max(dt, spent);
    post({ type: 'state', state: emu.read(), speed: wall ? Math.min(1, simulated / wall) : 1 });
    timer = schedule(tick, Math.max(0, SLICE_MS - spent));
  }

  function stop() {
    running = false;
    if (timer !== null) cancel(timer);
    timer = null;
  }

  return {
    handle(msg) {
      switch (msg?.type) {
        case 'load':
          stop();
          try {
            emu = new ArduinoEmulator({ avr, hex: msg.hex, circuit: parseDiagram(msg.diagram) });
            post({ type: 'loaded', state: emu.read() });
          } catch (err) {
            emu = null;
            post({ type: 'error', message: err.message });
          }
          break;
        case 'start':
          if (!emu || running) break;
          running = true;
          last = now();
          wall = simulated = 0;
          timer = schedule(tick, 0);
          break;
        case 'stop':
          stop();
          break;
        case 'distance':
          emu?.setDistance(msg.id, msg.cm);
          break;
        case 'serial':
          emu?.sendSerial(msg.text);
          break;
        default:
      }
    },
    get running() {
      return running;
    },
  };
}
