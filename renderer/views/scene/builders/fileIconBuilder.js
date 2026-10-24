// Isometric files for files with a problem, in their traffic-light color. buildFileIcon: a standing
// sheet with a folded corner and a few text lines (root files on the plaza); its origin is its base, so
// it can grow from the ground. buildFileTile: the same sheet lying flat (files of an open folder).
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';

export const FILE_ICON = { width: 0.62, height: 0.84, depth: 0.12 };
const FOLD = 0.2;

let sheetGeometry = null;
let foldGeometry = null;
function geometries() {
  if (sheetGeometry) return { sheet: sheetGeometry, fold: foldGeometry };
  const { width, height, depth } = FILE_ICON;
  const w = width / 2;
  // The sheet without its top right corner
  const sheet = new THREE.Shape();
  sheet.moveTo(-w, 0);
  sheet.lineTo(w, 0);
  sheet.lineTo(w, height - FOLD);
  sheet.lineTo(w - FOLD, height);
  sheet.lineTo(-w, height);
  sheet.lineTo(-w, 0);
  sheetGeometry = new THREE.ExtrudeGeometry(sheet, { depth, bevelEnabled: false });
  sheetGeometry.translate(0, 0, -depth / 2);
  // The folded corner, on the front face
  const fold = new THREE.Shape();
  fold.moveTo(w - FOLD, height);
  fold.lineTo(w - FOLD, height - FOLD);
  fold.lineTo(w, height - FOLD);
  fold.lineTo(w - FOLD, height);
  foldGeometry = new THREE.ExtrudeGeometry(fold, { depth: 0.03, bevelEnabled: false });
  foldGeometry.translate(0, 0, depth / 2);
  return { sheet: sheetGeometry, fold: foldGeometry };
}

function mesh(parent, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildFileIcon(level) {
  const g = new THREE.Group();
  const { sheet, fold } = geometries();
  const { width, height, depth } = FILE_ICON;
  mesh(g, sheet, LEVEL_STYLE[level].cube());
  mesh(g, fold, M.white);
  // Text lines on the front face
  [0.52, 0.4, 0.28].forEach((y, i) => {
    box(g, M.white, width * (i === 2 ? 0.4 : 0.6), 0.035, 0.02, -width * (i === 2 ? 0.1 : 0.04), height * y, depth / 2).castShadow = false;
  });
  return g;
}

// Flat file lying on the ground (the problem files of an open folder): a sheet with a cut corner,
// a rim in its traffic-light color around a dark face, and the folded flap. Origin: its center.
export const FILE_TILE = { width: 1.8, depth: 2.4 };
const RIM = 0.14;
const TILE_FOLD = 0.55;

const tileCache = new Map();
// Sheet outline in the ground plane, its far left corner cut (shape y = -world z)
function tileShape(w, d, fold) {
  const s = new THREE.Shape();
  s.moveTo(-w, -d);
  s.lineTo(w, -d);
  s.lineTo(w, d);
  s.lineTo(-w + fold, d);
  s.lineTo(-w, d - fold);
  s.lineTo(-w, -d);
  return s;
}
function flatGeometry(key, shape, height) {
  if (tileCache.has(key)) return tileCache.get(key);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2); // lie on the ground, extruded upward
  tileCache.set(key, geometry);
  return geometry;
}

export function buildFileTile(level) {
  const g = new THREE.Group();
  const w = FILE_TILE.width / 2, d = FILE_TILE.depth / 2;
  const color = LEVEL_STYLE[level].cube();
  mesh(g, flatGeometry('rim', tileShape(w, d, TILE_FOLD), 0.1), color);
  mesh(g, flatGeometry('face', tileShape(w - RIM, d - RIM, TILE_FOLD - RIM * 0.6), 0.12), M.slab);
  // Folded flap over the cut corner
  const flap = new THREE.Shape();
  flap.moveTo(-w + TILE_FOLD, d);
  flap.lineTo(-w + TILE_FOLD, d - TILE_FOLD);
  flap.lineTo(-w, d - TILE_FOLD);
  flap.lineTo(-w + TILE_FOLD, d);
  mesh(g, flatGeometry('flap', flap, 0.16), color);
  // Text lines on the face
  [-0.35, 0, 0.35].forEach((z, i) => {
    box(g, color, (w - RIM) * (i === 2 ? 0.9 : 1.4), 0.02, 0.08, -(w - RIM) * (i === 2 ? 0.25 : 0.05), 0.12, z + 0.2).castShadow = false;
  });
  return g;
}
