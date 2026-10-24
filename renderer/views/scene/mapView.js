// Draws the project map from MapViewModel: main building, folder buildings, roads and their labels.
// New buildings rise from the ground; buildings already seen in this session just appear.
import * as THREE from 'three';
import { groundLink, materials as M, warningSign } from './materials.js';
import { buildHeadquarters, HQ_BASE, HQ_TOWER } from './builders/headquartersBuilder.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { TAG_COLOR } from '../../models/folderTags.js';

const RISE_SPEED = 2.2;

const tagHtml = (tags = []) =>
  tags.length ? `<span class="tags">${tags.map((t) => `<em style="--c:${TAG_COLOR[t]}">${escapeHtml(strings.tags[t] ?? t)}</em>`).join('')}</span>` : '';
const crackHtml = (red) => (red ? `<span class="cracks">${strings.hover.cracks(red)}</span>` : '');

// Label text: friendly names in "vibe" mode, folder names and counts in "técnico"
function folderLabel(b, tech) {
  const title = tech ? `${escapeHtml(b.name)}/` : escapeHtml(b.friendly);
  const sub = tech ? strings.map.files(b.files) : escapeHtml(b.name);
  return `<strong>${title}</strong><span>${sub}</span>${tagHtml(b.tags)}${crackHtml(b.red)}`;
}

export function createMapView({ sceneView, labels, mapViewModel, modeModel }) {
  let group = null;
  let entries = new Map();      // path -> { group, label }
  let session = null;
  const seen = new Set();       // folders already shown this session (they do not animate again)
  const risers = [];            // { group, k }
  const signs = [];             // floating "!" over cracked buildings: { sign, baseY, phase }

  // Cracks and the "!" sign are clickable on their own: they open the crack menu (see, repair, audit)
  function markCracks(group, path, level, top, x, z) {
    group.traverse((o) => { if (o.userData.crack) o.userData.pick = { type: 'crack', path }; });
    if (level !== 'red') return null;
    // Floating at the front corner, half-way up next to the cracks (the label sits on top of the roof)
    const sign = warningSign(1.2);
    const y = Math.max(top * 0.55, 2.2);
    sign.position.set(x + 2.6, y, z + 2.6);
    sign.userData.pick = { type: 'crack', path };
    group.parent.add(sign);
    signs.push({ sign, baseY: y, phase: signs.length * 0.7 });
    return sign;
  }
  const hidden = new Set();     // buildings replaced by an open building

  function clear() {
    if (group) sceneView.scene.remove(group);
    entries.forEach((e) => e.label.remove());
    entries = new Map();
    risers.length = 0;
    signs.length = 0;
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
    sceneView.scene.add(group);

    // Main building: the root folder
    const tech = modeModel.tech;
    const hq = buildHeadquarters(state.root.height, state.root.level);
    hq.userData.pick = { type: 'folder', path: '' };
    group.add(hq);
    const rootLabel = labels.add({
      html: `<strong>${escapeHtml(state.projectName)}</strong><span>${strings.map.rootSummary(state.root.total, state.root.dirs)}</span>${crackHtml(state.root.red)}`,
      anchor: { x: HQ_TOWER.x, y: HQ_BASE + state.root.height + 5.6, z: HQ_TOWER.z },
      className: 'root',
    });
    const hqSign = markCracks(hq, '', state.root.level, HQ_BASE + state.root.height + 1, HQ_TOWER.x, HQ_TOWER.z);
    entries.set('', { group: hq, label: rootLabel, sign: hqSign });

    // First-level folders around it
    state.buildings.forEach((b) => {
      groundLink(group, M.road, 0, 0, b.x, b.z, 0.7, 0.05).castShadow = false;
      const building = buildFolderBuilding(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      const label = labels.add({
        html: folderLabel(b, tech),
        className: b.level === 'red' ? 'cracked' : '',
        anchor: { x: b.x, y: building.top + 0.9, z: b.z },
      });
      const sign = markCracks(building.group, b.path, b.level, building.top + 1.2, b.x, b.z);
      entries.set(b.path, { group: building.group, label, sign });
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
    if (entry.sign) entry.sign.visible = !isHidden;
  }

  mapViewModel.store.subscribe((state, previous) => {
    if (!previous || state.version !== previous.version) render(state);
  }, { immediate: true });
  modeModel.store.subscribe((state, previous) => {
    if (state.mode !== previous.mode) render(mapViewModel.store.state);
  });

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sceneView.onFrame((t, dt) => {
    // Cracks breathe: the red glow pulses (shared material, so every crack at once)
    if (!still) M.crackGlow.emissiveIntensity = 0.55 + 0.45 * Math.sin(t * 4);
    for (const s of signs) {
      s.sign.position.y = s.baseY + (still ? 0 : Math.sin(t * 2.4 + s.phase) * 0.25);
      if (!still) s.sign.rotation.y = Math.sin(t * 1.2 + s.phase) * 0.5;
    }
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
