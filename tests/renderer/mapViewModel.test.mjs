import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MapViewModel } from '../../renderer/viewmodels/mapViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

const file = (path) => ({ type: 'file', path, size: 100 });
const dir = (path, children) => ({ type: 'dir', path, children });

// src has a red file two levels down and a yellow one; docs and tests are clean; .env at the root is red
const TREE = [
  file('.env'),
  file('README.md'),
  file('package.json'),
  dir('src', [
    file('src/index.js'),
    file('src/login.js'),
    dir('src/lib', [dir('src/lib/keys', [file('src/lib/keys/server.pem')]), file('src/lib/util.js')]),
  ]),
  dir('docs', [file('docs/guide.md')]),
  dir('tests', [file('tests/app.test.js')]),
];

function setup(tree = TREE) {
  const security = new SecurityModel();
  const projectModel = { store: new Observable({ open: true, name: 'demo', tree, usesSupabase: false, session: 1 }) };
  const flights = [];
  const supabase = { store: { state: { schemaOpen: false } }, openSchema() {}, setOnScreen() {}, selectTable() {} };
  const bus = createEventBus();
  const events = [];
  for (const name of ['folderOpened', 'fileSelected']) bus.on(EVENTS[name], (p) => events.push([name, p]));
  const vm = new MapViewModel({
    projectModel, securityModel: security, camera: { flyTo: (to) => flights.push(to) }, supabaseViewModel: supabase, bus,
  });
  projectModel.store.set({ session: 1 }); // first compute
  return { vm, security, projectModel, events, flights, state: () => vm.store.state };
}

test('a project without problems shows only its base: no folders, no files', () => {
  const { state } = setup([file('README.md'), dir('docs', [file('docs/guide.md')])]);
  assert.equal(state().status, 'ready');
  assert.deepEqual(state().buildings, []);
  assert.deepEqual(state().plaza.files, []);
  assert.equal(state().opened, null);
});

test('only top-level folders with a yellow or red file anywhere inside appear, with their worst level', () => {
  const { state } = setup();
  assert.deepEqual(state().buildings.map((b) => b.path), ['src']);
  const [src] = state().buildings;
  assert.equal(src.level, 'red');
  assert.equal(src.red, 1);
  assert.equal(src.yellow, 1);
});

test('root files only show when they have a problem', () => {
  const { state } = setup();
  assert.deepEqual(state().plaza.files.map((f) => f.path), ['.env']);
  assert.equal(state().plaza.files[0].level, 'red');
});

test('opening a folder lays its problem files out beside it, riskiest first, at any depth', () => {
  const { vm, state } = setup();
  vm.enterFolder('src');
  assert.equal(state().path, 'src');
  const { opened } = state();
  assert.equal(opened.path, 'src');
  assert.deepEqual(opened.files.map((f) => f.path), ['src/lib/keys/server.pem', 'src/login.js']);
  assert.equal(opened.files[0].rel, 'lib/keys/server.pem');
  // The files sit next to the folder, not on top of it
  const [src] = state().buildings;
  opened.files.forEach((f) => assert.ok(Math.max(Math.abs(f.x - src.x), Math.abs(f.z - src.z)) > 2.3));
  // The folder stays on the map
  assert.deepEqual(state().buildings.map((b) => b.path), ['src']);
  assert.equal(state().buildings[0].open, true);
});

test('a nested path opens its top-level folder', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib/keys');
  assert.equal(state().path, 'src');
});

test('a folder without problems is not opened on the map, but it is announced', () => {
  const { vm, state, events } = setup();
  vm.enterFolder('docs');
  assert.equal(state().path, '');
  assert.equal(state().opened, null);
  const [, detail] = events.find(([name]) => name === 'folderOpened');
  assert.equal(detail.name, 'docs/');
});

test('when its last problem is fixed, the file and its folder disappear', () => {
  const { vm, security, state } = setup();
  vm.enterFolder('src');
  security.setScore('src/login.js', 'green');
  assert.deepEqual(state().opened.files.map((f) => f.path), ['src/lib/keys/server.pem']);
  security.setScore('src/lib/keys/server.pem', 'green');
  assert.deepEqual(state().buildings, []);
  assert.equal(state().opened, null);
  assert.equal(state().path, '');
});

test('Esc closes the open folder', () => {
  const { vm, state } = setup();
  vm.enterFolder('src');
  vm.escape();
  assert.equal(state().path, '');
  assert.equal(state().opened, null);
});

test('locating a deep file opens its folder and points at its icon', () => {
  const { vm, state } = setup();
  const spot = vm.locateFile('src/lib/keys/server.pem');
  assert.equal(state().path, 'src');
  const icon = state().opened.files.find((f) => f.path === 'src/lib/keys/server.pem');
  assert.equal(spot.x, icon.x);
  assert.equal(spot.z, icon.z);
  assert.equal(spot.folder, 'src');
});

test('locating a root file points at the plaza', () => {
  const { vm } = setup();
  const spot = vm.locateFile('.env');
  assert.equal(spot.folder, '');
  assert.equal(spot.x, 0);
});

test('showing a safe file still opens its card in the chat', () => {
  const { vm, events } = setup();
  assert.equal(vm.show('docs/guide.md'), true);
  const [, detail] = events.find(([name]) => name === 'fileSelected');
  assert.equal(detail.path, 'docs/guide.md');
  assert.equal(detail.level, 'green');
  assert.equal(vm.show('nope.js'), false);
});

test('hover describes folders and the files of the open folder', () => {
  const { vm } = setup();
  vm.enterFolder('src');
  assert.equal(vm.describePick({ type: 'folder', path: 'src' }).kind, 'folder');
  assert.equal(vm.describePick({ type: 'file', path: 'src/login.js' }).level, 'yellow');
  assert.equal(vm.describePick({ type: 'file', path: '.env' }).level, 'red');
});
