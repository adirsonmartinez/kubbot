// Cracks on a building's walls: dark zigzags with a glowing red edge (they pulse, see mapView).
// red = big cracks on the two faces the camera sees first + rubble at the foot; yellow = one hairline.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';

const unit = new THREE.BoxGeometry(1, 1, 1);

// Pseudo-random numbers from a seed, so a building always cracks the same way
function random(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function segment(parent, mat, cx, cy, length, width, depth, angle, face) {
  const mesh = new THREE.Mesh(unit, mat);
  mesh.scale.set(width, length, depth);
  if (face.axis === 'z') {
    mesh.position.set(cx, cy, face.at);
    mesh.rotation.z = angle;
  } else {
    // On an x face the "horizontal" direction is z, so the zigzag rotates around x
    mesh.scale.set(depth, length, width);
    mesh.position.set(face.at, cy, cx);
    mesh.rotation.x = -angle;
  }
  mesh.userData.crack = true; // mapView makes it clickable (pick type 'crack')
  parent.add(mesh);
  return mesh;
}

// One zigzag from the top of the wall down. `face`: { axis: 'z' | 'x', at, center } in group space.
function zigzag(parent, face, top, bottom, halfWidth, rnd, size) {
  let x = face.center + (rnd() - 0.5) * halfWidth;
  let y = top - rnd() * 0.4;
  let dir = rnd() > 0.5 ? 1 : -1;
  const pieces = [];
  while (y > bottom) {
    const length = (0.45 + rnd() * 0.5) * size;
    const tilt = 0.25 + rnd() * 0.45;
    // A segment rotated by `angle` ends sin(angle) * length sideways: turn back before leaving the wall
    if (Math.abs(x + Math.sin(dir * tilt) * length - face.center) > halfWidth) dir = -dir;
    const angle = dir * tilt;
    const dx = Math.sin(angle) * length;
    const dy = Math.cos(angle) * length;
    const mx = x + dx / 2, my = y - dy / 2;
    const out = face.sign * 0.035;
    // Glow behind (wider), dark gap in front
    pieces.push(segment(parent, M.crackGlow, mx, my, length + 0.06, 0.2 * size, 0.04, angle, { ...face, at: face.at + out }));
    pieces.push(segment(parent, M.crack, mx, my, length + 0.04, 0.09 * size, 0.04, angle, { ...face, at: face.at + out * 2 }));
    x += dx; y -= dy; dir = -dir;
  }
  return pieces;
}

// box: the wall volume { cx, cz, halfW, halfD, bottom, top } in the group's space
export function addCracks(group, { cx, cz, halfW, halfD, bottom, top }, level, seed = 1) {
  if (level !== 'red' && level !== 'yellow') return;
  const rnd = random(seed);
  const front = { axis: 'z', at: cz + halfD, center: cx, sign: 1 };
  const side = { axis: 'x', at: cx + halfW, center: cz, sign: 1 };
  if (level === 'yellow') {
    zigzag(group, front, top - 0.3, top - Math.min(1.6, (top - bottom) * 0.5), halfW * 0.6, rnd, 0.6);
    return;
  }
  zigzag(group, front, top - 0.2, bottom + 0.2, halfW * 0.7, rnd, 1);
  zigzag(group, side, top - 0.6, bottom + (top - bottom) * 0.35, halfD * 0.7, rnd, 0.9);
  // Rubble at the foot of the cracked face
  for (let i = 0; i < 5; i++) {
    const s = 0.16 + rnd() * 0.2;
    box(group, M.rubble, s, s, s, cx + (rnd() - 0.5) * halfW * 1.6, bottom, cz + halfD + 0.25 + rnd() * 0.5, rnd() * 3);
  }
}
