// Draws the security map from MapViewModel: the project's plaza in the middle (root files with a
// problem), the top-level folders that hold a problem around it, linked by plain roads, and the
// problem files of the open folder lying flat beside it. Anything that appears for the first time
// rises from the ground; fixed files and folders simply disappear on the next redraw.
// Labels follow the mode: friendly names in Vibe, folder names and counts in Dev.
import * as THREE from 'three';
import { groundLink, materials as M } from './materials.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { buildBlock } from './builders/blockBuilder.js';
import { buildFolderIcon } from './builders/folderIconBuilder.js';
import { buildFileTiles, buildPlaza } from './builders/plazaBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { TAG_COLOR } from '../../models/folderTags.js';
import { FOLDER } from '../../viewmodels/layout.js';
import { FILE_TILE } from './builders/fileIconBuilder.js';

// 'folders': isometric folders; 'blocks': plain cubes; 'detailed': full buildings
const BUILDING_STYLE = 'folders';

const RISE_SPEED = 2.2;
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

// File name, and the folder it sits in (inside the open folder) when it is nested
function fileLabel(f) {
  const rel = f.rel ?? f.path;
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
  return `<strong class="${f.level}">${escapeHtml(f.name)}</strong>${dir ? `<span>${escapeHtml(dir)}</span>` : ''}`;
}

export function createMapView({ sceneView, labels, mapViewModel, modeModel }) {
  let group = null;
  let ownLabels = [];
  let session = null;
  const seen = new Set();       // 'folder:path' / 'file:path' already shown this session (they do not rise again)
  const risers = [];            // { group, k }
  function clear() {
    if (group) sceneView.layers.map.remove(group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    risers.length = 0;
    group = null;
  }

  // Things shown for the first time rise from the ground (flat ones grow), one after the other
  function rise(key, object, delay, animate, flat = false) {
    const isNew = !seen.has(key);
    seen.add(key);
    if (!animate || !isNew) return;
    if (flat) object.scale.setScalar(0.001);
    else object.scale.y = 0.001;
    risers.push({ group: object, k: -delay, flat });
  }

  function addFiles(built, files, animate, flat = false) {
    built.icons.forEach(({ mesh, index }) => {
      const f = files[index];
      rise(`file:${f.path}`, mesh, index * ICON_RISE_STAGGER, animate, flat);
      const x = mesh.position.x + built.group.position.x, z = mesh.position.z + built.group.position.z;
      ownLabels.push(labels.add({
        html: fileLabel(f),
        // Flat files: below their nearest corner, so the label never covers them
        anchor: flat ? { x: x + FILE_TILE.width / 2, y: 0, z: z + FILE_TILE.depth / 2 } : { x, y: built.top + 1.2, z },
        align: flat ? 'below' : 'top',
        className: 'file',
      }));
    });
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

    // The project's plaza with its root files that have a problem
    const { plaza, root } = state;
    const built = buildPlaza(plaza);
    group.add(built.group);
    addFiles(built, plaza.files, animate);
    const summary = root.red + root.yellow ? strings.map.watched(root.total) : strings.map.allClear;
    ownLabels.push(labels.add({
      html: `<strong>${escapeHtml(plaza.name)}</strong><span>${summary}</span>${riskLine(root.counts)}`,
      anchor: { x: 0, y: built.top + 2, z: -plaza.size / 2 },
      className: 'root',
    }));

    // Folders with problems around it
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

    // The open folder's problem files, lying flat beside it, linked by a road
    const { opened } = state;
    if (opened) {
      const folder = state.buildings.find((b) => b.path === opened.path);
      groundLink(group, M.road, folder.x, folder.z, opened.x, opened.z, 0.35, 0.05).castShadow = false;
      const tiles = buildFileTiles(opened);
      group.add(tiles.group);
      addFiles(tiles, opened.files, animate, true);
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
      const s = Math.max(1 - (1 - k) ** 3, 0.001);
      if (r.flat) r.group.scale.setScalar(s);
      else r.group.scale.y = s;
      if (r.k >= 1) risers.splice(i, 1);
    }
  });

  return {
    pickTargets: () => (group ? [group] : []),
  };
}
