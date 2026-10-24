// Plain block for a folder (temporary stand-in for the detailed buildings while we define how a
// building unfolds its contents). Height still grows with the file count; problems light up the base.
import * as THREE from 'three';
import { box, glowPad, materials as M, platform } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';

// size: footprint of the cube; height: its height
export function buildBlock({ size, height, level, platformSize = size + 1.6 }) {
  const g = new THREE.Group();
  const base = platform(g, platformSize, platformSize);
  box(g, M.body, size, height, size, 0, base, 0);

  const glow = LEVEL_STYLE[level]?.glow;
  if (glow) glowPad(g, glow, platformSize - 0.5, platformSize - 0.5, base + 0.01);

  return { group: g, top: base + height };
}
