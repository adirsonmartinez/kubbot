import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectModel } from '../../renderer/models/projectModel.js';
import { createWorkspaceService } from '../../renderer/services/workspaceService.js';

// Fake bridge: only what ProjectModel uses
function fakeWorkspace({ create, onClose = () => {} }) {
  return {
    create: async () => create,
    close: async () => { onClose(); return { ok: true }; },
    tree: async () => ({ ok: true, data: [] }),
    read: async () => ({ ok: false }),
  };
}

test('creating a project opens the new, empty folder', async () => {
  const model = new ProjectModel(fakeWorkspace({ create: { ok: true, data: { name: 'mi-proyecto', root: '/tmp/mi-proyecto' } } }));
  const response = await model.create();
  assert.equal(response.ok, true);
  assert.equal(model.store.state.open, true);
  assert.equal(model.store.state.name, 'mi-proyecto');
  assert.deepEqual(model.store.state.tree, []);
});

test('a cancelled or refused creation leaves the current state as it was', async () => {
  const model = new ProjectModel(fakeWorkspace({ create: { ok: false, error: 'cancelado' } }));
  const response = await model.create();
  assert.equal(response.ok, false);
  assert.equal(model.store.state.open, false);
});

test('closing a project empties the state, starts a new session and releases the folder', async () => {
  let released = false;
  const model = new ProjectModel(fakeWorkspace({ create: { ok: true, data: { name: 'mi-proyecto', root: '/tmp/mi-proyecto' } }, onClose: () => { released = true; } }));
  await model.create();
  const { session } = model.store.state;
  await model.close();
  assert.equal(released, true);
  assert.equal(model.store.state.open, false);
  assert.equal(model.store.state.name, null);
  assert.deepEqual(model.store.state.tree, []);
  assert.equal(model.store.state.session, session + 1);
});

test('closing when nothing is open does nothing', async () => {
  let released = false;
  const model = new ProjectModel(fakeWorkspace({ create: null, onClose: () => { released = true; } }));
  await model.close();
  assert.equal(released, false);
  assert.equal(model.store.state.session, 0);
});

test('browser demo: a new project is empty and has no git, opening one shows the demo again', async () => {
  const ws = createWorkspaceService(null);
  assert.equal((await ws.create()).ok, true);
  assert.deepEqual((await ws.tree()).data, []);
  assert.equal((await ws.gitHistory()).data.isRepo, false);
  await ws.choose();
  assert.ok((await ws.tree()).data.length > 0);
  assert.equal((await ws.gitHistory()).data.isRepo, true);
});

// A project on disk: a tree and the text of some files
function diskWorkspace(name, tree, files = {}) {
  return {
    choose: async () => ({ ok: true, data: { name, root: `/tmp/${name}` } }),
    tree: async () => ({ ok: true, data: tree }),
    read: async (path) => (path in files ? { ok: true, data: files[path] } : { ok: false }),
  };
}
const f = (path) => ({ type: 'file', path });
const d = (path, children = []) => ({ type: 'dir', path, children });

test('integrations are detected from the project files', async () => {
  const model = new ProjectModel(diskWorkspace('tienda', [f('vercel.json'), f('package.json'), d('.github', [f('.github/ci.yml')])], {
    'package.json': JSON.stringify({ dependencies: { '@clerk/nextjs': '5', 'posthog-js': '1' } }),
  }));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['vercel', 'github', 'clerk', 'posthog']);
  assert.equal(model.store.state.usesSupabase, false);
  // What the files show is connected
  assert.deepEqual(model.store.state.integrationStatus, { vercel: 'connected', github: 'connected', clerk: 'connected', posthog: 'connected' });
});

test('a project without any shows no integrations', async () => {
  const model = new ProjectModel(diskWorkspace('notas', [f('README.md')]));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, []);
});

test('demo: the Platanus project shows all the demo integrations, Supabase included', async () => {
  const model = new ProjectModel(diskWorkspace('Platanus', [f('README.md')]));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['supabase', 'vercel', 'github', 'clerk', 'posthog']);
  assert.equal(model.store.state.usesSupabase, true);
  // The demo shows every state: connected, with an incident, disconnected
  const status = model.store.state.integrationStatus;
  assert.equal(status.vercel, 'connected');
  assert.equal(status.clerk, 'incident');
  assert.equal(status.posthog, 'disconnected');
});

test('integrations the welcome set up wait as pending until connected; Supabase is then not drawn as a live database', async () => {
  const setup = { pendingOf: (root) => (root === '/tmp/tienda' ? ['vercel', 'supabase'] : []) };
  const model = new ProjectModel(diskWorkspace('tienda', [f('vercel.json'), f('package.json')], {
    'package.json': JSON.stringify({ dependencies: { '@supabase/supabase-js': '2', '@clerk/nextjs': '5' } }),
  }), setup);
  await model.choose();
  assert.equal(model.store.state.root, '/tmp/tienda');
  assert.deepEqual(model.store.state.integrations, ['supabase', 'vercel', 'clerk']);
  assert.deepEqual(model.store.state.integrationStatus, { supabase: 'pending', vercel: 'pending', clerk: 'connected' });
  assert.equal(model.store.state.usesSupabase, false);
});

test('a pending integration only shows once its files are there', async () => {
  const setup = { pendingOf: () => ['vercel', 'supabase'] };
  const model = new ProjectModel(diskWorkspace('tienda', [f('README.md')]), setup);
  await model.choose();
  assert.deepEqual(model.store.state.integrations, []);
});
