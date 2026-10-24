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
