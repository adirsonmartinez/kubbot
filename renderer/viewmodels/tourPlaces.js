// Where each stop of the tour is on the map. The map is a security radar (only top-level folders with
// problems have a building), so the other folders of the tour get a temporary "ghost" place while it
// lasts, on a slot no building uses. Pure.
//   placesFor(steps, { plaza, buildings }, { usesSupabase }) -> Map(step id -> place)
//   place: { kind: 'plaza'|'building'|'ghost', path, x, z, stand: { x, z }, zoom }
// A folder stop is its own place (apps/api and apps/web are two); a file goes to the place of the
// folder stop that holds it, else to its top folder; the project and root files are the plaza.
import { FOLDER, ghostSlots } from './layout.js';

const PLAZA_ZOOM = 1.6;
const FOLDER_ZOOM = 1.3;

const topOf = (path) => path.split('/')[0];
const inside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

// The robot stands between the place and the plaza, just off the folder's platform
export function standBy(x, z, gap) {
  const length = Math.hypot(x, z);
  if (!length) return { x: 1.1, z: 1.1 };
  return { x: x - (x / length) * gap, z: z - (z / length) * gap };
}

export function placesFor(steps, { plaza, buildings = [] } = {}, { usesSupabase = false } = {}) {
  const plazaPlace = { kind: 'plaza', path: '', x: 0, z: 0, stand: { x: 1.1, z: 1.1 }, zoom: PLAZA_ZOOM };
  const folders = steps.filter((s) => s.kind === 'folder' && s.target).map((s) => s.target);
  // Which path each stop is shown at ('' = the plaza)
  const pathOf = (step) => {
    const target = step.target ?? '';
    if (step.kind === 'place' || !target || !target.includes('/') && step.kind !== 'folder') return '';
    if (buildings.some((b) => b.path === topOf(target))) return topOf(target);
    if (step.kind === 'folder') return target;
    return folders.filter((f) => inside(target, f)).sort((a, b) => b.length - a.length)[0] ?? topOf(target);
  };
  const byPath = new Map([['', plazaPlace]]);
  const ghosts = [];
  for (const step of steps) {
    const path = pathOf(step);
    if (byPath.has(path) || ghosts.includes(path)) continue;
    const building = buildings.find((b) => b.path === path);
    if (building) byPath.set(path, { kind: 'building', path, x: building.x, z: building.z, stand: standBy(building.x, building.z, FOLDER.platform / 2 + 1), zoom: FOLDER_ZOOM });
    else ghosts.push(path);
  }
  ghostSlots(buildings.length, ghosts.length, { plazaSize: plaza?.size ?? 5, avoidSupabase: usesSupabase }).forEach((slot, i) => {
    byPath.set(ghosts[i], { kind: 'ghost', path: ghosts[i], x: slot.x, z: slot.z, stand: standBy(slot.x, slot.z, FOLDER.platform / 2 + 1), zoom: FOLDER_ZOOM });
  });
  return new Map(steps.map((s) => [s.id, byPath.get(pathOf(s))]));
}
