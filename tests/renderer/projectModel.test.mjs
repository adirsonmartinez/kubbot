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
