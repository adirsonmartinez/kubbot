// Git view in 3D: each lane is a railway track, each commit a block on it, forks and merges are
// diagonal links, tags are flags and HEAD is a little train. Every lane gets its own materials so it
// can be dimmed when another lane is focused.
import * as THREE from 'three';
import { box, cylinder, groundLink, materials as M, warningSign } from '../materials.js';

export const LANE_COLORS = {
  main: 0x5a50ea, develop: 0x2fd9a8, feature: 0xf2dc3c, release: 0xa9a2f0,
  hotfix: 0xff8a3d, remote: 0xb5b5c2, other: 0xc9c4ee,
};
export const laneColorCss = (kind) => `#${LANE_COLORS[kind].toString(16).padStart(6, '0')}`;

const TRACK_Y = 0.12;
const BLOCK = 1.1;

function laneMaterials(kind) {
  const make = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, ...extra });
  return {
    bed: make(0x2e2e38, { roughness: 0.4 }),
    sleeper: make(0xa9a2f0),
    rail: make(LANE_COLORS[kind], { emissive: LANE_COLORS[kind], emissiveIntensity: 0.25 }),
    block: make(LANE_COLORS[kind]),
    link: make(LANE_COLORS[kind]),
  };
}

const blockHeight = (files) => 0.5 + Math.min(Math.log2(1 + files) * 0.35, 1.8);

export function buildGitGraph({ lanes, commits, connectors, tags, head }) {
  const group = new THREE.Group();
  const mats = new Map(lanes.map((l) => [l.name, laneMaterials(l.kind)]));
  const laneByName = new Map(lanes.map((l) => [l.name, l]));
  const blocks = []; // { mesh, index } for the rise animation
  const warnings = [];

  // Tracks: bed, two rails and sleepers
  lanes.forEach((lane) => {
    const m = mats.get(lane.name);
    const from = lane.fromX - 1, to = lane.toX + 1, length = to - from, cx = (from + to) / 2;
    const bed = box(group, m.bed, length, 0.12, 1.1, cx, 0, lane.z);
    bed.userData.pick = { type: 'lane', name: lane.name };
    box(group, m.rail, length, 0.08, 0.12, cx, TRACK_Y, lane.z - 0.32).userData.pick = { type: 'lane', name: lane.name };
    box(group, m.rail, length, 0.08, 0.12, cx, TRACK_Y, lane.z + 0.32).userData.pick = { type: 'lane', name: lane.name };
    for (let x = from + 0.4; x < to; x += 0.9) box(group, m.sleeper, 0.18, 0.05, 1.3, x, 0.07, lane.z).castShadow = false;
  });

  // Forks and merges
  connectors.forEach((c) => {
    const m = mats.get(c.lane) ?? mats.values().next().value;
    groundLink(group, m.link, c.from.x, c.from.z, c.to.x, c.to.z, 0.32, 0.16).castShadow = false;
  });

  // Commits
  commits.forEach((commit, index) => {
    const m = mats.get(commit.lane);
    const h = commit.isMerge ? 0.55 : blockHeight(commit.files.length);
    const size = commit.isMerge ? BLOCK * 0.75 : BLOCK;
    const mesh = box(group, commit.risk ? M.alertLit : m.block, size, h, size, commit.x, TRACK_Y + 0.08, commit.z, commit.isMerge ? Math.PI / 4 : 0);
    mesh.userData.pick = { type: 'commit', sha: commit.sha };
    mesh.userData.lane = commit.lane;
    blocks.push({ mesh, index, height: h, baseY: TRACK_Y + 0.08 });
    if (commit.risk) {
      const sign = warningSign(0.8);
      sign.position.set(commit.x, TRACK_Y + h + 2.2, commit.z);
      sign.userData.baseY = sign.position.y;
      group.add(sign);
      warnings.push(sign);
    }
  });

  // Tags: a pole with a flag behind the commit
  tags.forEach((tag) => {
    box(group, M.metal, 0.1, 2.6, 0.1, tag.x - 0.45, 0, tag.z - 0.6);
    box(group, M.yellow, 0.8, 0.5, 0.06, tag.x - 0.05, 2.05, tag.z - 0.6);
  });

  // HEAD: a small train parked right after the current commit
  let train = null;
  if (head) {
    train = new THREE.Group();
    box(train, M.teal, 1.3, 0.7, 0.8, 0, 0, 0);
    box(train, M.indigo, 0.55, 0.55, 0.85, -0.35, 0.7, 0);
    cylinder(train, M.screen, 0.14, 0.45, 0.35, 0.7, 0);
    box(train, M.tealLit, 0.06, 0.25, 0.5, 0.66, 0.25, 0); // headlight
    [-0.4, 0.4].forEach((x) => [-0.42, 0.42].forEach((z) => cylinder(train, M.screen, 0.18, 0.12, x, -0.05, z)));
    train.position.set(head.x + 1.5, TRACK_Y + 0.12, head.z);
    train.userData.pick = { type: 'commit', sha: head.sha };
    group.add(train);
  }

  return {
    group,
    // Dim every lane except the focused one (null = all normal)
    setFocus(name) {
      mats.forEach((m, laneName) => {
        const opacity = name && laneName !== name ? 0.18 : 1;
        Object.values(m).forEach((mat) => { mat.opacity = opacity; mat.depthWrite = opacity === 1; });
      });
    },
    blocks,
    warnings,
    train,
    laneOf: (name) => laneByName.get(name),
  };
}
