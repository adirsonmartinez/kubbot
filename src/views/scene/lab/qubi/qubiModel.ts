// Qubi's body, built with three.js (imperative; the component mounts it with <primitive>). It is the
// ADE's friendly robot: a pearl round head with a dark glass face where two pill eyes and a smile light
// up, ear discs with rings of light, a curved antenna with a glowing orb, an egg body with a heart light
// and floating round hands. On the bench he walks, so under the egg he has two little feet.
// Front = +z. In model units he is ~2.6 tall; QubiRobot scales him to ~3.4 world units.
// There is no 3D model file for him (the ADE never shipped one), so this is the model. If a .glb is added
// later, load it with GLTFLoader and keep `QubiModel` the same: the animator only moves these pivots.

import * as THREE from "three";
import { PALETTE } from "../../palette";

export const HIP_Y = 0.36; // legs hang from here
export const HEAD_TOP = 2.72; // above his antenna (model units), where the bubble points

const HEAD = { y: 1.68, r: 0.56, sx: 1.08, sy: 0.9, sz: 0.95 };
const HEAD_PIVOT_Y = 1.2;

export type QubiModel = {
  group: THREE.Group; // at (x, z) on the bench: holds root and ground, never turns or scales
  root: THREE.Group; // the robot: turns, scales, hops
  ground: THREE.Group; // contact shadow and listening ripples, flat on the bench
  body: THREE.Group; // bobs, leans and spins as a whole (everything above the feet)
  head: THREE.Group;
  arms: [THREE.Group, THREE.Group]; // [left, right], pivots at the shoulders
  legs: [THREE.Group, THREE.Group]; // [left, right], pivots at the hips
  eyes: [THREE.Mesh, THREE.Mesh];
  eyeRest: { x: number; y: number }[];
  mouth: THREE.Group;
  heart: THREE.Mesh;
  tip: THREE.Mesh;
  tipHalo: THREE.Mesh;
  tipHaloMaterial: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  shadowMaterial: THREE.MeshBasicMaterial;
  rings: THREE.Mesh[];
  dots: THREE.Mesh[]; // the thinking dots over his head
  sparks: THREE.Mesh[]; // on his hands, while he works
  hit: THREE.Mesh; // invisible, a generous target for the pointer
  glow: THREE.MeshStandardMaterial; // eyes and smile
  lit: THREE.MeshStandardMaterial; // heart and antenna orb
  setWorried(worried: boolean): void;
  dispose(): void;
};

const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

const NO_RAYCAST: THREE.Object3D["raycast"] = () => {};

// A soft dark blob for under his feet
function blobTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.9)");
  g.addColorStop(0.5, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildQubiModel(): QubiModel {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, ...o });
    materials.push(m);
    return m;
  };
  const accent = new THREE.Color(PALETTE.accent);
  const shell = std(0xf1f3f6, { roughness: 0.28, metalness: 0.12 });
  const trim = std(0xb9bfc7, { roughness: 0.35, metalness: 0.55 });
  const faceGlass = std(0x14161b, { roughness: 0.12, metalness: 0.6 });
  // pale purple that just crosses the bloom threshold: a soft glow, not a blob
  const glow = std(0xd4d0ff, { emissive: accent, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0 });
  const lit = std(accent.getHex(), { emissive: accent, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 });
  const halo = (opacity: number) => {
    const m = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    materials.push(m);
    return m;
  };

  type Opts = { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; shadow?: boolean };
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, o: Opts = {}) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    m.castShadow = o.shadow ?? true;
    m.receiveShadow = m.castShadow;
    parent.add(m);
    return m;
  };

  const group = new THREE.Group();
  const root = pivot(group, 0, 0, 0);
  const ground = pivot(group, 0, 0, 0);
  const body = pivot(root, 0, 0, 0);

  // Soft contact shadow, and the ripples of the listening ring (flat on the bench, a hair above the mat)
  const blob = blobTexture();
  if (blob) textures.push(blob);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: blob, color: blob ? 0xffffff : 0x000000, transparent: true, opacity: blob ? 0.7 : 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  materials.push(shadowMaterial);
  const shadow = mesh(ground, new THREE.CircleGeometry(1.15, 32), shadowMaterial, { y: 0.035, shadow: false });
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  const rings = [0, 1].map(() => {
    const ring = mesh(ground, new THREE.RingGeometry(0.62, 0.7, 64), halo(0), { y: 0.045, shadow: false });
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    ring.visible = false;
    return ring;
  });

  // Legs: a short leg and a round foot each, turning at the hip
  const legs = [-0.2, 0.2].map((x) => {
    const leg = pivot(root, x, HIP_Y, 0);
    mesh(leg, new THREE.CapsuleGeometry(0.06, 0.16, 4, 12), trim, { y: -0.17 });
    mesh(leg, new THREE.SphereGeometry(0.12, 20, 14), shell, { y: -0.29, z: 0.04, sx: 1, sy: 0.62, sz: 1.4 });
    return leg;
  }) as [THREE.Group, THREE.Group];

  // Egg body: a hip plate, a trim belt and a heart light on the chest
  mesh(body, new THREE.CylinderGeometry(0.16, 0.12, 0.14, 24), trim, { y: 0.32 });
  mesh(body, new THREE.SphereGeometry(0.42, 40, 28), shell, { y: 0.72, sy: 1.12, sz: 0.95 });
  const belt = mesh(body, new THREE.TorusGeometry(0.4, 0.03, 12, 48), trim, { y: 0.6, sz: 0.95 });
  belt.rotation.x = Math.PI / 2;
  const chest = pivot(body, 0, 0.84, 0.385);
  chest.rotation.x = -0.25; // follows the curve of the body
  mesh(chest, new THREE.TorusGeometry(0.11, 0.025, 10, 32), trim);
  const heart = mesh(chest, new THREE.CircleGeometry(0.075, 24), lit, { z: 0.01, shadow: false });

  // Floating hands, no arms: each turns around a pivot at the shoulder
  const sparks: THREE.Mesh[] = [];
  const arms = [-0.5, 0.5].map((x) => {
    const arm = pivot(body, x, 0.98, 0);
    const hand = mesh(arm, new THREE.SphereGeometry(0.13, 24, 16), shell, { y: -0.36 });
    mesh(hand, new THREE.TorusGeometry(0.12, 0.022, 8, 28), trim, { y: 0.06 }).rotation.x = Math.PI / 2; // cuff
    const spark = mesh(arm, new THREE.SphereGeometry(0.06, 12, 8), lit, { y: -0.36, z: 0.2, shadow: false });
    spark.scale.setScalar(0.001);
    sparks.push(spark);
    return arm;
  }) as [THREE.Group, THREE.Group];

  // Head (pivot at the neck)
  const head = pivot(body, 0, HEAD_PIVOT_Y, 0);
  mesh(head, new THREE.CylinderGeometry(0.11, 0.14, 0.12, 20), trim, { y: 0.02 });
  const y = HEAD.y - HEAD_PIVOT_Y;
  mesh(head, new THREE.SphereGeometry(HEAD.r, 48, 32), shell, { y, sx: HEAD.sx, sy: HEAD.sy, sz: HEAD.sz });
  // Glass face: the front of a slightly bigger sphere (phi around +z, theta across the middle band)
  mesh(head, new THREE.SphereGeometry(HEAD.r + 0.012, 48, 24, Math.PI / 2 - 0.95, 1.9, 0.82, 1.2), faceGlass, { y, sx: HEAD.sx, sy: HEAD.sy, sz: HEAD.sz, shadow: false });

  // Pill eyes, turned to follow the face
  const eyes = [-0.19, 0.19].map((x) => {
    const eye = mesh(head, new THREE.CapsuleGeometry(0.072, 0.13, 6, 16), glow, { x, y: y + 0.07, z: 0.5, sz: 0.5, shadow: false });
    eye.rotation.y = x * 1.6;
    return eye;
  }) as [THREE.Mesh, THREE.Mesh];
  const eyeRest = eyes.map((eye) => ({ x: eye.position.x, y: eye.position.y }));

  // Smile: half a torus, opening up; flipped into a frown when he is worried
  const mouthY = y - 0.07;
  const mouthZ = 0.525;
  const mouth = pivot(head, 0, mouthY, mouthZ);
  mouth.rotation.x = -0.35; // lies back on the face so it reads from the camera's height
  const smile = mesh(mouth, new THREE.TorusGeometry(0.1, 0.026, 10, 28, Math.PI), glow, { shadow: false });
  smile.rotation.z = Math.PI;
  const setWorried = (worried: boolean) => {
    eyes.forEach((eye, i) => {
      eye.rotation.z = worried ? (i ? -0.35 : 0.35) : 0;
    });
    mouth.rotation.z = worried ? Math.PI : 0;
    mouth.position.y = mouthY - (worried ? 0.06 : 0);
    mouth.position.z = mouthZ + (worried ? 0.06 : 0);
  };

  // Ears: discs with a ring of light (the pivot's turn points its +y to -x, so the outer face is at -side)
  for (const side of [-1, 1]) {
    const ear = pivot(head, side * HEAD.r * HEAD.sx, y, 0);
    ear.rotation.z = Math.PI / 2;
    mesh(ear, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 28), trim);
    mesh(ear, new THREE.TorusGeometry(0.1, 0.02, 8, 28), glow, { y: -side * 0.055, shadow: false }).rotation.x = Math.PI / 2;
  }

  // Curved antenna with a glowing orb and a faint halo
  const top = y + HEAD.r * HEAD.sy - 0.03;
  const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top, 0), new THREE.Vector3(0, top + 0.3, 0), new THREE.Vector3(0.17, top + 0.38, 0.02));
  mesh(head, new THREE.TubeGeometry(stem, 20, 0.022, 8), trim);
  const tip = mesh(head, new THREE.SphereGeometry(0.075, 20, 14), lit, { x: 0.17, y: top + 0.38, z: 0.02, shadow: false });
  const tipHaloMaterial = halo(0.1);
  const tipHalo = mesh(tip, new THREE.SphereGeometry(0.13, 20, 14), tipHaloMaterial, { shadow: false });

  // Thinking dots, over his head (they do not turn with it)
  const dots = [-0.22, 0, 0.22].map((x) => {
    const dot = mesh(root, new THREE.SphereGeometry(0.07, 14, 10), lit, { x, y: 2.95, shadow: false });
    dot.scale.setScalar(0.001);
    return dot;
  });

  // A generous invisible target for the pointer: body and head
  const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  materials.push(hitMaterial);
  const hit = mesh(root, new THREE.CapsuleGeometry(0.65, 1.5, 4, 12), hitMaterial, { y: 1.3, shadow: false });
  hit.name = "qubi-hit";

  // Only the hit proxy answers the pointer: ripples, shadow and sparks must not catch clicks
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== hit) o.raycast = NO_RAYCAST;
  });

  setWorried(false);

  return {
    group, root, ground, body, head, arms, legs, eyes, eyeRest, mouth, heart, tip, tipHalo, tipHaloMaterial, shadow, shadowMaterial, rings, dots, sparks, hit,
    glow, lit, setWorried,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
