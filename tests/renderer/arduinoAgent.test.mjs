// Without an agent connected, the chat's scripted brain answers an Arduino request by opening the lab's
// example (spec/005-arduino-lab.md); with nothing to open it keeps its usual answers. Its replies are
// awaited, so the follow-up action is `after` (a `then` method made "simular ataque" hang forever).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentModel } from '../../renderer/models/agentModel.js';
import { strings } from '../../renderer/i18n/es.js';

const deps = (lab, { open = false, supabase = { vulnerable: false } } = {}) => ({
  workspace: { isDesktop: false, current: async () => ({ data: null }) },
  projectModel: { store: { state: { open } } },
  supabaseModel: supabase,
  lab,
});

test('«quiero un sensor que pite cuando algo se acerca» opens the proximity example in the lab, after the reply', async () => {
  let opened = 0;
  const agent = new AgentModel(deps({ open: () => opened++ }));
  const reply = await agent.reply('quiero un sensor que pite cuando algo se acerca');
  assert.ok(reply.text.startsWith(strings.lab.scripted.intro));
  assert.equal(opened, 0, 'nothing happens until the chat shows the reply');
  reply.after();
  assert.equal(opened, 1);
});

test('a reply with an action resolves (the scripted «simular ataque» used to hang)', async () => {
  let vulnerable = false;
  const agent = new AgentModel(deps(null, { open: true, supabase: { vulnerable: false, setVulnerable: (v) => { vulnerable = v; } } }));
  const reply = await agent.reply('simular ataque');
  assert.equal(typeof reply.then, 'undefined');
  assert.equal(vulnerable, false);
  reply.after();
  assert.equal(vulnerable, true);
});

test('other questions keep their answers', async () => {
  const agent = new AgentModel(deps({ open: () => assert.fail('should not open') }));
  const reply = await agent.reply('hola');
  assert.ok(!reply.text.includes(strings.lab.scripted.intro));
});
