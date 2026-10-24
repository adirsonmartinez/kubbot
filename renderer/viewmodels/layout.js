// World layout shared by view models (to place things / aim the camera) and views (to build them).
// Units are map grid cells.
import { clamp } from '../core/format.js';

export const SUPABASE_NODE = { x: 21, z: 3.8 };
export const SCHEMA_CENTER = { x: SUPABASE_NODE.x - 0.4, z: SUPABASE_NODE.z - 13 };

export const FOLDER_SPACING = 12;

export const TOWER = { cube: 0.7, pitch: 0.95, floorHeight: 2.3, base: 0.45, maxFloors: 10 };

export const hqHeight = (totalFiles) => clamp(5 + Math.log2(1 + totalFiles) * 1.2, 5, 14);
export const folderHeight = (files) => Math.min(1.2 + Math.log2(1 + files) * 1.4, 9);
export const towerHeight = (floorCount) => TOWER.base + floorCount * TOWER.floorHeight;

// Rings of slots around the main building, skipping the Supabase node area when it is shown
export function folderSlots(count, avoidSupabase) {
  const slots = [];
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      if (i === 0 && j === 0) continue;
      const x = i * FOLDER_SPACING, z = j * FOLDER_SPACING;
      if (avoidSupabase && Math.abs(x - SUPABASE_NODE.x) < 7.5 && Math.abs(z - SUPABASE_NODE.z) < 7.5) continue;
      slots.push({ x, z, distance: Math.hypot(x, z), angle: Math.atan2(x, z) });
    }
  }
  slots.sort((a, b) => a.distance - b.distance || a.angle - b.angle);
  return slots.slice(0, count);
}
