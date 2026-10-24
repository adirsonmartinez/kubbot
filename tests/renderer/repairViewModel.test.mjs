import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { RepairViewModel } from '../../renderer/viewmodels/repairViewModel.js';
import { RepairHistoryModel } from '../../renderer/models/repairHistoryModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

function setup({ live = false, answer = { text: '- Paso uno\n- Paso dos' }, writes = [], hold = false } = {}) {
  const security = new SecurityModel();
  const history = new RepairHistoryModel();
  history.load(`p-${Math.random()}`);
  const bus = createEventBus();
  let changed = () => {};
  const agentService = { onChanged: (cb) => { changed = cb; }, undo: async () => ({ ok: true }) };
  const asks = [];
  const connection = {
    live,
    agentLabel: 'Claude',
    store: { state: { agents: [{ id: 'claude', label: 'Claude' }], selected: live ? 'claude' : null } },
    // hold: the run stays open until the test calls asks[i].finish()
    ask: (_p, _s, { signal, onStart } = {}) => new Promise((resolve) => {
      const entry = { signal, finish: () => resolve(answer), aborted: false };
      asks.push(entry);
      signal?.addEventListener('abort', () => { entry.aborted = true; resolve({ text: '', error: 'cancelled' }); });
      onStart?.(String(asks.length));
      writes.forEach((w) => changed(w));
      if (!hold) resolve(answer);
    }),
  };
  const vm = new RepairViewModel({
    securityModel: security,
    mapViewModel: { locateFile: () => ({ folder: 'electron', x: 0, z: 0, height: 1, radius: 2.5 }) },
    cameraViewModel: { azimuth: 0, flyTo() {} },
    connection, history, agentService, bus,
  });
  const events = [];
  for (const name of ['repairStarted', 'repairFinished', 'repairChanged']) bus.on(EVENTS[name], (p) => events.push([name, p]));
  return { vm, security, history, events, asks, change: (c) => changed(c) };
}

async function runAll() {
  for (let i = 0; i < 20; i++) { mock.timers.tick(1000); await new Promise((r) => setImmediate(r)); }
}

test('without an agent: the guide plan, a yellow light and a "planned" task', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, security, history, events } = setup();
    vm.start('electron/main.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'planned');
    assert.ok(entry.plan.length > 0);
    assert.equal(security.scoreOf('electron/main.js').level, 'yellow');
    assert.equal(vm.store.state.job.step, 4);
    assert.deepEqual(events.map((e) => e[0]), ['repairStarted', 'repairFinished']);
  } finally { mock.timers.reset(); }
});

test('with an agent that writes: "fixed" with its changes; verifying turns it green', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'electron/main.js', reason: 'Valida el origen', created: false, backup: { id: 'b1', root: '/p' }, at: 't1' };
    const { vm, security, history } = setup({ live: true, writes: [change] });
    vm.start('electron/main.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'fixed');
    assert.equal(entry.changes.length, 1);
    assert.deepEqual(entry.plan, ['Paso uno', 'Paso dos']);
    vm.markFixed(entry.id);
    assert.equal(history.get(entry.id).status, 'verified');
    assert.equal(security.scoreOf('electron/main.js').level, 'green');
    assert.equal(vm.store.state.job, null);
  } finally { mock.timers.reset(); }
});

test('agent error with no changes: "failed" and the guide plan as fallback', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history } = setup({ live: true, answer: { text: '', error: 'sin sesión' } });
    vm.start('a.sql');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'failed');
    assert.equal(entry.error, 'sin sesión');
  } finally { mock.timers.reset(); }
});

test('closing while working marks the task as failed (never stuck "working") and runs the queue', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history } = setup();
    vm.start('a.js');
    vm.start('b.js'); // queued
    assert.deepEqual(vm.store.state.queue, ['b.js']);
    vm.close();
    const a = history.store.state.entries.find((e) => e.path === 'a.js');
    assert.equal(a.status, 'failed');
    assert.equal(vm.store.state.job.path, 'b.js');
    await runAll();
    assert.equal(history.store.state.entries.find((e) => e.path === 'b.js').status, 'planned');
  } finally { mock.timers.reset(); }
});

test('undoing every change puts the file back in red and the task back to "planned"', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'x.js', reason: 'r', backup: { id: 'b', root: '/p' }, at: 't' };
    const { vm, security, history } = setup({ live: true, writes: [change] });
    vm.start('x.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(await vm.undo(entry.id, change), true);
    assert.equal(history.get(entry.id).status, 'planned');
    assert.equal(security.scoreOf('x.js').level, 'red');
  } finally { mock.timers.reset(); }
});

test('a change made outside this job (chat, editor) is not credited to the repair', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, change } = setup({ live: true, hold: true });
    change({ path: 'other.js', reason: 'from the chat', backup: { id: 'z' }, at: 'before' }); // before Remi starts
    vm.start('a.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'working'); // still waiting for the agent
    assert.equal(vm.store.state.job.step, 2);
  } finally { mock.timers.reset(); }
});

test('closing mid-run stops the agent, and its late write does not land in the next job', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, asks, change } = setup({ live: true, hold: true });
    vm.start('a.js');
    vm.start('b.js');
    await runAll();
    vm.close(); // a.js: agent still working
    assert.equal(asks[0].aborted, true);
    // a.js's write was requested before b.js's run started, and approved only now
    change({ path: 'a.js', reason: 'late write', backup: { id: 'late' }, requestedAt: new Date(Date.now() - 60_000).toISOString(), at: 'late' });
    asks[1].finish();
    await runAll();
    const b = history.store.state.entries.find((e) => e.path === 'b.js');
    assert.equal(b.status, 'planned');
    assert.equal(b.changes.length, 0);
  } finally { mock.timers.reset(); }
});

test('switching project cancels the job and the queue before the history changes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, asks } = setup({ live: true, hold: true });
    vm.start('a.js');
    vm.start('b.js');
    vm.reset();
    assert.equal(vm.store.state.job, null);
    assert.deepEqual(vm.store.state.queue, []);
    assert.equal(asks[0].aborted, true);
    assert.equal(history.store.state.entries[0].status, 'failed');
  } finally { mock.timers.reset(); }
});

test('undo survives a missing history entry and a created file counts as undoable', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const created = { path: 'new.js', reason: 'r', created: true, backup: { id: 'c' }, at: 't' };
    const { vm, history } = setup({ live: true, writes: [created] });
    vm.start('new.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(await vm.undo(entry.id, created), true);
    assert.equal(history.get(entry.id).status, 'planned');
    assert.equal(await vm.undo(999, created), true); // entry gone: no crash
  } finally { mock.timers.reset(); }
});
