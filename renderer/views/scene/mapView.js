// Draws the project map from MapViewModel: main building, folder buildings, roads and their labels.
// New buildings rise from the ground; buildings already seen in this session just appear.
// A cyan pulse travels along each road, from the main building to the folder.
import * as THREE from 'three';
import { groundLink, materials as M } from './materials.js';
import { buildHeadquarters, HQ_BASE, HQ_TOWER } from './builders/headquartersBuilder.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const RISE_SPEED = 2.2;
const PULSE_SPEED = 0.35; // road lengths per second
const pulseGeometry = new THREE.BoxGeometry(0.9, 0.08, 0.16);

// Second line of a building label: its problems, if any
function riskLine(counts) {
  if (counts.red) return `<em class="risk">${strings.map.risk(counts.red)}</em>`;
  if (counts.yellow) return `<em class="review">${strings.map.review(counts.yellow)}</em>`;
  return '';
}

export function createMapView({ sceneView, labels, mapViewModel }) {
  let group = null;
  let entries = new Map();      // path -> { group, label }
  let session = null;
  const seen = new Set();       // folders already shown this session (they do not animate again)
  const risers = [];            // { group, k }
  const pulses = [];            // { mesh, to, phase }
  const hidden = new Set();     // buildings replaced by an open building

  function clear() {
    if (group) sceneView.layers.map.remove(group);
    entries.forEach((e) => e.label.remove());
    entries = new Map();
    risers.length = 0;
    pulses.length = 0;
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
      html: `<strong>${escapeHtml(state.projectName)}</strong><span>${strings.map.rootSummary(state.root.total, state.root.dirs)}</span>${riskLine(state.root.counts)}`,
      anchor: { x: HQ_TOWER.x, y: HQ_BASE + state.root.height + 5.6, z: HQ_TOWER.z },
      className: 'root',
    });
    entries.set('', { group: hq, label: rootLabel });

    // First-level folders around it
    state.buildings.forEach((b) => {
      groundLink(group, M.road, 0, 0, b.x, b.z, 0.35, 0.05).castShadow = false;
      const pulse = new THREE.Mesh(pulseGeometry, M.accentLit);
      pulse.rotation.y = -Math.atan2(b.z, b.x);
      group.add(pulse);
      pulses.push({ mesh: pulse, to: { x: b.x, z: b.z }, phase: (b.order * 0.37) % 1 });
      const building = buildFolderBuilding(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      const label = labels.add({
        html: `<strong>${escapeHtml(b.name)}/</strong><span>${strings.map.files(b.files)}</span>${riskLine(b.counts)}`,
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

  sceneView.onFrame((t, dt) => {
    pulses.forEach((p) => {
      const k = (t * PULSE_SPEED + p.phase) % 1;
      p.mesh.position.set(p.to.x * k, 0.06, p.to.z * k);
      p.mesh.visible = k > 0.18 && k < 0.85; // hidden under the platforms at both ends
    });
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
