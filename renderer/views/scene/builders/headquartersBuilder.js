// Main building = the project's root folder. The tower grows with the number of files.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';

export const HQ_BASE = 0.55;   // platform height
export const HQ_TOWER = { x: -1, z: -1, w: 4 };

export function buildHeadquarters(height = 9) {
  const g = new THREE.Group();
  const B = HQ_BASE;

  // Platform with a rim
  box(g, M.slabEdge, 10.4, 0.3, 10.4, 0, 0, 0);
  box(g, M.slab, 10, 0.25, 10, 0, 0.3, 0);

  // Main tower
  const T = { ...HQ_TOWER, h: height };
  const rows = Math.max(1, Math.floor((T.h - 1.6) / 1.2));
  box(g, M.body, T.w, T.h, T.w, T.x, B, T.z);
  // Corner pillars (block-like volume)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    box(g, M.bodyDark, 0.4, T.h, 0.4, T.x + dx * (T.w / 2 - 0.1), B, T.z + dz * (T.w / 2 - 0.1));
  }
  // Recessed windows on all four faces; some of them lit
  const lit = (i, j) => ((i * 7 + j * 13) % 5) === 0;
  const cols = [-1.1, 0, 1.1];
  const face = T.w / 2 + 0.03;
  for (let r = 0; r < rows; r++) {
    const y = B + 1.3 + r * 1.2;
    cols.forEach((c, i) => {
      if (r === 0 && i === 1) return; // gap for the door
      box(g, lit(r, i) ? M.windowLit : M.glass, 0.75, 0.8, 0.12, T.x + c, y, T.z + face);
      box(g, lit(r, i + 3) ? M.windowLit : M.glass, 0.75, 0.8, 0.12, T.x + c, y, T.z - face);
      box(g, lit(r, i + 6) ? M.windowLit : M.glass, 0.12, 0.8, 0.75, T.x + face, y, T.z + c);
      box(g, lit(r, i + 9) ? M.windowLit : M.glass, 0.12, 0.8, 0.75, T.x - face, y, T.z + c);
    });
  }
  // Door with canopy
  box(g, M.glass, 1, 1.6, 0.12, T.x, B, T.z + face);
  box(g, M.roof, 1.5, 0.18, 0.7, T.x, B + 1.65, T.z + T.w / 2 + 0.35);

  // Top: cornice, machine room, antenna
  const top = B + T.h;
  box(g, M.roof, 4.5, 0.4, 4.5, T.x, top, T.z);
  box(g, M.glass, 2.2, 1.4, 2.2, T.x, top + 0.4, T.z);
  box(g, M.windowLit, 1.4, 0.5, 0.1, T.x, top + 0.85, T.z + 1.12);
  box(g, M.metal, 0.2, 3, 0.2, T.x, top + 1.8, T.z);
  box(g, M.accentLit, 0.45, 0.45, 0.45, T.x, top + 4.8, T.z);

  // Annex on the right
  const A = { x: 2.8, z: 0, w: 3, h: 4, d: 5 };
  box(g, M.bodyLight, A.w, A.h, A.d, A.x, B, A.z);
  box(g, M.roof, A.w + 0.3, 0.25, A.d + 0.3, A.x, B + A.h, A.z);
  for (let r = 0; r < 3; r++) {
    const y = B + 0.6 + r * 1.1;
    box(g, M.glass, 0.12, 0.6, 4, A.x + A.w / 2 + 0.03, y, A.z);
    box(g, M.glass, 0.9, 0.6, 0.12, A.x - 0.6, y, A.z + A.d / 2 + 0.03);
    box(g, r === 1 ? M.windowLit : M.glass, 0.9, 0.6, 0.12, A.x + 0.6, y, A.z + A.d / 2 + 0.03);
  }
  // Equalizer bars on the roof
  [1.2, 2.0, 0.8, 1.6, 2.4].forEach((h, i) => {
    box(g, i % 2 ? M.bodyLight : M.body, 0.35, h, 0.35, A.x - 0.9 + i * 0.45, B + A.h + 0.25, A.z - 1.5);
  });

  // Sign at the front
  box(g, M.bodyLight, 2.4, 1.8, 0.3, -1, B, 3.8);
  box(g, M.glass, 2, 1.4, 0.06, -1, B + 0.2, 3.97);
  [0.3, 0.7, 0.45, 0.9, 0.55].forEach((h, i) => {
    box(g, M.windowLit, 0.2, h, 0.05, -1.7 + i * 0.35, B + 0.4, 4.02);
  });

  // Server stack
  for (let i = 0; i < 3; i++) {
    box(g, M.slab, 1.6, 0.3, 1.6, 3, B + i * 0.42, 3.8);
    box(g, M.windowLit, 0.9, 0.1, 0.05, 3, B + i * 0.42 + 0.1, 4.62);
  }

  return g;
}
