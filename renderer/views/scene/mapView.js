// Draws one folder level from MapViewModel: the plaza with the folder's files in the middle and its
// subfolders as blocks around it, linked by roads with purple pulses. Entering a folder plays a short
// transition (its block grows and fades, the rest sinks), then the new level rises.
// Labels follow the mode: friendly names in Vibe, folder names and counts in Dev.
import * as THREE from 'three';
import { groundLink, materials as M, warningSign } from './materials.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { buildBlock } from './builders/blockBuilder.js';
import { buildPlaza } from './builders/plazaBuilder.js';
import { escapeHtml, hashString } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { TAG_COLOR } from '../../models/folderTags.js';

// 'blocks': plain cubes (temporary, while the building design is defined); 'detailed': full buildings
const BUILDING_STYLE = 'blocks';
const FOLDER_BLOCK_SIZE = 3;

const RISE_SPEED = 2.2;
const CUBE_RISE_STAGGER = 0.015;
const PULSE_SPEED = 0.35; // road lengths per second
const TRANSITION_SECONDS = 0.35;
const pulseGeometry = new THREE.BoxGeometry(0.9, 0.08, 0.16);

const tagHtml = (tags = []) =>
  tags.length ? `<span class="tags">${tags.map((t) => `<em style="--c:${TAG_COLOR[t]}">${escapeHtml(strings.tags[t] ?? t)}</em>`).join('')}</span>` : '';

// Last line of a label: its problems, if any
function riskLine(counts) {
  if (counts.red) return `<em class="risk">${strings.hover.cracks(counts.red)}</em>`;
  if (counts.yellow) return `<em class="review">${strings.map.review(counts.yellow)}</em>`;
  return '';
}

function folderLabel(b, tech) {
  const title = tech || !b.friendly ? `${escapeHtml(b.name)}/` : escapeHtml(b.friendly);
  const sub = tech ? strings.map.files(b.files) : `${escapeHtml(b.name)}/`;
  return `<strong>${title}</strong><span>${sub}</span>${tagHtml(b.tags)}${riskLine(b.counts)}`;
}

export function createMapView({ sceneView, labels, mapViewModel, modeModel }) {
  let group = null;
  let ownLabels = [];
  let entries = new Map();      // folder path -> { group } (blocks on screen)
  let shownPath = null;         // level on screen
  let session = null;
  const seen = new Set();       // levels already shown this session (they do not rise again)
  const risers = [];            // { group, k }
  const fileCubes = [];         // { mesh, height, baseY, index }
  let cubeT = 0;
  const pulses = [];            // { mesh, to, phase }
  let transition = null;        // { target, t, done }
  const signs = [];             // floating "!" over cracked blocks: { sign, baseY, phase }

  // Cracks and the "!" sign are clickable on their own: they open the crack menu (see, repair, audit)
  function markCracks(building, path, level, top, x, z) {
    building.traverse((o) => { if (o.userData.crack) o.userData.pick = { type: 'crack', path }; });
    if (level !== 'red') return;
    // Floating at the front corner, half-way up next to the cracks (the label sits on top)
    const sign = warningSign(1.2);
    const y = Math.max(top * 0.55, 2.2);
    sign.position.set(x + 2.6, y, z + 2.6);
    sign.userData.pick = { type: 'crack', path };
    group.add(sign);
    signs.push({ sign, baseY: y, phase: signs.length * 0.7 });
  }

  function clear() {
    if (group) sceneView.layers.map.remove(group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    entries = new Map();
    risers.length = 0;
    fileCubes.length = 0;
    pulses.length = 0;
    signs.length = 0;
    group = null;
  }

  function render(state, { animate = true } = {}) {
    clear();
    shownPath = state.path;
    if (state.status !== 'ready') return;
    if (state.session !== session) {
      session = state.session;
      seen.clear();
    }
    const firstVisit = animate && !seen.has(state.path);
    seen.add(state.path);
    const tech = modeModel.tech;

    group = new THREE.Group();
    sceneView.layers.map.add(group);

    // Plaza with the folder's own files
    const { plaza } = state;
    const built = buildPlaza(plaza);
    group.add(built.group);
    fileCubes.push(...built.cubes);
    cubeT = firstVisit ? 0 : Infinity;
    if (firstVisit) built.cubes.forEach(({ mesh }) => { mesh.scale.y = 0.001; });
    ownLabels.push(labels.add({
      html: `<strong>${escapeHtml(plaza.name)}</strong><span>${strings.map.levelSummary(plaza.total, plaza.folders)}</span>${riskLine(plaza.counts)}`,
      anchor: { x: 0, y: built.top + 2, z: -plaza.size / 2 },
      className: 'root',
    }));

    // Subfolders around it
    state.buildings.forEach((b) => {
      groundLink(group, M.road, 0, 0, b.x, b.z, 0.35, 0.05).castShadow = false;
      const pulse = new THREE.Mesh(pulseGeometry, M.accentLit);
      pulse.rotation.y = -Math.atan2(b.z, b.x);
      group.add(pulse);
      pulses.push({ mesh: pulse, to: { x: b.x, z: b.z }, phase: (b.order * 0.37) % 1 });

      const building = BUILDING_STYLE === 'blocks'
        ? buildBlock({ size: FOLDER_BLOCK_SIZE, height: b.height, level: b.level, seed: hashString(b.path) })
        : buildFolderBuilding(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      ownLabels.push(labels.add({
        html: folderLabel(b, tech),
        className: b.level === 'red' ? 'cracked' : '',
        anchor: { x: b.x, y: building.top + 0.9, z: b.z },
      }));
      entries.set(b.path, { group: building.group });
      markCracks(building.group, b.path, b.level, building.top + 1.2, b.x, b.z);
      if (firstVisit) {
        building.group.scale.y = 0.001;
        risers.push({ group: building.group, k: -b.order * 0.06 }); // staggered
      }
    });
  }

  // Entering a folder that is on screen: its block grows and fades, everything else sinks, then redraw
  function playEnter(state) {
    const entry = entries.get(state.path);
    if (!entry || !group) return render(state);
    const target = entry.group;
    target.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; }
    });
    ownLabels.forEach((l) => { l.el.hidden = true; });
    transition = { target, t: 0, done: () => render(state) };
  }

  mapViewModel.store.subscribe((state, previous) => {
    if (previous && state.version === previous.version) return;
    const goingDeeper = previous && state.session === previous.session && shownPath !== null &&
      state.path !== shownPath && state.path.startsWith(shownPath ? `${shownPath}/` : '');
    if (goingDeeper && !transition) playEnter(state);
    else render(state);
  }, { immediate: true });

  // Switching Vibe/Dev only rewrites the labels: redraw without the rise animation
  modeModel.store.subscribe((state, previous) => {
    if (state.mode !== previous.mode && !transition) render(mapViewModel.store.state, { animate: false });
  });

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sceneView.onFrame((t, dt) => {
    // Cracks breathe: the red glow pulses (shared material, so every crack at once)
    if (!still) M.crackGlow.emissiveIntensity = 0.55 + 0.45 * Math.sin(t * 4);

    if (transition) {
      transition.t += dt / TRANSITION_SECONDS;
      const k = Math.min(transition.t, 1);
      const s = 1 + k * 1.6;
      transition.target.scale.set(s, 1 + k * 0.4, s);
      transition.target.traverse((o) => { if (o.isMesh) o.material.opacity = 1 - k; });
      group?.children.forEach((c) => { if (c !== transition.target) c.position.y = -k * 1.5; });
      if (k >= 1) {
        const { done } = transition;
        transition = null;
        done();
      }
    }

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

    if (cubeT !== Infinity) {
      cubeT += dt * 3;
      let rising = false;
      fileCubes.forEach(({ mesh, height, baseY, index }) => {
        const k = Math.min(Math.max(cubeT - index * CUBE_RISE_STAGGER, 0), 1);
        if (k < 1) rising = true;
        const h = Math.max(height * (1 - (1 - k) ** 3), 0.001);
        mesh.scale.y = h;
        mesh.position.y = baseY + h / 2; // grow from the plaza, not from the middle
      });
      if (!rising) cubeT = Infinity;
    }

    pulses.forEach((p) => {
      const k = (t * PULSE_SPEED + p.phase) % 1;
      p.mesh.position.set(p.to.x * k, 0.06, p.to.z * k);
      p.mesh.visible = k > 0.18 && k < 0.85; // hidden under the platforms at both ends
    });
  });

  return {
    pickTargets: () => (group && !transition ? [group] : []),
  };
}
