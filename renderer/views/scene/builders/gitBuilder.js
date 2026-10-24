// Git view in 3D, minimal: each lane is a thin line, each commit a cube. Forks and merges are thin
// diagonal lines. HEAD floats slightly, framed by a square of lines on the ground. Commits that leaked
// secrets are red. Every lane has its own materials so it can be dimmed when another lane is focused.
import * as THREE from 'three';
import { box, groundLink, materials as M } from '../materials.js';

export const LANE_COLORS = {
  main: 0x5a50ea, develop: 0x2fd9a8, feature: 0xf2c94c, release: 0x9b8cff,
  hotfix: 0xff8a3d, remote: 0xb5b5c2, other: 0xc9c4ee,
};
export const laneColorCss = (kind) => `#${LANE_COLORS[kind].toString(16).padStart(6, '0')}`;

const LINE = { width: 0.12, height: 0.03, y: 0.01 };
const CUBE = 0.8;
const MERGE_CUBE = 0.5;
const FRAME = 1.5; // HEAD square

function laneMaterials(kind) {
  const color = LANE_COLORS[kind];
  return {
    line: new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }),
    cube: new THREE.MeshStandardMaterial({ color, roughness: 0.45, transparent: true }),
  };
}

// Square outline made of four thin lines, centered on (x, z)
function frame(parent, material, x, z, size) {
  const h = size / 2;
  const w = LINE.width;
  [[0, -h, size, w], [0, h, size, w], [-h, 0, w, size], [h, 0, w, size]].forEach(([dx, dz, sx, sz]) => {
    box(parent, material, sx, LINE.height, sz, x + dx, LINE.y, z + dz).castShadow = false;
  });
}

export function buildGitGraph({ lanes, commits, connectors, head }) {
  const group = new THREE.Group();
  const mats = new Map(lanes.map((l) => [l.name, laneMaterials(l.kind)]));
  const cubes = []; // { mesh, index, size, baseY } for the rise animation

  lanes.forEach((lane) => {
    const m = mats.get(lane.name);
    if (lane.toX === lane.fromX) return; // a single commit needs no line
    const line = box(group, m.line, lane.toX - lane.fromX, LINE.height, LINE.width * 2, (lane.fromX + lane.toX) / 2, LINE.y, lane.z);
    line.castShadow = false;
    line.userData.pick = { type: 'lane', name: lane.name };
  });

  connectors.forEach((c) => {
    const m = mats.get(c.lane) ?? mats.values().next().value;
    groundLink(group, m.line, c.from.x, c.from.z, c.to.x, c.to.z, LINE.width, LINE.height).castShadow = false;
  });

  commits.forEach((commit, index) => {
    const size = commit.isMerge ? MERGE_CUBE : CUBE;
    const isHead = head?.sha === commit.sha;
    const baseY = isHead ? 0.35 : 0;
    const mesh = box(group, commit.risk ? M.alertLit : mats.get(commit.lane).cube, size, size, size, commit.x, baseY, commit.z);
    mesh.userData.pick = { type: 'commit', sha: commit.sha };
    cubes.push({ mesh, index, size, baseY });
  });

  let headFrame = null;
  if (head) {
    const commit = commits.find((c) => c.sha === head.sha);
    headFrame = new THREE.Group();
    frame(headFrame, mats.get(commit.lane).line, 0, 0, FRAME);
    headFrame.position.set(head.x, 0, head.z);
    group.add(headFrame);
  }

  return {
    group,
    cubes,
    headFrame,
    // Dim every lane except the focused one (null = all normal)
    setFocus(name) {
      mats.forEach((m, laneName) => {
        const opacity = name && laneName !== name ? 0.15 : 1;
        [m.line, m.cube].forEach((mat) => { mat.opacity = opacity; mat.depthWrite = opacity === 1; });
      });
    },
  };
}
