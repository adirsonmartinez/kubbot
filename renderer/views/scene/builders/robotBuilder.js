// The welcome robot, in 3D: a small silver robot that hovers over the plaza of a new project. Rounded
// head with a dark visor and two purple eyes, an antenna, a body with a purple chest light, arms on
// shoulder pivots (robotView waves the right one) and no legs, just a hover base. Front = +z.
// Total height ≈ 2.4 units, the same as Remi.
import * as THREE from 'three';
import { box, cylinder, materials as M } from '../materials.js';

const pivot = (parent, x, y, z) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

export function buildRobot() {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0); // hovers as a whole

  // Hover base and torso
  cylinder(body, M.bodyDark, 0.3, 0.16, 0, 0.32, 0);
  cylinder(body, M.accentSolid, 0.22, 0.04, 0, 0.28, 0);
  box(body, M.body, 0.86, 0.78, 0.6, 0, 0.48, 0);
  box(body, M.bodyLight, 0.9, 0.1, 0.64, 0, 1.22, 0); // collar
  box(body, M.slab, 0.46, 0.3, 0.04, 0, 0.72, 0.3);   // chest panel
  box(body, M.accentSolid, 0.12, 0.12, 0.03, 0, 0.81, 0.32);

  // Arms (pivot at the shoulder): upper arm, forearm, a round hand
  const arms = [-0.55, 0.55].map((x) => {
    const arm = pivot(body, x, 1.12, 0);
    box(arm, M.bodyDark, 0.18, 0.5, 0.2, 0, -0.5, 0);
    box(arm, M.body, 0.22, 0.24, 0.24, 0, -0.68, 0);
    return arm;
  });

  // Head (pivot at the neck): rounded block, visor with the eyes, ear bolts, antenna
  const head = pivot(body, 0, 1.36, 0);
  box(head, M.metal, 0.22, 0.1, 0.22, 0, -0.04, 0); // neck
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), M.bodyLight);
  skull.scale.set(1, 0.82, 0.9);
  skull.position.y = 0.42;
  skull.castShadow = true;
  head.add(skull);
  const visor = box(head, M.slab, 0.72, 0.3, 0.1, 0, 0.3, 0.38);
  visor.castShadow = false;
  const eyes = [-0.15, 0.15].map((x) => box(head, M.accentSolid, 0.12, 0.12, 0.04, x, 0.39, 0.44));
  for (const x of [-0.5, 0.5]) box(head, M.bodyDark, 0.08, 0.18, 0.18, x, 0.33, 0);
  box(head, M.metal, 0.04, 0.3, 0.04, 0, 0.8, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), M.accentLit);
  tip.position.y = 1.14;
  head.add(tip);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, arms, head, eyes, tip };
}
