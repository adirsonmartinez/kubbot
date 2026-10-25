// The Arduino emulator (spec/005-arduino-lab.md): an ATmega328P (Uno, Nano) running a compiled sketch,
// with its pins wired to the circuit's parts. The CPU is avr8js (Wokwi, MIT), passed in as `avr` so the
// same code runs in the app's Worker (renderer/vendor/avr8js.js), in the main process for the agent's
// tests (node_modules) and with a fake in unit tests. Only pin changes and serial text come out.
import { parseIntelHex, toProgram, FLASH_328P } from './intelHex.js';
import { buildNets, boardOf, drivingPins } from './circuit.js';
import { ATMEGA328P_PINS } from './parts.js';
import { F_CPU, Ultrasonic, FrequencyMeter, DutyMeter, ServoMeter } from './peripherals.js';

const MAX_SERIAL = 4000; // characters kept until the next read

export class ArduinoEmulator {
  #avr;
  #cpu;
  #ports = {};
  #usart;
  #devices = [];
  #watch = { B: new Map(), C: new Map(), D: new Map() }; // port -> bit -> [handlers]
  #last = { B: 0, C: 0, D: 0 }; // last seen output levels, one bit per pin
  #events = []; // [{ at, run }] sorted by cycle
  #serial = '';
  #ultrasonic = new Map(); // part id -> Ultrasonic

  // circuit: circuit.parseDiagram(); hex: the sketch's Intel HEX text
  constructor({ avr, hex, circuit }) {
    const board = boardOf(circuit);
    if (!board) throw new Error('emulator: no board');
    if (!board.spec.emulated) throw new Error('emulator: board not emulated');
    this.#avr = avr;
    const { bytes } = parseIntelHex(hex, FLASH_328P);
    this.#cpu = new avr.CPU(toProgram(bytes));
    new avr.AVRTimer(this.#cpu, avr.timer0Config); // millis(), delay()
    new avr.AVRTimer(this.#cpu, avr.timer1Config); // Servo
    new avr.AVRTimer(this.#cpu, avr.timer2Config); // tone()
    for (const name of ['B', 'C', 'D']) {
      const port = new avr.AVRIOPort(this.#cpu, avr[`port${name}Config`]);
      port.addListener(() => this.#onPort(name));
      this.#ports[name] = port;
    }
    this.#usart = new avr.AVRUSART(this.#cpu, avr.usart0Config, F_CPU);
    this.#usart.onByteTransmit = (byte) => {
      this.#serial += String.fromCharCode(byte);
      if (this.#serial.length > MAX_SERIAL) this.#serial = this.#serial.slice(-MAX_SERIAL);
    };
    this.#wire(circuit, board);
  }

  get cycles() {
    return this.#cpu.cycles;
  }

  get seconds() {
    return this.#cpu.cycles / F_CPU;
  }

  // Which board pin each part's pin is on, and what listens to it
  #wire(circuit, board) {
    const nets = buildNets(circuit);
    // Directly or through a series resistor
    const boardPin = (part, pin) => drivingPins(circuit, nets, part, pin).find((p) => ATMEGA328P_PINS[p]) ?? null;
    for (const p of circuit.parts) {
      const kind = p.spec?.kind;
      if (kind === 'led') {
        const pin = boardPin(p.id, 'A');
        if (!pin) continue;
        const meter = new DutyMeter();
        this.#listen(pin, (level, cycles) => meter.update(level, cycles));
        this.#devices.push({ id: p.id, kind, pin, read: (c) => { const d = meter.read(c); return { on: d > 0.02, brightness: d }; } });
      } else if (kind === 'buzzer') {
        const pin = boardPin(p.id, '1') ?? boardPin(p.id, '2');
        if (!pin) continue;
        const meter = new FrequencyMeter();
        this.#listen(pin, (level, cycles) => meter.update(level, cycles));
        this.#devices.push({ id: p.id, kind, pin, read: (c) => ({ hz: meter.hz(c) }) });
      } else if (kind === 'ultrasonic') {
        const trig = boardPin(p.id, 'TRIG'), echo = boardPin(p.id, 'ECHO');
        const sensor = new Ultrasonic({ distanceCm: Number(p.attrs.distance) || 100 });
        this.#ultrasonic.set(p.id, sensor);
        if (trig && echo) {
          this.#listen(trig, (level, cycles) => {
            const pulse = sensor.trig(level, cycles);
            if (!pulse) return;
            this.#at(pulse.start, () => this.#setInput(echo, true));
            this.#at(pulse.end, () => this.#setInput(echo, false));
          });
        }
        this.#devices.push({ id: p.id, kind, read: () => ({ distanceCm: sensor.distanceCm }) });
      } else if (kind === 'servo') {
        const pin = boardPin(p.id, 'PWM');
        if (!pin) continue;
        const meter = new ServoMeter();
        this.#listen(pin, (level, cycles) => meter.update(level, cycles));
        this.#devices.push({ id: p.id, kind, pin, read: () => ({ angle: meter.angle }) });
      }
    }
  }

  #listen(pin, handler) {
    const where = ATMEGA328P_PINS[pin];
    if (!where) return;
    const list = this.#watch[where.port].get(where.bit) ?? [];
    list.push(handler);
    this.#watch[where.port].set(where.bit, list);
  }

  // A port changed: tell each watched pin whose level changed
  #onPort(name) {
    const port = this.#ports[name];
    const high = this.#avr.PinState.High;
    let levels = 0;
    for (const bit of this.#watch[name].keys()) if (port.pinState(bit) === high) levels |= 1 << bit;
    const changed = levels ^ this.#last[name];
    if (!changed) return;
    this.#last[name] = levels;
    const cycles = this.#cpu.cycles;
    for (const [bit, handlers] of this.#watch[name]) {
      if (changed & (1 << bit)) for (const h of handlers) h(Boolean(levels & (1 << bit)), cycles);
    }
  }

  #setInput(pin, level) {
    const where = ATMEGA328P_PINS[pin];
    if (where) this.#ports[where.port].setPin(where.bit, level);
  }

  #at(at, run) {
    let i = this.#events.length;
    while (i > 0 && this.#events[i - 1].at > at) i--;
    this.#events.splice(i, 0, { at, run });
  }

  // Runs the CPU for `cycles` (16 000 = 1 ms of the board's time)
  run(cycles) {
    const cpu = this.#cpu, avr = this.#avr, events = this.#events;
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      avr.avrInstruction(cpu);
      cpu.tick();
      while (events.length && cpu.cycles >= events[0].at) events.shift().run();
    }
  }

  setDistance(id, cm) {
    this.#ultrasonic.get(id)?.setDistance(cm);
  }

  // Characters sent to the board's RX (the HC-05 or the serial monitor)
  sendSerial(textIn) {
    for (const ch of String(textIn).slice(0, 64)) this.#usart.writeByte?.(ch.charCodeAt(0) & 0xff);
  }

  // What the parts show now, and the serial text since the last read
  read() {
    const cycles = this.#cpu.cycles;
    const parts = {};
    for (const d of this.#devices) parts[d.id] = d.read(cycles);
    const serial = this.#serial;
    this.#serial = '';
    return { cycles, seconds: cycles / F_CPU, parts, serial };
  }
}
