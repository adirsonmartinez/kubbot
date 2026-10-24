// Draws the project map from MapViewModel: the project's plaza in the middle (its root files), every
// top-level folder around it, linked by plain roads, and the open folder's subfolders (small folders)
// and files on a tray beside it. Problems glow; anything that appears for the first time rises from the
// ground. Labels follow the mode (friendly names in Vibe, folder names and counts in Dev); files only get
// one when they have a problem, so a big project does not drown in names (hover shows the rest).
import * as THREE from 'three';
import { groundLink, materials as M } from './materials.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { buildBlock } from './builders/blockBuilder.js';
import { buildFolderIcon } from './builders/folderIconBuilder.js';
import { buildFileTray, buildPlaza } from './builders/plazaBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { TAG_COLOR } from '../../models/folderTags.js';
import { FOLDER } from '../../viewmodels/layout.js';

// 'folders': isometric folders; 'blocks': plain cubes; 'detailed': full buildings
const BUILDING_STYLE = 'folders';

const RISE_SPEED = 2.2;
const SUBFOLDER_SCALE = 0.3; // folders inside the open one, on its tray
const ICON_RISE_STAGGER = 0.06;

const tagHtml = (tags = []) =>
  tags.length ? `<span class="tags">${tags.map((t) => `<em style="--c:${TAG_COLOR[t]}">${escapeHtml(strings.tags[t] ?? t)}</em>`).join('')}</span>` : '';

// Last line of a label: its problems, if any
function riskLine(counts) {
  if (counts.red) return `<em class="risk">${strings.map.risk(counts.red)}</em>`;
  if (counts.yellow) return `<em class="review">${strings.map.review(counts.yellow)}</em>`;
  return '';
}

function folderLabel(b, tech) {
  const title = tech || !b.friendly ? `${escapeHtml(b.name)}/` : escapeHtml(b.friendly);
  const sub = tech ? strings.map.files(b.files) : `${escapeHtml(b.name)}/`;
  return `<strong>${title}</strong><span>${sub}</span>${tagHtml(b.tags)}${riskLine(b.counts)}`;
}

const hasProblem = (f) => f.level === 'yellow' || f.level === 'red';
const subfolderLabel = (f) => `<strong>${escapeHtml(f.name)}/</strong>${riskLine(f.counts)}`;

// Files on the map are always direct children of what is shown (the plaza or the open folder): the name is enough
const fileLabel = (f) => `<strong class="${f.level}">${escapeHtml(f.name)}</strong>`;

export function createMapView({ sceneView, labels, mapViewModel, modeModel }) {
  let group = null;
  let ownLabels = [];
  let session = null;
  const seen = new Set();       // 'folder:path' / 'file:path' already shown this session (they do not rise again)
  const risers = [];            // { group, k, to: final scale.y }
  function clear() {
    if (group) sceneView.layers.map.remove(group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    risers.length = 0;
    group = null;
  }

  // Things shown for the first time rise from the ground, one after the other
  function rise(key, object, delay, animate) {
    const isNew = !seen.has(key);
    seen.add(key);
    if (!animate || !isNew) return;
    risers.push({ group: object, k: -delay, to: object.scale.y });
    object.scale.y = 0.001;
  }

  function addFiles(built, files, animate) {
    built.icons.forEach(({ mesh, index }) => {
      const f = files[index];
      rise(`file:${f.path}`, mesh, index * ICON_RISE_STAGGER, animate);
      if (!hasProblem(f)) return;
      ownLabels.push(labels.add({
        html: fileLabel(f),
        anchor: { x: mesh.position.x + built.group.position.x, y: built.top + 1.2, z: mesh.position.z + built.group.position.z },
        className: 'file',
      }));
    });
  }

  // "+N" in front of a group of files that did not all fit
  function addMore(count, x, z) {
    if (count > 0) ownLabels.push(labels.add({ html: `<span>${strings.map.more(count)}</span>`, anchor: { x, y: 0.3, z }, className: 'more', align: 'below' }));
  }

  function render(state, { animate = true } = {}) {
    clear();
    if (state.status !== 'ready') return;
    if (state.session !== session) {
      session = state.session;
      seen.clear();
    }
    const tech = modeModel.tech;

    group = new THREE.Group();
    sceneView.layers.map.add(group);

    // The project's plaza with its root files
    const { plaza, root } = state;
    const built = buildPlaza(plaza);
    group.add(built.group);
    addFiles(built, plaza.files, animate);
    addMore(plaza.more, plaza.size / 2, plaza.size / 2);
    const summary = root.red + root.yellow ? strings.map.watched(root.total) : strings.map.allClear;
    ownLabels.push(labels.add({
      html: `<strong>${escapeHtml(plaza.name)}</strong><span>${summary}</span>${riskLine(root.counts)}`,
      anchor: { x: 0, y: built.top + 2, z: -plaza.size / 2 },
      className: 'root',
    }));

    // Every top-level folder around it
    state.buildings.forEach((b) => {
      groundLink(group, M.road, 0, 0, b.x, b.z, 0.35, 0.05).castShadow = false;
      const building = BUILDING_STYLE === 'folders'
        ? buildFolderIcon({ size: FOLDER.size, files: b.files, level: b.level })
        : BUILDING_STYLE === 'blocks'
          ? buildBlock({ size: FOLDER.size, height: b.height, level: b.level })
          : buildFolderBuilding(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      ownLabels.push(labels.add({
        html: folderLabel(b, tech),
        anchor: { x: b.x, y: building.top + 0.9, z: b.z },
        className: b.open ? 'open' : '',
      }));
      rise(`folder:${b.path}`, building.group, b.order * 0.06, animate);
    });

    // The open folder's contents on a tray beside its top-level folder: subfolders, then files
    const { opened } = state;
    if (opened) {
      const folder = state.buildings.find((b) => b.path === opened.top);
      groundLink(group, M.road, folder.x, folder.z, opened.x, opened.z, 0.35, 0.05).castShadow = false;
      const tray = buildFileTray(opened);
      group.add(tray.group);
      opened.folders.forEach((f, i) => {
        const sub = buildFolderIcon({ size: FOLDER.size, files: f.files, level: f.level });
        sub.group.scale.setScalar(SUBFOLDER_SCALE);
        sub.group.position.set(f.x, tray.top, f.z);
        sub.group.traverse((o) => { o.userData.pick = { type: 'folder', path: f.path }; });
        group.add(sub.group);
        ownLabels.push(labels.add({ html: subfolderLabel(f), anchor: { x: f.x, y: tray.top + sub.top * SUBFOLDER_SCALE + 0.5, z: f.z }, className: 'file' }));
        rise(`folder:${f.path}`, sub.group, i * ICON_RISE_STAGGER, animate);
      });
      addFiles(tray, opened.files, animate);
      addMore(opened.more, opened.x + opened.size / 2, opened.z + opened.size / 2);
    }
  }

  mapViewModel.store.subscribe((state, previous) => {
    if (previous && state.version === previous.version) return;
    render(state);
  }, { immediate: true });

  // Switching Vibe/Dev only rewrites the labels: redraw without the rise animation
  modeModel.store.subscribe((state, previous) => {
    if (state.mode !== previous.mode) render(mapViewModel.store.state, { animate: false });
  });

  sceneView.onFrame((t, dt) => {
    for (let i = risers.length - 1; i >= 0; i--) {
      const r = risers[i];
      r.k = Math.min(r.k + dt * RISE_SPEED, 1);
      const k = Math.max(r.k, 0);
      r.group.scale.y = Math.max((1 - (1 - k) ** 3) * r.to, 0.001);
      if (r.k >= 1) risers.splice(i, 1);
    }
  });

  return {
    pickTargets: () => (group ? [group] : []),
  };
}
