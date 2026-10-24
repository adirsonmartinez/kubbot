// Draws the project map from MapViewModel: main building, folder buildings, roads and their labels.
// New buildings rise from the ground; buildings already seen in this session just appear.
import * as THREE from 'three';
import { groundLink, materials as M } from './materials.js';
import { buildHeadquarters, HQ_BASE, HQ_TOWER } from './builders/headquartersBuilder.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const RISE_SPEED = 2.2;

export function createMapView({ sceneView, labels, mapViewModel }) {
  let group = null;
  let entries = new Map();      // path -> { group, label }
  let session = null;
  const seen = new Set();       // folders already shown this session (they do not animate again)
  const risers = [];            // { group, k }
  const hidden = new Set();     // buildings replaced by an open building

  function clear() {
    if (group) sceneView.layers.map.remove(group);
    entries.forEach((e) => e.label.remove());
    entries = new Map();
    risers.length = 0;
    group = null;
  }

  function render(state) {
    clear();
    if (state.status !== 'ready') return;
    if (state.session !== session) {
      session = state.session;
      seen.clear();
    }

    group = new THREE.Group();
    sceneView.layers.map.add(group);

    // Main building: the root folder
    const hq = buildHeadquarters(state.root.height);
    hq.userData.pick = { type: 'folder', path: '' };
    group.add(hq);
    const rootLabel = labels.add({
      html: `<strong>${escapeHtml(state.projectName)}</strong><span>${strings.map.rootSummary(state.root.total, state.root.dirs)}</span>`,
      anchor: { x: HQ_TOWER.x, y: HQ_BASE + state.root.height + 5.6, z: HQ_TOWER.z },
      className: 'root',
    });
    entries.set('', { group: hq, label: rootLabel });

    // First-level folders around it
    state.buildings.forEach((b) => {
      groundLink(group, M.road, 0, 0, b.x, b.z, 0.7, 0.05).castShadow = false;
      const building = buildFolderBuilding(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      const label = labels.add({
        html: `<strong>${escapeHtml(b.name)}/</strong><span>${strings.map.files(b.files)}</span>`,
        anchor: { x: b.x, y: building.top + 0.9, z: b.z },
      });
      entries.set(b.path, { group: building.group, label });
      if (!seen.has(b.path)) {
        seen.add(b.path);
        building.group.scale.y = 0.001;
        risers.push({ group: building.group, k: -b.order * 0.06 }); // staggered
      }
    });

    hidden.forEach((path) => apply(path, true));
  }

  function apply(path, isHidden) {
    const entry = entries.get(path);
    if (!entry) return;
    entry.group.visible = !isHidden;
    entry.label.el.hidden = isHidden;
  }

  mapViewModel.store.subscribe((state, previous) => {
    if (!previous || state.version !== previous.version) render(state);
  }, { immediate: true });

  sceneView.onFrame((_t, dt) => {
    for (let i = risers.length - 1; i >= 0; i--) {
      const r = risers[i];
      r.k = Math.min(r.k + dt * RISE_SPEED, 1);
      const k = Math.max(r.k, 0);
      r.group.scale.y = Math.max(1 - (1 - k) ** 3, 0.001);
      if (r.k >= 1) risers.splice(i, 1);
    }
  });

  return {
    pickTargets: () => (group ? [group] : []),
    // The tower view hides a building while its open version is on screen
    setBuildingHidden(path, isHidden) {
      if (isHidden) hidden.add(path); else hidden.delete(path);
      apply(path, isHidden);
    },
  };
}
