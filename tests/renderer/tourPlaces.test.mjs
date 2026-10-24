// Where each stop of the tour is on the map: the plaza, a building that is already there, or a
// temporary "ghost" place for a folder with no problems (the radar does not draw those).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placesFor } from '../../renderer/viewmodels/tourPlaces.js';
import { folderSlots, ghostSlots } from '../../renderer/viewmodels/layout.js';

const map = { plaza: { size: 5 }, buildings: [{ path: 'src', x: 12, z: 0 }] };
const steps = [
  { id: 'place', kind: 'place', target: '' },
  { id: 'doc1', kind: 'doc', target: 'README.md' },
  { id: 'part1', kind: 'folder', target: 'src' },
  { id: 'part2', kind: 'folder', target: 'public' },
  { id: 'entry', kind: 'file', target: 'src/server.js' },
  { id: 'case1', kind: 'usecase', target: 'api/routes/orders.js' },
  { id: 'part3', kind: 'folder', target: 'apps/web' },
  { id: 'part4', kind: 'folder', target: 'apps/api' },
  { id: 'case2', kind: 'usecase', target: 'apps/api/src/routes/orders.ts' },
  { id: 'start', kind: 'start', target: 'README.md' },
];

test('ghost slots never take a building slot', () => {
  const taken = folderSlots(3, { plazaSize: 5 }).map((s) => `${s.x},${s.z}`);
  for (const g of ghostSlots(3, 4, { plazaSize: 5 })) assert.ok(!taken.includes(`${g.x},${g.z}`));
  assert.equal(ghostSlots(3, 4, { plazaSize: 5 }).length, 4);
});

test('the plaza, root files, buildings and ghosts', () => {
  const places = placesFor(steps, map);
  assert.equal(places.get('place').kind, 'plaza');
  assert.equal(places.get('doc1').kind, 'plaza');
  const src = places.get('part1');
  assert.deepEqual([src.kind, src.x, src.z, src.path], ['building', 12, 0, 'src']);
  assert.equal(places.get('entry').path, 'src', 'a file goes to its top folder');
  const pub = places.get('part2');
  const api = places.get('case1');
  assert.equal(pub.kind, 'ghost');
  assert.equal(api.kind, 'ghost');
  assert.notDeepEqual([pub.x, pub.z], [api.x, api.z]);
  assert.notDeepEqual([pub.x, pub.z], [12, 0]);
});

test('the robot stands on the plaza side of a place, close enough to see it', () => {
  const src = placesFor(steps, map).get('part1');
  assert.ok(Math.hypot(src.stand.x, src.stand.z) < Math.hypot(src.x, src.z));
  assert.ok(Math.hypot(src.stand.x - src.x, src.stand.z - src.z) < 5);
});

test('ghosts keep away from the Supabase node when it is shown', () => {
  const places = placesFor(steps, { ...map, buildings: [] }, { usesSupabase: true });
  for (const p of places.values()) if (p.kind === 'ghost') assert.ok(!(p.x > 0 && p.x < 28.5 && Math.abs(p.z) < 7.5), `${p.x},${p.z}`);
});

test('the list of ghosts (what the view draws)', () => {
  const places = placesFor(steps, map);
  const ghosts = [...places.values()].filter((p) => p.kind === 'ghost').map((p) => p.path);
  assert.deepEqual([...new Set(ghosts)], ['public', 'api', 'apps/web', 'apps/api'], 'each folder stop is its own place');
  assert.equal(places.get('case2'), places.get('part4'), 'a file goes to the folder stop that holds it');
});
