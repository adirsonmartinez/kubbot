// Plain block for a folder (temporary stand-in for the detailed buildings while we define how a
// building unfolds its contents). Height still grows with the file count; problems light up the
// base and crack the walls (red: big cracks and rubble, yellow: a hairline).
import * as THREE from 'three';
import { box, glowPad, materials as M, platform } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';
import { addCracks } from './crackBuilder.js';

// size: footprint of the cube; height: its height; seed: keeps the cracks the same between redraws
export function buildBlock({ size, height, level, seed = 1, platformSize = size + 1.6 }) {
  const g = new THREE.Group();
  const base = platform(g, platformSize, platformSize);
  box(g, M.body, size, height, size, 0, base, 0);

  const glow = LEVEL_STYLE[level]?.glow;
  if (glow) glowPad(g, glow, platformSize - 0.5, platformSize - 0.5, base + 0.01);
  addCracks(g, { cx: 0, cz: 0, halfW: size / 2, halfD: size / 2, bottom: base, top: base + height }, level, seed);

  return { group: g, top: base + height };
}
