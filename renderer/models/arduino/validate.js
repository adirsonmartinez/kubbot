// The lab's electrical rules (spec/005-arduino-lab.md). circuit (circuit.parseDiagram) -> issues:
// [{ level: 'error' | 'warning', code, parts: [ids], values }]. The texts are in renderer/i18n/es.js
// (strings.lab.issues[code](values)), so the card, the 3D view and the agent explain the same thing.
// Errors are what would burn a part or never work; warnings are risky or depend on how it is built.
// Note: the Servo library drives a servo from ANY digital pin (Timer1 interrupts), so a servo off a
// PWM pin is not an issue; analogWrite() is, so the L298N's ENA/ENB must be on a PWM pin.
import { buildNets, boardOf } from './circuit.js';
import { isGroundPin } from './parts.js';

const isBoardPower = (pin) => pin === '5V' || pin === '3.3V' || pin === 'VIN';

export function validate(circuit) {
  const issues = [];
  const add = (level, code, parts = [], values = {}) => issues.push({ level, code, parts, values });
  const board = boardOf(circuit);
  const nets = buildNets(circuit);
  const byId = new Map(circuit.parts.map((p) => [p.id, p]));
  const kindOf = (id) => byId.get(id)?.spec?.kind;
  const onBoard = (endpoints) => (board ? endpoints.filter((e) => e.part === board.id).map((e) => e.pin) : []);
  const has = (endpoints, kind) => endpoints.some((e) => kindOf(e.part) === kind);

  if (!board) add('error', 'noBoard');
  else if (!board.spec.emulated) add('warning', 'boardNotEmulated', [board.id], { board: board.spec.key });

  // Parts and pins that do not exist
  for (const p of circuit.parts) if (!p.spec) add('warning', 'unknownPart', [p.id], { type: p.type });
  for (const w of circuit.wires) {
    for (const e of [w.from, w.to]) {
      const spec = byId.get(e.part)?.spec;
      if (spec && spec.kind !== 'breadboard' && !spec.pins.includes(e.pin)) add('error', 'unknownPin', [e.part], { pin: e.pin, part: e.part });
    }
  }

  // 5V straight into GND
  if (board) {
    const five = nets.of(board.id, '5V');
    if (onBoard(five).some(isGroundPin)) add('error', 'shortCircuit', [board.id]);
  }

  for (const p of circuit.parts) {
    const kind = p.spec?.kind;
    const net = (pin) => nets.of(p.id, pin);

    if (kind === 'led') {
      // Straight from a pin (or 5V) to GND: nothing limits the current. A resistor only counts in series,
      // so one merely touching the same net (dangling, or in parallel) does not save it.
      const a = net('A'), c = net('C');
      const driven = onBoard(a).some((pin) => board.spec.digital.includes(pin) || board.spec.analog.includes(pin) || isBoardPower(pin));
      if (driven && onBoard(c).some(isGroundPin)) add('error', 'ledNoResistor', [p.id]);
      const pins = onBoard(a).filter((pin) => board?.spec.digital.includes(pin));
      for (const pin of pins) {
        const leds = net('A').filter((e) => kindOf(e.part) === 'led').length;
        if (leds > 2) add('warning', 'pinOverload', [p.id], { pin, count: leds });
      }
    }

    // Everything with a ground pin shares the board's ground (a separate supply too)
    const groundPin = p.spec?.pins.find((pin) => pin === 'GND' || pin === '-');
    if (board && kind && kind !== 'board' && groundPin) {
      const connected = net(groundPin).length > 1;
      if (connected && !onBoard(net(groundPin)).some(isGroundPin) && kind !== 'supply') add('error', 'noCommonGround', [p.id]);
    }

    if (kind === 'servo') {
      const model = (p.attrs.model ?? 'sg90').toLowerCase();
      const fromBoard = onBoard(net('V+')).some(isBoardPower);
      if (fromBoard && model === 'mg996r') add('error', 'externalPower', [p.id], { part: 'mg996r' });
    }
    if (kind === 'motor' && onBoard([...net('1'), ...net('2')]).length) add('error', 'motorOnPin', [p.id]);
    if (kind === 'motorDriver') {
      if (onBoard(net('12V')).some(isBoardPower)) add('error', 'externalPower', [p.id], { part: 'l298n' });
      for (const en of ['ENA', 'ENB']) {
        const pins = onBoard(net(en)).filter((pin) => board.spec.digital.includes(pin));
        for (const pin of pins) if (!board.spec.pwm.includes(pin)) add('warning', 'pwmPin', [p.id], { pin, input: en });
      }
    }
    if (kind === 'bluetooth') {
      const rx = net('RXD');
      if (onBoard(rx).some((pin) => board.spec.digital.includes(pin)) && !has(rx, 'resistor')) add('warning', 'hc05Divider', [p.id]);
    }
    if (kind === 'ultrasonic') {
      for (const pin of ['TRIG', 'ECHO']) if (!onBoard(net(pin)).length) add('warning', 'notConnected', [p.id], { pin });
    }
  }

  // More than two small servos on the board's 5V: the board resets when they move together
  if (board) {
    const servos = circuit.parts.filter((p) => p.spec?.kind === 'servo' && onBoard(nets.of(p.id, 'V+')).some(isBoardPower));
    if (servos.length > 2) add('warning', 'tooManyServos', servos.map((s) => s.id), { count: servos.length });
  }
  return issues;
}

export const hasErrors = (issues) => issues.some((i) => i.level === 'error');
