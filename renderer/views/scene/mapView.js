// Draws the project tree from MapViewModel: the integrations band across the top, the project's plaza
// (its root files), the row of top-level folders below it, and the open path unfolding further down
// (small folders and files), all linked by plain roads. Problems glow; anything that appears for the first time rises from the
// ground. Folder labels are short (name and risk); files only get one when they have a problem, so a big
// project does not drown in names (hover shows the rest).
import * as THREE from 'three';
import { box, groundLink, materials as M } from './materials.js';
import { buildFolderBuilding } from './builders/folderBuilder.js';
import { buildBlock } from './builders/blockBuilder.js';
import { buildFolderIcon } from './builders/folderIconBuilder.js';
import { buildFileIcons, buildPlaza } from './builders/plazaBuilder.js';
import { buildIntegration } from './builders/integrationBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { BOX, boxHeight, FOLDER, INTEGRATIONS, SCREEN_ANGLE, screenOf, toWorld } from '../../viewmodels/layout.js';

// 'folders': isometric folders; 'blocks': plain cubes; 'detailed': full buildings
const BUILDING_STYLE = 'blocks';

const RISE_SPEED = 2.2;
const GLIDE_SPEED = 3; // folders that move (rows making room for an open folder) slide in ~1/3 s
const SUBFOLDER_SCALE = 0.5; // folders inside an open one

// A folder in the current style: a box as tall as its file count, an isometric folder or a building
function buildFolder(f) {
  if (BUILDING_STYLE === 'blocks') return buildBlock({ size: BOX.size, height: boxHeight(f.files), level: f.level });
  if (BUILDING_STYLE === 'folders') return buildFolderIcon({ size: FOLDER.size, files: f.files, level: f.level });
  return buildFolderBuilding(f);
}
const BRANCH_FILE_SCALE = 1.5; // files inside an open folder
const ROAD_WIDTH = { top: 0.35, branch: 0.2 };
const ICON_RISE_STAGGER = 0.06;
const MAX_PLAZA_LABELS = 3;     // more root files with a problem than this: their names only on hover

// Last line of a label: its problems, if any
function riskLine(counts) {
  if (counts.red) return `<em class="risk">${strings.map.risk(counts.red)}</em>`;
  if (counts.yellow) return `<em class="review">${strings.map.review(counts.yellow)}</em>`;
  return '';
}

// Folder labels, at any zoom and in both modes: the folder's own name and its risk line (the hover card
// has the rest), so neighbors never cover each other
const folderLabel = (f) => `<strong>${escapeHtml(f.name)}/</strong>${riskLine(f.counts)}`;
const hasProblem = (f) => f.level === 'yellow' || f.level === 'red';

// Files on the map are always direct children of what is shown (the plaza or the open folder): the name is enough
const fileLabel = (f) => `<strong class="${f.level}">${escapeHtml(f.name)}</strong>`;

export function createMapView({ sceneView, labels, mapViewModel }) {
  let group = null;
  let ownLabels = [];
  let session = null;
  const seen = new Set();       // 'folder:path' / 'file:path' already shown this session (they do not rise again)
  const risers = [];            // { group, k, to: final scale.y }
  const lastAt = new Map();     // 'folder:path' -> { x, z } where it was drawn last time
  const gliders = [];           // { group, from, to, k }
  let emblems = [];             // integration nodes, for their spin
  function clear() {
    if (group) sceneView.layers.map.remove(group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    risers.length = 0;
    gliders.length = 0;
    emblems = [];
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

  // Files get a label when they have a problem, unless there are too many of them (`labeled` false)
  // Something already on the map that has to move slides from where it was (labels follow its anchor)
  function glide(key, object, x, z, label) {
    const from = lastAt.get(key);
    lastAt.set(key, { x, z });
    if (!from || (from.x === x && from.z === z)) return;
    object.position.x = from.x;
    object.position.z = from.z;
    gliders.push({ group: object, from, to: { x, z }, k: 0, label, dy: label.anchor.y });
    label.setAnchor(from.x, label.anchor.y, from.z);
  }

  function addFiles(built, files, animate, labeled = true) {
    built.icons.forEach(({ mesh, index }) => {
      const f = files[index];
      rise(`file:${f.path}`, mesh, index * ICON_RISE_STAGGER, animate);
      if (!labeled || !hasProblem(f)) return;
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
      lastAt.clear();
    }

    group = new THREE.Group();
    sceneView.layers.map.add(group);

    // The integrations band across the top, with its name next to the first node (the band's ends can be off screen)
    const { band } = state;
    box(group, M.band, band.width, 0.03, band.depth, band.x, 0, band.z, SCREEN_ANGLE).castShadow = false;
    const b0 = screenOf(band.x, band.z);
    const edge = toWorld(b0.u, b0.v + band.depth / 2);
    box(group, M.slabEdge, band.width, 0.05, 0.08, edge.x, 0, edge.z, SCREEN_ANGLE).castShadow = false;
    ownLabels.push(labels.add({ html: `<span>${strings.map.integrations}</span>`, anchor: { ...toWorld(-9, b0.v - band.depth / 2 + 1.5), y: 0.2 }, className: 'band', align: 'below' }));

    // The integrations' nodes (Supabase draws itself), turned like it
    state.integrations.forEach((integration) => {
      const node = buildIntegration(integration.key);
      node.group.position.set(integration.x, 0, integration.z);
      node.group.rotation.y = INTEGRATIONS.rotation;
      group.add(node.group);
      emblems.push(node);
      const name = escapeHtml(strings.integrations.names[integration.key] ?? integration.key);
      ownLabels.push(labels.add({
        html: `<span class="dot ${integration.status}"></span><span>${name} · ${strings.integrations.status[integration.status]}</span>`,
        anchor: { x: integration.x, y: node.labelY, z: integration.z },
        className: 'sb-label',
      }));
    });

    // The roads of the tree
    state.links.forEach(([x1, z1, x2, z2, kind]) => {
      groundLink(group, M.road, x1, z1, x2, z2, ROAD_WIDTH[kind], 0.05).castShadow = false;
    });

    // The project's plaza with its root files
    const { plaza, root } = state;
    const built = buildPlaza(plaza);
    group.add(built.group);
    addFiles(built, plaza.files, animate, plaza.files.filter(hasProblem).length <= MAX_PLAZA_LABELS);
    addMore(plaza.more, plaza.size / 2, plaza.size / 2);
    const summary = root.red + root.yellow ? strings.map.watched(root.total) : strings.map.allClear;
    ownLabels.push(labels.add({
      html: `<strong>${escapeHtml(plaza.name)}</strong><span>${summary}</span>${riskLine(root.counts)}`,
      anchor: { x: 0, y: built.top + 2, z: -plaza.size / 2 },
      className: 'root',
    }));

    // The row of top-level folders
    state.buildings.forEach((b) => {
      const building = buildFolder(b);
      building.group.position.set(b.x, 0, b.z);
      building.group.userData.pick = { type: 'folder', path: b.path };
      group.add(building.group);
      const label = labels.add({
        html: folderLabel(b),
        anchor: { x: b.x, y: building.top + 0.9, z: b.z },
        className: b.open ? 'open' : '',
      });
      ownLabels.push(label);
      rise(`folder:${b.path}`, building.group, b.order * 0.06, animate);
      glide(`folder:${b.path}`, building.group, b.x, b.z, label);
    });

    // The open path, one level per branch: subfolders, then files
    state.branches.forEach((branch) => {
      branch.folders.forEach((f, i) => {
        const sub = buildFolder(f);
        sub.group.scale.setScalar(SUBFOLDER_SCALE);
        sub.group.position.set(f.x, 0, f.z);
        sub.group.traverse((o) => { o.userData.pick = { type: 'folder', path: f.path }; });
        group.add(sub.group);
        ownLabels.push(labels.add({
          html: folderLabel(f),
          anchor: { x: f.x, y: sub.top * SUBFOLDER_SCALE + 0.5, z: f.z },
          className: `file${f.open ? ' open' : ''}`,
        }));
        rise(`folder:${f.path}`, sub.group, i * ICON_RISE_STAGGER, animate);
      });
      const icons = buildFileIcons(branch.files, BRANCH_FILE_SCALE);
      group.add(icons.group);
      addFiles(icons, branch.files, animate);
      const last = branch.files.at(-1) ?? branch.folders.at(-1);
      if (last) addMore(branch.more, last.x + 1.2, last.z + 1.2);
    });
  }

  mapViewModel.store.subscribe((state, previous) => {
    if (previous && state.version === previous.version) return;
    render(state);
  }, { immediate: true });

  sceneView.onFrame((t, dt) => {
    emblems.forEach((node) => node.update(t));
    for (let i = gliders.length - 1; i >= 0; i--) {
      const g = gliders[i];
      g.k = Math.min(g.k + dt * GLIDE_SPEED, 1);
      const e = 1 - (1 - g.k) ** 3;
      const x = g.from.x + (g.to.x - g.from.x) * e, z = g.from.z + (g.to.z - g.from.z) * e;
      g.group.position.x = x;
      g.group.position.z = z;
      g.label.setAnchor(x, g.dy, z);
      if (g.k >= 1) gliders.splice(i, 1);
    }
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
