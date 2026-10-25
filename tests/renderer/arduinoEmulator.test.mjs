// The emulator's wiring (spec/005-arduino-lab.md): pins -> parts, the HC-SR04's echo in CPU cycles, serial
// text. First with a fake CPU shaped like avr8js (the "sketch" is a script that drives the pins), then, when
// avr8js is installed and the example was compiled (npm run arduino:build), with the real CPU and sketch.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ArduinoEmulator } from '../../renderer/models/arduino/emulator.js';
import { parseDiagram } from '../../renderer/models/arduino/circuit.js';
import { usToCycles, ULTRASONIC } from '../../renderer/models/arduino/peripherals.js';

const EXAMPLE = new URL('../../examples/arduino/sensor-proximidad/', import.meta.url);
const circuit = () => parseDiagram(JSON.parse(fs.readFileSync(new URL('diagram.json', EXAMPLE), 'utf8')));
const NOP_HEX = ':020000000000FE\n:00000001FF\n';

// A fake avr8js: same names and shapes; avrInstruction advances one cycle and runs the test's script
function fakeAvr(script) {
  const PinState = { Low: 0, High: 1, Input: 2, InputPullUp: 3 };
  const fake = { ports: {}, usart: null, PinState };
  class CPU { constructor(program) { this.program = program; this.cycles = 0; } tick() {} }
  class AVRIOPort {
    constructor(_cpu, config) { this.out = 0; this.ddr = 0; this.inputs = 0; this.listeners = []; fake.ports[config.name] = this; }
    addListener(fn) { this.listeners.push(fn); }
    pinState(bit) { return (this.ddr >> bit) & 1 ? ((this.out >> bit) & 1 ? PinState.High : PinState.Low) : PinState.Input; }
    setPin(bit, v) { this.inputs = v ? this.inputs | (1 << bit) : this.inputs & ~(1 << bit); this.listeners.forEach((l) => l()); }
    read(bit) { return Boolean(this.inputs & (1 << bit)); }
    drive(bit, level) { this.ddr |= 1 << bit; this.out = level ? this.out | (1 << bit) : this.out & ~(1 << bit); this.listeners.forEach((l) => l()); }
  }
  class AVRUSART { constructor() { fake.usart = this; this.rx = []; } writeByte(b) { this.rx.push(b); } }
  Object.assign(fake, {
    CPU, AVRIOPort, AVRUSART, AVRTimer: class {},
    timer0Config: {}, timer1Config: {}, timer2Config: {},
    portBConfig: { name: 'B' }, portCConfig: { name: 'C' }, portDConfig: { name: 'D' }, usart0Config: {},
    avrInstruction: (cpu) => { cpu.cycles += 1; script?.(cpu, fake); },
  });
  return fake;
}

test('the HC-SR04: TRIG on pin 9, ECHO on pin 10 goes high after the burst for distance × 58 µs', () => {
  const trigAt = 100, width = usToCycles(10);
  const echo = [];
  const avr = fakeAvr((cpu, f) => {
    if (cpu.cycles === trigAt) f.ports.B.drive(1, true); // D9 = PB1
    if (cpu.cycles === trigAt + width) f.ports.B.drive(1, false);
    const level = f.ports.B.read(2); // D10 = PB2
    if (level !== (echo.at(-1)?.level ?? false)) echo.push({ level, at: cpu.cycles });
  });
  const emu = new ArduinoEmulator({ avr, hex: NOP_HEX, circuit: circuit() });
  emu.setDistance('sonar', 25);
  emu.run(usToCycles(3000));
  const start = trigAt + width + usToCycles(ULTRASONIC.burstUs);
  assert.deepEqual(echo.map((e) => e.level), [true, false]);
  assert.ok(Math.abs(echo[0].at - start) <= 1, 'at the first instruction boundary after the burst');
  assert.equal(echo[1].at - echo[0].at, usToCycles(25 * 58));
  assert.equal(emu.read().parts.sonar.distanceCm, 25);
});

test('LEDs through their resistors, the buzzer\'s tone and the serial text', () => {
  const half = usToCycles(500); // 1 kHz on the buzzer (D8 = PB0)
  const avr = fakeAvr((cpu, f) => {
    if (cpu.cycles === 10) f.ports.D.drive(4, true); // D4: the red LED
    if (cpu.cycles % half === 0) f.ports.B.drive(0, (cpu.cycles / half) % 2 === 1);
    if (cpu.cycles === 50) 'Hola\n'.split('').forEach((ch) => f.usart.onByteTransmit(ch.charCodeAt(0)));
  });
  const emu = new ArduinoEmulator({ avr, hex: NOP_HEX, circuit: circuit() });
  emu.run(usToCycles(60000));
  const state = emu.read();
  assert.equal(state.parts.led_rojo.on, true);
  assert.equal(state.parts.led_verde.on, false);
  assert.ok(Math.abs(state.parts.buzzer.hz - 1000) <= 10, `${state.parts.buzzer.hz} Hz`);
  assert.equal(state.serial, 'Hola\n');
  assert.equal(emu.read().serial, '', 'the serial text is read once');
  assert.ok(Math.abs(state.seconds - 0.06) < 0.001);
});

test('a board that is not emulated, or no board, is refused clearly', () => {
  const mega = parseDiagram({ parts: [{ type: 'wokwi-arduino-mega', id: 'm' }], connections: [] });
  assert.throws(() => new ArduinoEmulator({ avr: fakeAvr(), hex: NOP_HEX, circuit: mega }), /not emulated/);
  assert.throws(() => new ArduinoEmulator({ avr: fakeAvr(), hex: NOP_HEX, circuit: parseDiagram({ parts: [], connections: [] }) }), /no board/);
});

// With the real CPU: only when avr8js is installed and the example's .hex exists (npm run arduino:build)
const real = await import('avr8js').catch(() => null);
const hexFile = new URL('sketch.hex', EXAMPLE);
const realReady = Boolean(real && fs.existsSync(hexFile));

test('the real sketch in avr8js: near is red and beeps, far is green, and the distance is printed', { skip: !realReady && 'needs npm install (avr8js) and npm run arduino:build' }, () => {
  const avr = real.default ?? real;
  const run = (cm) => {
    const emu = new ArduinoEmulator({ avr, hex: fs.readFileSync(hexFile, 'utf8'), circuit: circuit() });
    emu.setDistance('sonar', cm);
    emu.run(usToCycles(600000)); // 0.6 s: a few measurements
    emu.read();
    emu.run(usToCycles(200000));
    return emu.read();
  };
  const near = run(10);
  assert.equal(near.parts.led_rojo.on, true, JSON.stringify(near.parts));
  assert.ok(near.parts.buzzer.hz > 0);
  assert.match(near.serial, /Distancia: (9|10|11) cm/);
  const far = run(150);
  assert.equal(far.parts.led_verde.on, true);
  assert.equal(far.parts.buzzer.hz, 0);
  assert.match(far.serial, /Distancia: 1(49|50|51) cm/);
});
