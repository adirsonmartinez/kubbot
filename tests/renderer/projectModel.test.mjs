import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectModel } from '../../renderer/models/projectModel.js';
import { createWorkspaceService } from '../../renderer/services/workspaceService.js';

// Fake bridge: only what ProjectModel uses
function fakeWorkspace({ create }) {
  return {
    create: async () => create,
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

test('browser demo: a new project is empty and has no git, opening one shows the demo again', async () => {
  const ws = createWorkspaceService(null);
  assert.equal((await ws.create()).ok, true);
  assert.deepEqual((await ws.tree()).data, []);
  assert.equal((await ws.gitHistory()).data.isRepo, false);
  await ws.choose();
  assert.ok((await ws.tree()).data.length > 0);
  assert.equal((await ws.gitHistory()).data.isRepo, true);
});
