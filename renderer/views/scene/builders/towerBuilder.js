// Open building: one open floor (slab + columns) per folder, files as cubes in a grid.
// The slab rim takes the floor's worst level, so a red floor is visible even when covered.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';
import { TOWER } from '../../../viewmodels/layout.js';
import { clamp } from '../../../core/format.js';

// floors: [{ path, label, files: [{ path, size, level }], worst }] (files already sorted riskiest first)
export function buildTower({ x, z, floors }) {
  const { cube, pitch, floorHeight, base: B } = TOWER;
  const maxFiles = Math.max(1, ...floors.map((f) => f.files.length));
  const cols = clamp(Math.ceil(Math.sqrt(maxFiles)), 3, 10);
  const rows = Math.max(3, Math.ceil(maxFiles / cols));
  const W = cols * pitch + 1, D = rows * pitch + 1;

  const group = new THREE.Group();
  group.position.set(x, 0, z);
  box(group, M.slabEdge, W + 1.2, 0.25, D + 1.2, 0, 0, 0);
  box(group, M.slab, W + 0.8, 0.2, D + 0.8, 0, 0.25, 0);

  const built = floors.map((floor, i) => {
    const fg = new THREE.Group();
    fg.userData.pick = { type: 'floor', index: i };
    group.add(fg);

    box(fg, M.slab, W, 0.2, D, 0, 0, 0); // slab
    const rim = LEVEL_STYLE[floor.worst].glow ? LEVEL_STYLE[floor.worst].material() : M.slabEdge;
    box(fg, rim, W, 0.14, 0.16, 0, 0.2, D / 2 - 0.08);
    box(fg, rim, W, 0.14, 0.16, 0, 0.2, -D / 2 + 0.08);
    box(fg, rim, 0.16, 0.14, D, W / 2 - 0.08, 0.2, 0);
    box(fg, rim, 0.16, 0.14, D, -W / 2 + 0.08, 0.2, 0);

    // Columns down to the floor below (they stretch while the building opens)
    const posts = i === 0 ? [] : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      box(fg, M.metal, 0.18, 1, 0.18, sx * (W / 2 - 0.2), 0, sz * (D / 2 - 0.2)));

    // Cubes: the height depends on the file size; riskiest files at the front rows
    floor.files.forEach((file, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const h = cube * (0.55 + Math.min(Math.log10(file.size + 1) / 6, 0.75));
      const mesh = box(fg, LEVEL_STYLE[file.level].cube(), cube, h, cube,
        -W / 2 + 0.5 + pitch / 2 + c * pitch, 0.2, D / 2 - 0.5 - pitch / 2 - r * pitch);
      mesh.userData.pick = { type: 'file', path: file.path };
    });

    return { group: fg, posts, targetY: B + i * floorHeight, index: i };
  });

  return { group, floors: built, width: W, depth: D };
}
