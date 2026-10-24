// Plazas with problem files: the project's plaza in the middle of the map (its root files) and the
// tray next to an open folder (the files inside it). Files come sorted riskiest first.
import * as THREE from 'three';
import { box, materials as M, platform } from '../materials.js';
import { PLAZA } from '../../../viewmodels/layout.js';
import { buildFileIcon } from './fileIconBuilder.js';

function addIcon(g, file, x, y, z, index) {
  const icon = buildFileIcon(file.level);
  icon.position.set(x, y, z);
  icon.traverse((o) => { o.userData.pick = { type: 'file', path: file.path }; });
  g.add(icon);
  return { mesh: icon, index };
}

// Hairline frame around the files so they read as one unit
function frame(g, w, d, y) {
  const t = 0.05;
  [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]].forEach(([dx, dz, sx, sz]) => {
    box(g, M.slabEdge, sx, 0.02, sz, dx, y, dz).castShadow = false;
  });
}

// plaza: { size, cols, files: [{ path, level }] }; the grid fills the rows closest to the camera first
export function buildPlaza({ size, cols, files }) {
  const g = new THREE.Group();
  const base = platform(g, size, size);
  const rows = Math.max(1, Math.ceil(files.length / cols));
  const { pitch } = PLAZA;
  const x0 = -((cols - 1) * pitch) / 2;
  const z0 = ((rows - 1) * pitch) / 2;
  const icons = files.map((file, i) => addIcon(g, file, x0 + (i % cols) * pitch, base, z0 - Math.floor(i / cols) * pitch, i));
  if (files.length) frame(g, (cols - 1) * pitch + 1.1, (rows - 1) * pitch + 0.9, base);
  return { group: g, top: base, icons };
}

// tray: { x, z, size, files: [{ path, level, x, z }] } in world units
export function buildFileTray({ x, z, size, files }) {
  const g = new THREE.Group();
  const base = platform(g, size, size, x, z);
  const icons = files.map((file, i) => addIcon(g, file, file.x, base, file.z, i));
  return { group: g, top: base, icons };
}
