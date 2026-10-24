// Building for a first-level folder: height from its file count, color from its name,
// and a cube on the roof with the worst traffic-light level of all its files.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';
import { FALLBACK_BODIES, FOLDER_STYLES, LEVEL_STYLE } from '../../theme.js';
import { hashString } from '../../../core/format.js';
import { folderHeight } from '../../../viewmodels/layout.js';

const BODY_WIDTH = 3.2;
const BASE = 0.45;

export function buildFolderBuilding({ name, files, level }) {
  const style = FOLDER_STYLES.find((s) => s.pattern.test(name));
  const body = (style?.body ?? FALLBACK_BODIES[hashString(name) % FALLBACK_BODIES.length])();
  const h = folderHeight(files);
  const W = BODY_WIDTH, B = BASE;

  const g = new THREE.Group();
  box(g, M.lavenderDark, 5, 0.25, 5, 0, 0, 0);
  box(g, M.lavender, 4.6, 0.2, 4.6, 0, 0.25, 0);
  box(g, body, W, h, W, 0, B, 0);
  box(g, M.lavender, W + 0.3, 0.22, W + 0.3, 0, B + h, 0); // cornice

  // Windows on the two faces the camera sees at first; some of them lit
  const seed = hashString(name);
  const rows = Math.max(0, Math.floor(h - 0.7));
  const face = W / 2 + 0.03;
  const isLit = (bit) => ((seed >> (bit % 24)) & 3) === 0;
  for (let r = 0; r < rows; r++) {
    const y = B + 0.55 + r;
    [-0.7, 0.7].forEach((c, i) => {
      if (r === 0 && i === 0) return; // gap for the door
      box(g, isLit(r * 2 + i) ? M.tealLit : M.screen, 0.6, 0.6, 0.12, c, y, face);
      box(g, isLit(r * 2 + i + 5) ? M.tealLit : M.screen, 0.12, 0.6, 0.6, face, y, c);
    });
  }
  box(g, M.screen, 0.7, 1.1, 0.12, -0.7, B, face); // door

  box(g, LEVEL_STYLE[level].material(), 0.6, 0.6, 0.6, 0.9, B + h + 0.22, 0.9); // status light

  return { group: g, top: B + h + 0.22 };
}
