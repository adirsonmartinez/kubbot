// The Arduino lab's pure models (spec/005-arduino-lab.md): diagram.json and lab.json, nets, the electrical
// rules, how each part answers the pins, and Intel HEX.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDiagram, buildNets, drivingPins, parseLab, endpoint } from '../../renderer/models/arduino/circuit.js';
import { validate, hasErrors } from '../../renderer/models/arduino/validate.js';
import { catalog, partOf } from '../../renderer/models/arduino/parts.js';
import { Ultrasonic, FrequencyMeter, DutyMeter, ServoMeter, l298nChannel, usToCycles, ULTRASONIC } from '../../renderer/models/arduino/peripherals.js';
import { parseIntelHex, toProgram } from '../../renderer/models/arduino/intelHex.js';

const EXAMPLE = new URL('../../examples/arduino/sensor-proximidad/', import.meta.url);
const example = () => JSON.parse(fs.readFileSync(new URL('diagram.json', EXAMPLE), 'utf8'));
const codes = (issues) => issues.map((i) => i.code);
const uno = { type: 'wokwi-arduino-uno', id: 'uno' };
const circuitOf = (parts, connections) => parseDiagram({ parts: [uno, ...parts], connections });

test('the example project: its parts, its wires and nothing dropped', () => {
  const c = parseDiagram(example());
  assert.equal(c.parts.length, 9);
  assert.equal(c.wires.length, 15);
  assert.equal(c.dropped, 0);
  assert.ok(c.parts.every((p) => p.spec), 'every part is known');
  assert.deepEqual(endpoint('uno:GND.1'), { part: 'uno', pin: 'GND.1' });
  assert.equal(endpoint('no-colon'), null);
});

test('bad entries are dropped, not trusted (the diagram may come from an agent)', () => {
  const c = parseDiagram({ parts: [uno, { id: 'x y', type: 'wokwi-led' }, { id: 'uno', type: 'wokwi-led' }], connections: [['uno:13', 'ghost:A'], ['uno:13'], 'nope'] });
  assert.equal(c.parts.length, 1);
  assert.equal(c.wires.length, 0);
  assert.equal(c.dropped, 5);
  assert.equal(parseDiagram('{not json').invalid, true);
});

test('nets: the board\'s GND pins are one; an LED is driven through its resistor', () => {
  const c = parseDiagram(example());
  const nets = buildNets(c);
  const ground = nets.of('led_verde', 'C').map((e) => `${e.part}:${e.pin}`);
  assert.ok(ground.includes('sonar:GND'), 'every GND joins');
  assert.deepEqual(drivingPins(c, nets, 'led_verde', 'A'), ['2']);
  assert.deepEqual(drivingPins(c, nets, 'sonar', 'TRIG'), ['9']);
});

test('the example passes the rules', () => {
  const issues = validate(parseDiagram(example()));
  assert.equal(hasErrors(issues), false, JSON.stringify(issues));
});

test('an LED straight on a pin, without a resistor, is an error', () => {
  const c = circuitOf([{ type: 'wokwi-led', id: 'l1' }], [['uno:13', 'l1:A'], ['l1:C', 'uno:GND.1']]);
  const issues = validate(c);
  assert.ok(codes(issues).includes('ledNoResistor'));
  assert.deepEqual(issues.find((i) => i.code === 'ledNoResistor').parts, ['l1']);
  const ok = circuitOf([{ type: 'wokwi-led', id: 'l1' }, { type: 'wokwi-resistor', id: 'r' }], [['uno:13', 'l1:A'], ['l1:C', 'r:1'], ['r:2', 'uno:GND.1']]);
  assert.ok(!codes(validate(ok)).includes('ledNoResistor'), 'a resistor on the cathode side is fine too');
  // The example with its green LED moved straight onto pin 2: its resistor still hangs from the LED, but
  // it is no longer in series
  const d = example();
  d.connections = d.connections.map((c) => (c[0] === 'uno:2' && c[1] === 'r1:1' ? ['uno:2', 'led_verde:A', 'green', []] : c));
  const issue = validate(parseDiagram(d)).find((i) => i.code === 'ledNoResistor');
  assert.deepEqual(issue?.parts, ['led_verde']);
});

test('pins that do not exist, unknown parts, no board, a short and a board not emulated yet', () => {
  assert.ok(codes(validate(circuitOf([{ type: 'wokwi-led', id: 'l1' }], [['uno:99', 'l1:A']]))).includes('unknownPin'));
  assert.ok(codes(validate(circuitOf([{ type: 'acme-laser', id: 'z' }], []))).includes('unknownPart'));
  assert.ok(codes(validate(parseDiagram({ parts: [{ type: 'wokwi-led', id: 'l' }], connections: [] }))).includes('noBoard'));
  assert.ok(codes(validate(circuitOf([], [['uno:5V', 'uno:GND.2']]))).includes('shortCircuit'));
  assert.ok(codes(validate(parseDiagram({ parts: [{ type: 'wokwi-arduino-mega', id: 'm' }], connections: [] }))).includes('boardNotEmulated'));
});

test('power: an MG996R or an L298N\'s motors on the board\'s 5V, a motor on a pin, three servos on 5V', () => {
  const mg = circuitOf([{ type: 'wokwi-servo', id: 's', attrs: { model: 'mg996r' } }], [['uno:5V', 's:V+'], ['uno:GND.1', 's:GND'], ['uno:9', 's:PWM']]);
  assert.ok(codes(validate(mg)).includes('externalPower'));
  const sg = circuitOf([{ type: 'wokwi-servo', id: 's' }], [['uno:5V', 's:V+'], ['uno:GND.1', 's:GND'], ['uno:7', 's:PWM']]);
  assert.deepEqual(codes(validate(sg)), [], 'one SG90 on any digital pin is fine (Servo.h)');
  const motor = circuitOf([{ type: 'qubbot-dc-motor', id: 'm' }], [['uno:6', 'm:1'], ['m:2', 'uno:GND.1']]);
  assert.ok(codes(validate(motor)).includes('motorOnPin'));
  const driver = circuitOf([{ type: 'qubbot-l298n', id: 'd' }], [['uno:5V', 'd:12V'], ['uno:GND.1', 'd:GND'], ['uno:7', 'd:ENA']]);
  assert.ok(codes(validate(driver)).includes('externalPower'));
  assert.ok(codes(validate(driver)).includes('pwmPin'));
  const three = circuitOf([1, 2, 3].map((n) => ({ type: 'wokwi-servo', id: `s${n}` })), [1, 2, 3].flatMap((n) => [['uno:5V', `s${n}:V+`], ['uno:GND.1', `s${n}:GND`]]));
  assert.ok(codes(validate(three)).includes('tooManyServos'));
});

test('a separate ground, an HC-05 without a divider, a sensor without TRIG', () => {
  const apart = circuitOf([{ type: 'wokwi-hc-sr04', id: 'u' }, { type: 'qubbot-battery', id: 'b' }], [['b:-', 'u:GND'], ['b:+', 'u:VCC'], ['uno:9', 'u:TRIG'], ['uno:10', 'u:ECHO']]);
  assert.ok(codes(validate(apart)).includes('noCommonGround'));
  const bt = circuitOf([{ type: 'qubbot-hc05', id: 'bt' }], [['uno:1', 'bt:RXD'], ['uno:0', 'bt:TXD'], ['uno:GND.1', 'bt:GND'], ['uno:5V', 'bt:VCC']]);
  assert.ok(codes(validate(bt)).includes('hc05Divider'));
  const half = circuitOf([{ type: 'wokwi-hc-sr04', id: 'u' }], [['uno:10', 'u:ECHO'], ['uno:GND.1', 'u:GND']]);
  assert.deepEqual(validate(half).find((i) => i.code === 'notConnected').values, { pin: 'TRIG' });
});

test('lab.json: known keys only, capped, links only https and marked if checked', () => {
  const lab = parseLab({ title: 'x'.repeat(200), level: 'experto', components: [{ name: 'LED', qty: 300 }, { qty: 2 }], sources: [{ url: 'http://a.b' }, { url: 'https://github.com/a/b', license: 'MIT', verified: true }], steps: ['uno', 3] });
  assert.equal(lab.title.length, 80);
  assert.equal(lab.level, 'principiante');
  assert.deepEqual(lab.components, [{ name: 'LED', qty: 99, why: '' }]);
  assert.deepEqual(lab.sources, [{ url: 'https://github.com/a/b', license: 'MIT', verified: true }]);
  assert.deepEqual(lab.steps, ['uno']);
  assert.equal(parseLab('{broken').title, '');
});

test('the catalog for the agent: every part with its pins, boards with their FQBN', () => {
  const list = catalog();
  assert.ok(list.find((p) => p.type === 'wokwi-arduino-uno').fqbn === 'arduino:avr:uno');
  assert.equal(list.find((p) => p.type === 'wokwi-hc-sr04').emulated, true);
  assert.equal(list.find((p) => p.type === 'wokwi-arduino-mega').emulated, false);
  assert.equal(partOf('nope'), null);
});

test('HC-SR04: a 10 µs trigger gives an echo of distance × 58 µs; a short one or a busy sensor gives none', () => {
  const s = new Ultrasonic({ distanceCm: 30 });
  assert.equal(s.trig(true, 1000), null);
  const pulse = s.trig(false, 1000 + usToCycles(10));
  assert.equal(pulse.start, 1000 + usToCycles(10) + usToCycles(ULTRASONIC.burstUs));
  assert.equal(pulse.end - pulse.start, usToCycles(30 * 58));
  s.trig(true, pulse.start + 10);
  assert.equal(s.trig(false, pulse.start + 10 + usToCycles(12)), null, 'still measuring');
  const short = new Ultrasonic();
  short.trig(true, 0);
  assert.equal(short.trig(false, usToCycles(5)), null);
  const far = new Ultrasonic({ distanceCm: 900 });
  assert.equal(far.echoUs, ULTRASONIC.timeoutUs);
  far.setDistance(1);
  assert.equal(far.distanceCm, 2, 'the sensor cannot see closer than 2 cm');
});

test('a buzzer\'s frequency, an LED\'s brightness, a servo\'s angle and the L298N\'s table', () => {
  const f = new FrequencyMeter();
  const half = usToCycles(500); // 1 kHz
  for (let i = 0; i < 200; i++) f.update(i % 2 === 0, i * half);
  assert.ok(Math.abs(f.hz(200 * half) - 1000) <= 5, `${f.hz(200 * half)} Hz`);
  assert.equal(f.hz(200 * half + usToCycles(200000)), 0, 'silent once it stops');

  const d = new DutyMeter();
  for (let i = 0; i < 100; i++) d.update(i % 2 === 0, i * 100);
  assert.ok(Math.abs(d.read(10000) - 0.5) < 0.02);
  d.update(true, 10000);
  assert.equal(d.read(20000), 1, 'always on');

  const s = new ServoMeter();
  s.update(true, 0);
  s.update(false, usToCycles(1472));
  assert.equal(s.angle, 90);
  s.update(true, usToCycles(20000));
  s.update(false, usToCycles(20000 + 544));
  assert.equal(s.angle, 0);

  assert.deepEqual(l298nChannel({ in1: true, in2: false, enable: 0.5 }), { dir: 'forward', speed: 0.5 });
  assert.deepEqual(l298nChannel({ in1: false, in2: true, enable: 1 }), { dir: 'backward', speed: 1 });
  assert.deepEqual(l298nChannel({ in1: true, in2: true, enable: 1 }), { dir: 'brake', speed: 0 });
  assert.deepEqual(l298nChannel({ in1: true, in2: false, enable: 0 }), { dir: 'coast', speed: 0 });
});

test('Intel HEX: records, checksums and size are checked', () => {
  const hex = ':020000000C94' + '5E' + '\n:00000001FF\n';
  const { bytes, used } = parseIntelHex(hex);
  assert.equal(used, 2);
  assert.deepEqual([bytes[0], bytes[1]], [0x0c, 0x94]);
  assert.equal(toProgram(bytes)[0], 0x940c, 'little endian words');
  assert.throws(() => parseIntelHex(':020000000C9400\n'), /checksum/);
  assert.throws(() => parseIntelHex('hello'), /record/);
  assert.throws(() => parseIntelHex(':00000001FF'), /empty/);
  assert.throws(() => parseIntelHex(':020000000C945E', 1), /fit/);
});
