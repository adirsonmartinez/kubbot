// Plaza: the platform in the middle of a level, with the folder's own files as cubes in a grid.
// Files come sorted riskiest first and fill the rows closest to the camera first.
import * as THREE from 'three';
import { box, materials as M, platform } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';
import { fileCubeHeight, PLAZA } from '../../../viewmodels/layout.js';

// plaza: { size, cols, files: [{ path, size, level }] }
export function buildPlaza({ size, cols, files }) {
  const g = new THREE.Group();
  const base = platform(g, size, size);
  const rows = Math.max(1, Math.ceil(files.length / cols));
  const { pitch, cube } = PLAZA;
  const x0 = -((cols - 1) * pitch) / 2;
  const z0 = ((rows - 1) * pitch) / 2;

  const cubes = files.map((file, i) => {
    const height = fileCubeHeight(file.size);
    const mesh = box(g, LEVEL_STYLE[file.level].cube(), cube, height, cube, x0 + (i % cols) * pitch, base, z0 - Math.floor(i / cols) * pitch);
    mesh.userData.pick = { type: 'file', path: file.path };
    return { mesh, height, baseY: base, index: i };
  });

  // Hairline frame around the files so the plaza reads as one unit
  if (files.length) {
    const w = (cols - 1) * pitch + cube + 0.5, d = (rows - 1) * pitch + cube + 0.5, t = 0.05;
    [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]].forEach(([dx, dz, sx, sz]) => {
      box(g, M.slabEdge, sx, 0.02, sz, dx, base, dz).castShadow = false;
    });
  }

  return { group: g, top: base, cubes };
}
