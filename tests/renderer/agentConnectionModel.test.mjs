import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentConnectionModel } from '../../renderer/models/agentConnectionModel.js';

// Fake bridge: each run emits text and finishes when the test calls finish(runId)
function fakeService() {
  const listeners = new Set();
  const runs = [];
  return {
    runs,
    isDesktop: true,
    detect: async () => ({ ok: true, data: [{ id: 'claude', label: 'Claude', installed: true, loggedIn: true }] }),
    mcpInfo: async () => ({ ok: true, data: { url: 'http://127.0.0.1:7811/mcp', running: true } }),
    onMcpStatus: () => () => {},
    onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    run: async (req) => { const runId = String(runs.length + 1); runs.push({ runId, req }); return { ok: true, data: runId }; },
    emit: (e) => listeners.forEach((cb) => cb(e)),
    finish(runId, text) { this.emit({ runId, type: 'text', delta: text }); this.emit({ runId, type: 'done' }); },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('runs are serialized: the second starts only after the first is done', async () => {
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const first = m.ask('uno', 'sys');
  const second = m.ask('dos', 'sys', { session: 'repair' });
  await tick();
  assert.equal(svc.runs.length, 1);
  svc.finish('1', 'A');
  assert.equal((await first).text, 'A');
  await tick();
  assert.equal(svc.runs.length, 2);
  svc.finish('2', 'B');
  assert.equal((await second).text, 'B');
});

test('chat continues its conversation; repair jobs never do', async () => {
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  for (const [i, session] of [['1', 'chat'], ['2', 'chat'], ['3', 'repair'], ['4', 'repair']]) {
    const p = m.ask('x', 'sys', { session });
    await tick();
    svc.finish(i, 'ok');
    await p;
  }
  assert.deepEqual(svc.runs.map((r) => [r.req.session, r.req.continued]), [['chat', false], ['chat', true], ['repair', false], ['repair', false]]);
});

test('a rejected bridge call resolves with an error instead of hanging', async () => {
  const svc = fakeService();
  svc.run = async () => { throw new Error('ipc down'); };
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const r = await m.ask('x', 'sys');
  assert.equal(r.error, 'ipc down');
});

test('a queued question keeps the agent, model and effort chosen when it was asked', async () => {
  const svc = fakeService();
  svc.detect = async () => ({ ok: true, data: [
    { id: 'claude', label: 'Claude', installed: true, loggedIn: true },
    { id: 'grok', label: 'Grok', installed: true, loggedIn: true },
  ] });
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  m.setEffort('high');
  const first = m.ask('uno', 'sys');
  const second = m.ask('dos', 'sys');
  m.select('grok'); // switched while the second one waits in line
  await tick();
  svc.finish('1', 'A');
  await first;
  await tick();
  svc.finish('2', 'B');
  await second;
  assert.deepEqual(svc.runs.map((r) => [r.req.agent, r.req.effort]), [['claude', 'high'], ['claude', 'high']]);
});

test('a cancelled question never starts if it was waiting, and stops the CLI if it was running', async () => {
  const svc = fakeService();
  const cancelled = [];
  svc.cancel = async (runId) => { cancelled.push(runId); svc.emit({ runId, type: 'done' }); };
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const running = new AbortController();
  const waiting = new AbortController();
  let started = null;
  const first = m.ask('uno', 'sys', { signal: running.signal, onStart: (id) => { started = id; } });
  const second = m.ask('dos', 'sys', { signal: waiting.signal });
  await tick();
  assert.equal(started, '1');
  waiting.abort();
  running.abort();
  await first;
  const r2 = await second;
  assert.deepEqual(cancelled, ['1']);
  assert.equal(svc.runs.length, 1, 'the waiting question never ran');
  assert.equal(r2.error, 'cancelled');
});
