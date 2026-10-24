import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { ChatViewModel } from '../../renderer/viewmodels/chatViewModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

test('map messages that arrive while an answer streams are shown when it ends', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    let finish;
    const agentModel = {
      reply: (_t, { onText }) => new Promise((resolve) => { finish = () => { onText('hola'); resolve({ text: 'hola' }); }; }),
    };
    const vm = new ChatViewModel({ agentModel, bus });
    const sending = vm.send('pregunta');
    bus.emit(EVENTS.repairFinished, { entry: { path: 'a.js', status: 'verified', changes: [], plan: [] } });
    finish();
    await sending;
    mock.timers.tick(5000);
    const texts = vm.store.state.messages.map((m) => m.text);
    assert.ok(texts.includes('hola'));
    assert.ok(texts.some((t) => t?.includes('a.js')), 'the queued repair message was shown');
    assert.equal(vm.store.state.typing, false);
  } finally {
    mock.timers.reset();
  }
});

test('a repair streams into one bubble and tool use starts a new one', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' });
  bus.emit(EVENTS.repairText, { path: 'a.js', delta: 'Qué ' });
  bus.emit(EVENTS.repairText, { path: 'a.js', delta: 'encontré' });
  bus.emit(EVENTS.repairTool, { path: 'a.js', name: 'platanus_read_file' });
  bus.emit(EVENTS.repairText, { path: 'a.js', delta: 'Listo' });
  const repairs = vm.store.state.messages.filter((m) => m.tone === 'repair').map((m) => m.text);
  assert.deepEqual(repairs, ['Qué encontré', 'Listo']);
});

test('a live answer is one run: steps for tools and subagents, then the result', async () => {
  const bus = createEventBus();
  const agentModel = {
    reply: async (_t, { onEvent, onText }) => {
      onEvent({ type: 'thinking', delta: 'Miro el mapa', parent: null });
      onEvent({ type: 'tool', id: 't1', name: 'list_risks', target: '', parent: null });
      onEvent({ type: 'tool_done', id: 't1', error: false });
      onEvent({ type: 'subagent', id: 's1', description: 'Revisar la base de datos', kind: 'Explore', parent: null });
      onEvent({ type: 'tool', id: 't2', name: 'read_file', target: 'db.sql', parent: 's1' });
      onEvent({ type: 'text', delta: 'Nada grave', parent: 's1' });
      onEvent({ type: 'tool_done', id: 't2', error: true });
      onEvent({ type: 'tool_done', id: 's1', error: false });
      onText('Todo **bien**');
      onEvent({ type: 'result', durationMs: 4200, turns: 3, inputTokens: 100, outputTokens: 50 });
      return { text: 'Todo **bien**' };
    },
  };
  const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: 'opus', effort: 'high' } } };
  const vm = new ChatViewModel({ agentModel, bus, connection });
  await vm.send('audita');
  const run = vm.store.state.messages.find((m) => m.run);
  assert.equal(run.text, 'Todo **bien**');
  assert.equal(run.thinking, 'Miro el mapa');
  assert.equal(run.run.status, 'done');
  assert.equal(run.run.model, 'opus');
  assert.deepEqual(run.run.steps.map((s) => [s.kind, s.name ?? s.description, s.status, s.parent]), [
    ['tool', 'list_risks', 'done', null],
    ['subagent', 'Revisar la base de datos', 'done', null],
    ['tool', 'read_file', 'error', 's1'],
  ]);
  assert.equal(run.run.steps[1].output, 'Nada grave');
  assert.deepEqual(run.run.result, { durationMs: 4200, turns: 3, inputTokens: 100, outputTokens: 50 });
  assert.equal(vm.store.state.messages.filter((m) => m.role === 'tool').length, 0, 'no loose tool lines');
});

test("the agent's suggestions become chips: questions are sent, actions run on the app", async () => {
  const bus = createEventBus();
  const calls = [];
  const actions = {
    repair: (path, from) => calls.push(['repair', path, from]),
    locate: (path) => calls.push(['locate', path]),
  };
  const answer = 'Listo.\n```sugerencias\n- ¿Qué hago ahora?\n- reparar: src/db.js\n- auditar: api/login.js\n- ver: src\n```';
  const agentModel = { reply: async (_t, { onText }) => { onText(answer); return { text: answer }; } };
  const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } };
  const vm = new ChatViewModel({ agentModel, bus, actions, connection });
  await vm.send('revisa');
  const chips = vm.store.state.chips;
  assert.deepEqual(chips.map((c) => c.kind), ['ask', 'repair', 'audit', 'locate']);
  assert.ok(chips[1].label.includes('db.js'));
  vm.choose(chips[1], 'button');
  vm.choose(chips[3]);
  assert.deepEqual(calls, [['repair', 'src/db.js', 'button'], ['locate', 'src']]);
  assert.ok(chips[2].prompt.includes('api/login.js'), 'audit sends the audit request as one message');
});

test('a suggestion without its app action is not offered', async () => {
  const bus = createEventBus();
  const answer = 'x\n```sugerencias\n- reparar: a.js\n- Otra pregunta\n```';
  const agentModel = { reply: async (_t, { onText }) => { onText(answer); return { text: answer }; } };
  const vm = new ChatViewModel({ agentModel, bus, actions: {} });
  await vm.send('hola');
  assert.deepEqual(vm.store.state.chips.map((c) => c.kind), ['ask']);
});

test('the agent gets the last messages of the person (to adapt how it talks)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const seen = [];
    const agentModel = { reply: async (_t, { recent }) => { seen.push(recent); return { text: 'ok' }; } };
    const vm = new ChatViewModel({ agentModel, bus });
    await vm.send('uno');
    mock.timers.tick(5000); // the demo's "typing…" delay
    await vm.send('dos');
    assert.deepEqual(seen, [[], ['uno']]);
  } finally {
    mock.timers.reset();
  }
});

test('opening a folder shows a card with its counts and what to do next', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const actions = { showRisks: () => {}, repairWorst: () => {} };
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({}) }, bus, actions });
    bus.emit(EVENTS.folderOpened, { name: 'src', path: 'src', files: 12, folders: 2, counts: { red: 1, yellow: 2, green: 9 } });
    mock.timers.tick(5000);
    const card = vm.store.state.messages.at(-1).card;
    assert.equal(card.kind, 'folder');
    assert.equal(card.name, 'src');
    assert.deepEqual(card.counts, { red: 1, yellow: 2, green: 9 });
    assert.deepEqual(card.actions.map((a) => a.kind), ['risks', 'repair', 'ask']);
  } finally {
    mock.timers.reset();
  }
});

test('selecting a risky file shows a card: what is it, repair, audit', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const actions = { repair: () => {} };
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({}) }, bus, actions });
    bus.emit(EVENTS.fileSelected, { path: 'src/db.js', level: 'red', reason: 'Clave a la vista', by: 'demo' });
    mock.timers.tick(5000);
    const { card } = vm.store.state.messages.at(-1);
    assert.equal(card.kind, 'file');
    assert.equal(card.level, 'red');
    assert.deepEqual(card.actions.map((a) => a.kind), ['ask', 'repair', 'audit']);
    assert.ok(card.actions[2].prompt.includes('src/db.js') && card.actions[2].prompt.includes('Clave a la vista'));
  } finally {
    mock.timers.reset();
  }
});
