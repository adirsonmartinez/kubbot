// The Arduino lab's view model (spec/005-arduino-lab.md) with a fake service: opening a project's lab or
// the example, the rules blocking a run, compiling when there is no .hex, the emulator's messages, the
// serial monitor and the obstacle.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LabViewModel, EXAMPLE_ID } from '../../renderer/viewmodels/labViewModel.js';

const EXAMPLE = new URL('../../examples/arduino/sensor-proximidad/', import.meta.url);
const file = (name) => fs.readFileSync(new URL(name, EXAMPLE), 'utf8');
const HEX = ':020000000000FE\n:00000001FF\n';

function fakeService({ project = null, compile = { ok: true, hex: HEX }, hex = null } = {}) {
  const calls = [];
  let listener = () => {};
  const service = {
    available: true,
    project: async () => ({ ok: true, data: project }),
    example: async (id) => ({ ok: true, data: { id, diagram: file('diagram.json'), lab: file('lab.json'), sketch: file('sketch.ino'), hex } }),
    compile: async (req) => { calls.push(['compile', req]); return { ok: true, data: compile }; },
    onMessage: (fn) => { listener = fn; },
    load: async (h, d) => calls.push(['load', h, d.parts.length]),
    start: async () => calls.push(['start']),
    stop: () => calls.push(['stop']),
    setDistance: (id, cm) => calls.push(['distance', id, cm]),
    emit: (m) => listener(m),
  };
  return { service, calls };
}

test('no lab in the project: the tab stays hidden; the example opens it', async () => {
  const { service } = fakeService();
  const vm = new LabViewModel({ service });
  await vm.refresh();
  assert.equal(vm.store.state.available, false);
  await vm.openExample();
  const st = vm.store.state;
  assert.deepEqual([st.available, st.status, st.source, st.exampleId], [true, 'ready', 'example', EXAMPLE_ID]);
  assert.equal(st.title, 'Sensor de proximidad con alerta');
  assert.equal(st.board, 'uno');
  assert.equal(st.parts.length, 9);
  assert.deepEqual(st.distance, { sonar: 100 });
  assert.equal(st.issues.filter((i) => i.level === 'error').length, 0);
});

test('«Probar» without a .hex compiles first, then loads and starts the emulator with the obstacle', async () => {
  const { service, calls } = fakeService();
  const vm = new LabViewModel({ service });
  await vm.openExample();
  await vm.run();
  assert.deepEqual(calls.map((c) => c[0]), ['compile', 'load', 'distance', 'start']);
  assert.deepEqual(calls[0][1], { example: EXAMPLE_ID, board: 'arduino:avr:uno' });
  assert.equal(vm.store.state.status, 'running');
  vm.stop();
  assert.equal(vm.store.state.status, 'ready');
});

test('with the example\'s .hex it runs without compiling (no CLI, no network)', async () => {
  const { service, calls } = fakeService({ hex: HEX });
  const vm = new LabViewModel({ service });
  await vm.openExample();
  await vm.run();
  assert.ok(!calls.some((c) => c[0] === 'compile'));
  assert.equal(calls.find((c) => c[0] === 'load')[1], HEX);
});

test('compile problems are told by name, with the compiler\'s lines', async () => {
  const { service } = fakeService({ compile: { ok: false, error: 'noCli', lines: [] } });
  const vm = new LabViewModel({ service });
  await vm.openExample();
  await vm.run();
  assert.deepEqual([vm.store.state.status, vm.store.state.error], ['error', 'noCli']);
  const broken = fakeService({ compile: { ok: false, error: 'compile', lines: ["sketch.ino:3: error: 'x' was not declared"] } });
  const vm2 = new LabViewModel({ service: broken.service });
  await vm2.openExample();
  await vm2.run();
  assert.deepEqual(vm2.store.state.errorLines, ["sketch.ino:3: error: 'x' was not declared"]);
});

test('a project lab with an LED without resistor: the rules block «Probar» and say why', async () => {
  const diagram = JSON.stringify({ parts: [{ type: 'wokwi-arduino-uno', id: 'uno' }, { type: 'wokwi-led', id: 'l1' }], connections: [['uno:13', 'l1:A'], ['l1:C', 'uno:GND.1']] });
  const { service, calls } = fakeService({ project: { dir: 'robot', diagram, lab: null, sketch: 'void setup(){}', sketchPath: 'robot/robot.ino', hex: null } });
  const vm = new LabViewModel({ service });
  await vm.refresh();
  assert.equal(vm.store.state.source, 'project');
  assert.ok(vm.store.state.issues.some((i) => i.code === 'ledNoResistor' && i.parts[0] === 'l1'));
  await vm.run();
  assert.deepEqual([vm.store.state.status, vm.store.state.error], ['error', 'hasErrors']);
  assert.equal(calls.length, 0);
});

test('the emulator\'s messages: parts, serial lines (also split across messages) and speed', async () => {
  const { service } = fakeService({ hex: HEX });
  const vm = new LabViewModel({ service });
  await vm.openExample();
  await vm.run();
  service.emit({ type: 'state', state: { parts: { led_rojo: { on: true } }, serial: 'Distancia: 1' }, speed: 0.95 });
  service.emit({ type: 'state', state: { parts: { led_rojo: { on: true } }, serial: '0 cm\r\nDistancia: 12 cm\n' }, speed: 0.97 });
  const st = vm.store.state;
  assert.deepEqual(st.serial, ['Distancia: 10 cm', 'Distancia: 12 cm']);
  assert.equal(st.live.led_rojo.on, true);
  assert.equal(st.speed, 0.97);
  service.emit({ type: 'error', message: 'noEmulator' });
  assert.deepEqual([vm.store.state.status, vm.store.state.error], ['error', 'noEmulator']);
});

test('the obstacle: clamped to the sensor\'s range, nudged, and from a click on the ruler in 3D', async () => {
  const { service, calls } = fakeService();
  const vm = new LabViewModel({ service });
  await vm.openExample();
  vm.setDistance(1);
  assert.equal(vm.store.state.distance.sonar, 2);
  vm.nudge(+10);
  assert.equal(vm.store.state.distance.sonar, 12);
  vm.handlePick({ type: 'lab-ruler', id: 'sonar', cm: 35 });
  assert.equal(vm.store.state.distance.sonar, 35);
  assert.deepEqual(calls.at(-1), ['distance', 'sonar', 35]);
  vm.handlePick({ type: 'lab-part', id: 'led_rojo' });
  assert.equal(vm.store.state.selected, 'led_rojo');
  vm.escape();
  assert.equal(vm.store.state.selected, null);
});

test('closing the project removes its lab; the files disappearing does too', async () => {
  const project = { dir: '', diagram: file('diagram.json'), lab: file('lab.json'), sketch: file('sketch.ino'), sketchPath: 'sketch.ino', hex: null };
  const env = fakeService({ project });
  const vm = new LabViewModel({ service: env.service });
  await vm.refresh();
  assert.equal(vm.store.state.available, true);
  vm.projectClosed();
  assert.equal(vm.store.state.available, false);
});
