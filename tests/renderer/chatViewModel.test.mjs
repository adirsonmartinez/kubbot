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
