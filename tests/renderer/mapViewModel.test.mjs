import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MapViewModel } from '../../renderer/viewmodels/mapViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { screenOf } from '../../renderer/viewmodels/layout.js';

const at = (item) => screenOf(item.x, item.z); // { u: right, v: down } on screen

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
  const projectModel = { store: new Observable({ open: true, name: 'demo', tree, usesSupabase: false, integrations: [], session: 1 }) };
  const flights = [];
  const supabase = { store: { state: { schemaOpen: false } }, openSchema() {}, setOnScreen() {}, selectTable() {} };
  const bus = createEventBus();
  const events = [];
  for (const name of ['folderOpened', 'fileSelected']) bus.on(EVENTS[name], (p) => events.push([name, p]));
  const vm = new MapViewModel({
    projectModel, securityModel: security, camera: { flyTo: (to, zoom) => flights.push({ ...to, zoom }) }, supabaseViewModel: supabase, bus,
  });
  projectModel.store.set({ session: 1 }); // first compute
  return { vm, security, projectModel, events, flights, state: () => vm.store.state };
}

test('a project without problems shows every top-level folder and root file, all calm', () => {
  const { state } = setup([file('README.md'), file('package.json'), dir('docs', [file('docs/guide.md')]), dir('app', [file('app/main.js')])]);
  assert.equal(state().status, 'ready');
  assert.deepEqual(state().buildings.map((b) => b.path), ['app', 'docs']);
  assert.ok(state().buildings.every((b) => b.level === 'green'));
  assert.deepEqual(state().plaza.files.map((f) => f.path), ['package.json', 'README.md']);
  assert.equal(state().plaza.more, 0);
  assert.equal(state().opened, null);
});

test('folders with problems come first (worst first), then the rest by name', () => {
  const { state } = setup();
  assert.deepEqual(state().buildings.map((b) => b.path), ['src', 'docs', 'tests']);
  const [src, docs] = state().buildings;
  assert.equal(src.level, 'red');
  assert.equal(src.red, 1);
  assert.equal(src.yellow, 1);
  assert.equal(docs.level, 'green');
});

test('every root file is on the plaza, riskiest first; past the limit the rest is counted', () => {
  const { state } = setup();
  assert.deepEqual(state().plaza.files.map((f) => f.path), ['.env', 'package.json', 'README.md']);
  assert.equal(state().plaza.files[0].level, 'red');
  const many = setup(Array.from({ length: 30 }, (_, i) => file(`f${String(i).padStart(2, '0')}.txt`)));
  assert.equal(many.state().plaza.files.length, 24);
  assert.equal(many.state().plaza.more, 6);
});

test('opening a folder unfolds its direct subfolders and files below it', () => {
  const { vm, state } = setup();
  vm.enterFolder('src');
  assert.equal(state().path, 'src');
  const { opened } = state();
  assert.equal(opened.path, 'src');
  assert.equal(opened.top, 'src');
  assert.deepEqual(opened.folders.map((f) => f.path), ['src/lib']);
  assert.equal(opened.folders[0].level, 'red'); // the key two levels down
  assert.deepEqual(opened.files.map((f) => f.path), ['src/login.js', 'src/index.js']); // riskiest first
  // Below the folder (down on screen), centered under it
  const [src] = state().buildings;
  const items = [...opened.folders, ...opened.files];
  items.forEach((f) => assert.ok(at(f).v > at(src).v + 2));
  const mean = items.reduce((sum, f) => sum + at(f).u, 0) / items.length;
  assert.ok(Math.abs(mean - at(src).u) < 0.01);
  assert.equal(src.open, true);
});

test('opening a subfolder unfolds one more level, below the previous one', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib');
  assert.equal(state().path, 'src/lib');
  assert.deepEqual(state().opened.folders.map((f) => f.path), ['src/lib/keys']);
  assert.deepEqual(state().opened.files.map((f) => f.path), ['src/lib/util.js']);
  assert.equal(state().opened.top, 'src');
  // The path stays unfolded: src's contents, then lib's, each lower
  assert.deepEqual(state().branches.map((b) => b.path), ['src', 'src/lib']);
  const [first, second] = state().branches;
  const lib = first.folders.find((f) => f.path === 'src/lib');
  assert.equal(lib.open, true);
  [...second.folders, ...second.files].forEach((f) => assert.ok(at(f).v > at(lib).v + 2));
  assert.deepEqual(state().crumbs.map((c) => [c.name, c.path]), [['demo', ''], ['src', 'src'], ['lib', 'src/lib']]);
  assert.equal(state().buildings.find((b) => b.path === 'src').open, true);
});

test('clicking an open folder on the map closes it, and everything open inside it', () => {
  const { vm, state } = setup();
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, 'src');
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, '');
  vm.handlePick({ type: 'folder', path: 'src' });
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  assert.equal(state().path, 'src'); // closing lib goes back to src
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, ''); // closing src folds lib too
});

test('a clean folder opens too, and it is announced in the chat', () => {
  const { vm, state, events } = setup();
  vm.enterFolder('docs');
  assert.equal(state().path, 'docs');
  assert.deepEqual(state().opened.files.map((f) => f.path), ['docs/guide.md']);
  const [, detail] = events.find(([name]) => name === 'folderOpened');
  assert.equal(detail.name, 'docs/');
});

test('Esc goes up one level, then closes the folder', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib/keys');
  assert.equal(state().path, 'src/lib/keys');
  vm.escape();
  assert.equal(state().path, 'src/lib');
  vm.escape();
  vm.escape();
  assert.equal(state().path, '');
  assert.equal(state().opened, null);
});

test('a fixed file stays on the map, calm', () => {
  const { vm, security, state } = setup();
  vm.enterFolder('src');
  security.setScore('src/login.js', 'green');
  assert.equal(state().opened.files.find((f) => f.path === 'src/login.js').level, 'green');
  security.setScore('src/lib/keys/server.pem', 'green');
  assert.equal(state().path, 'src');
  assert.equal(state().buildings.find((b) => b.path === 'src').level, 'green');
});

test('if the open folder disappears from disk, the map goes up to what is left', () => {
  const { vm, state, projectModel } = setup();
  vm.enterFolder('src/lib/keys');
  projectModel.store.set({ tree: [dir('src', [file('src/index.js'), dir('src/lib', [file('src/lib/util.js')])])] });
  assert.equal(state().path, 'src/lib');
  projectModel.store.set({ tree: [file('README.md')] });
  assert.equal(state().path, '');
});

test('a big folder shows its first items and counts the rest', () => {
  const { vm, state } = setup([dir('big', Array.from({ length: 60 }, (_, i) => file(`big/f${String(i).padStart(2, '0')}.js`)))]);
  vm.enterFolder('big');
  assert.equal(state().opened.files.length, 48);
  assert.equal(state().opened.more, 12);
});

test('locating a deep file opens the folder it is in and points at its icon', () => {
  const { vm, state } = setup();
  const spot = vm.locateFile('src/lib/keys/server.pem');
  assert.equal(state().path, 'src/lib/keys');
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

test('showing a file opens its folder and its card in the chat', () => {
  const { vm, state, events } = setup();
  assert.equal(vm.show('docs/guide.md'), true);
  assert.equal(state().path, 'docs');
  const [, detail] = events.find(([name]) => name === 'fileSelected');
  assert.equal(detail.path, 'docs/guide.md');
  assert.equal(detail.level, 'green');
  assert.equal(vm.show('nope.js'), false);
});

test('hover describes folders, subfolders and files on the map', () => {
  const { vm } = setup();
  vm.enterFolder('src');
  assert.equal(vm.describePick({ type: 'folder', path: 'src' }).kind, 'folder');
  assert.equal(vm.describePick({ type: 'folder', path: 'src/lib' }).level, 'red');
  assert.equal(vm.describePick({ type: 'file', path: 'src/login.js' }).level, 'yellow');
  assert.equal(vm.describePick({ type: 'file', path: 'README.md' }).level, 'green');
});

test('the project is a tree: top-level folders hang in a row below the plaza, left to right', () => {
  const { state } = setup();
  const { buildings, plaza } = state();
  buildings.forEach((b) => assert.ok(at(b).v > plaza.size / 2));
  const us = buildings.map((b) => at(b).u);
  assert.deepEqual(us, [...us].sort((a, b) => a - b));
  assert.ok(state().links.length > 0);
});

test('a folder in an upper row unfolds right below it: the rows under it move down to make room', () => {
  const dirs = 'abcdefghij'.split('').map((n) => dir(n, [file(`${n}/one.js`), dir(`${n}/sub`, [file(`${n}/sub/x.js`)])]));
  const { vm, state } = setup(dirs);
  const rowOf = () => Object.fromEntries(state().buildings.map((b) => [b.path, at(b).v]));
  const before = rowOf();
  assert.ok(before.i > before.a); // i and j are on the second row
  vm.enterFolder('a');
  const after = rowOf();
  const items = [...state().opened.folders, ...state().opened.files];
  items.forEach((f) => {
    assert.ok(at(f).v > after.a); // below a…
    assert.ok(at(f).v < after.i - 2); // …and above the next row, which moved down
  });
  assert.ok(after.i > before.i);
  assert.equal(after.b, before.b); // the open folder's own row stays put
});

test('opening another top-level folder folds the previous branch: one path at a time', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib');
  vm.enterFolder('docs');
  assert.deepEqual(state().branches.map((b) => b.path), ['docs']);
  assert.deepEqual(state().buildings.filter((b) => b.open).map((b) => b.path), ['docs']);
});

test('the integrations band runs across the top, above the plaza and as wide as the tree', () => {
  const { state } = setup();
  const { band, buildings } = state();
  const c = screenOf(band.x, band.z);
  assert.ok(c.v + band.depth / 2 < -state().plaza.size / 2);
  const widest = Math.max(...buildings.map((b) => Math.abs(at(b).u)));
  assert.ok(band.width / 2 > widest);
});

test('integrations sit in the band, in a row to the right of Supabase', () => {
  const { state, projectModel } = setup();
  projectModel.store.set({ integrations: ['supabase', 'vercel', 'github', 'clerk', 'posthog'], usesSupabase: true, integrationStatus: { clerk: 'incident' } });
  const { integrations, band } = state();
  assert.deepEqual(integrations.map((i) => i.status), ['connected', 'connected', 'incident', 'connected']);
  assert.deepEqual(integrations.map((i) => i.key), ['vercel', 'github', 'clerk', 'posthog']); // Supabase draws itself
  const c = screenOf(band.x, band.z);
  integrations.forEach((i) => {
    assert.ok(Math.abs(at(i).v - c.v) < band.depth / 2);
    assert.ok(at(i).u > 6 && at(i).u < band.width / 2);
  });
  const us = integrations.map((i) => at(i).u);
  assert.deepEqual(us, [...us].sort((a, b) => a - b));
});

// A new project: the workspace creates an empty folder and opens it
function setupNew() {
  const s = setup([]);
  s.projectModel.create = async () => {
    s.projectModel.store.set({ tree: [], session: s.projectModel.store.state.session + 1 });
    return { ok: true, data: { name: 'nuevo' } };
  };
  return s;
}

test('a just created, empty project shows the robot that asks what to build', async () => {
  const { vm, state, flights } = setupNew();
  assert.equal(state().welcome, false);
  await vm.createProject();
  assert.equal(state().welcome, true);
  // The camera comes closer to the plaza, so the robot reads well
  const last = flights.at(-1);
  assert.deepEqual([last.x, last.z], [0, 0]);
  assert.ok(last.zoom > 1.5);
});

test('the robot leaves once the project has files, and does not come back', async () => {
  const { vm, state, projectModel } = setupNew();
  await vm.createProject();
  projectModel.store.set({ tree: [file('index.html')] });
  assert.equal(state().welcome, false);
  projectModel.store.set({ tree: [] });
  assert.equal(state().welcome, false);
});

test('opening an existing project, even an empty one, shows no robot', () => {
  const { state, projectModel } = setup([]);
  projectModel.store.set({ session: 2 });
  assert.equal(state().welcome, false);
});

test('the robot leaves when another project is opened', async () => {
  const { vm, state, projectModel } = setupNew();
  await vm.createProject();
  projectModel.store.set({ session: projectModel.store.state.session + 1 });
  assert.equal(state().welcome, false);
});
