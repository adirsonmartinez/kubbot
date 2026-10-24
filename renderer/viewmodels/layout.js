// World layout shared by view models (to place things / aim the camera) and views (to build them).
// Units are map grid cells.
import { clamp } from '../core/format.js';

export const SUPABASE_NODE = { x: 21, z: 0 };
export const SCHEMA_CENTER = { x: SUPABASE_NODE.x - 0.4, z: SUPABASE_NODE.z - 13 };

// Git view: commits advance along X (newest at x = 0), each lane is a row along Z
export const GIT_LAYOUT = { step: 2.4, laneGap: 3.6, zoom: 1.2 };

// Plaza: the platform in the middle of the map, with the root files that have a problem
export const PLAZA = { cube: 0.7, pitch: 1.0, margin: 0.9, minSize: 5 };

export function plazaGrid(fileCount) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(fileCount)));
  const size = Math.max(PLAZA.minSize, cols * PLAZA.pitch + PLAZA.margin * 2);
  return { cols, size };
}

// Folder on the map: its icon footprint and the platform it stands on
export const FOLDER = { size: 3, platform: 4.6 };

// Problem files of an open folder: flat file tiles in a grid in front of the folder (toward the default
// camera, +z), or to its side (+x) when that would put them on the road of a folder behind the plaza.
// Slots are in world units, filled front rows first.
export const FILE_TILE_PITCH = { x: 3.2, z: 3.6 };

export function sideGrid(count, folder) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const halfX = (cols * FILE_TILE_PITCH.x) / 2, halfZ = (rows * FILE_TILE_PITCH.z) / 2;
  const behind = folder.z < 0 && Math.abs(folder.x) < Math.abs(folder.z) / 2;
  const gap = FOLDER.platform / 2 + 1;
  const x = behind ? folder.x + gap + halfX : folder.x;
  const z = behind ? folder.z : folder.z + gap + halfZ;
  const x0 = x - ((cols - 1) * FILE_TILE_PITCH.x) / 2, z0 = z + ((rows - 1) * FILE_TILE_PITCH.z) / 2;
  const slots = Array.from({ length: count }, (_, i) => ({ x: x0 + (i % cols) * FILE_TILE_PITCH.x, z: z0 - Math.floor(i / cols) * FILE_TILE_PITCH.z }));
  return { x, z, size: Math.max(halfX, halfZ) * 2, slots };
}

export const folderHeight = (files) => Math.min(1.2 + Math.log2(1 + files) * 1.4, 9);

// Rings of slots around the plaza. Spacing grows with the plaza so folders never overlap it;
// the Supabase node and its cable are kept clear when the node is shown.
export function folderSlots(count, { plazaSize, avoidSupabase }) {
  const spacing = Math.max(12, plazaSize + 7);
  const slots = [];
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      if (i === 0 && j === 0) continue;
      const x = i * spacing, z = j * spacing;
      // Keep the node and its cable (from the plaza to the node, along X) clear
      if (avoidSupabase && x > 0 && x < SUPABASE_NODE.x + 7.5 && Math.abs(z - SUPABASE_NODE.z) < 7.5) continue;
      slots.push({ x, z, distance: Math.hypot(x, z), angle: Math.atan2(x, z) });
    }
  }
  slots.sort((a, b) => a.distance - b.distance || a.angle - b.angle);
  return slots.slice(0, count);
}

// Zoom that fits a level: bigger plazas and more folders zoom out a bit
export const levelZoom = (plazaSize, folderCount) => clamp(1.15 - plazaSize * 0.02 - (folderCount > 8 ? 0.2 : 0), 0.6, 1.1);
