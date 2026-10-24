// Remi on the map: a pixel-art sprite that walks from the main building to the cracked one,
// looks, thinks (a bubble), hammers with sparks, and waits there until the card is closed.
import * as THREE from 'three';
import { box, materials as M } from './materials.js';
import { drawSprite, SPRITE_H, SPRITE_W, STEP_FPS, STEP_FRAMES } from '../remiSprite.js';

const SCALE = 8;
const HEIGHT = 2.4; // world units
const GRAVITY = 14;

function frameTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W * SCALE;
  canvas.height = SPRITE_H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawSprite(ctx, name, SCALE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRemiView({ sceneView, repairViewModel }) {
  const textures = {};
  const texture = (name) => (textures[name] ??= frameTexture(name));
  const material = new THREE.SpriteMaterial({ map: texture('idle'), transparent: true, alphaTest: 0.5 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(HEIGHT * (SPRITE_W / SPRITE_H), HEIGHT, 1);
  sprite.center.set(0.5, 0);

  // Shadow under his feet
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x1b1a2e, transparent: true, opacity: 0.22 }));
  shadow.rotation.x = -Math.PI / 2;

  const remi = new THREE.Group();
  remi.add(sprite, shadow);
  remi.visible = false;
  sceneView.scene.add(remi);

  const sparks = []; // { mesh, v, life }
  let stepStarted = 0;
  let lastStep = -1;
  let clock = 0;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function spark(at) {
    const mesh = box(sceneView.scene, M.spark, 0.12, 0.12, 0.12, at.x, at.y, at.z);
    mesh.castShadow = false;
    sparks.push({ mesh, life: 0.6, v: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4) });
  }

  repairViewModel.store.subscribe((state) => {
    const job = state.job;
    remi.visible = Boolean(job);
    if (job && job.step !== lastStep) { lastStep = job.step; stepStarted = clock; }
    if (!job) lastStep = -1;
  });

  sceneView.onFrame((_t, dt) => {
    clock += dt;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.v.y -= GRAVITY * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.life <= 0) { sceneView.scene.remove(s.mesh); sparks.splice(i, 1); }
    }

    const job = repairViewModel.store.state.job;
    if (!job) return;
    const elapsed = clock - stepStarted;

    // Position: walking along the road during step 0, then standing at the building
    const k = job.step === 0 ? Math.min(elapsed / (job.stepMs / 1000), 1) : 1;
    const x = job.from.x + (job.to.x - job.from.x) * k;
    const z = job.from.z + (job.to.z - job.from.z) * k;
    const hop = job.step === 0 && !still ? Math.abs(Math.sin(elapsed * 12)) * 0.15 : 0;
    remi.position.set(x, 0.45 + hop, z);

    // Animation frame for the current step
    const frames = STEP_FRAMES[job.step] ?? ['idle'];
    const index = still ? 0 : Math.floor(elapsed * STEP_FPS[job.step]) % frames.length;
    const map = texture(frames[index]);
    if (material.map !== map) { material.map = map; material.needsUpdate = true; }

    // Hammer hits throw sparks at the wall (on the hammerDown frame)
    if (job.step === 3 && frames[index] === 'hammerDown' && !still && Math.random() < 0.5) {
      const towardWall = 0.4; // a bit in front of Remi, toward the building
      spark({ x: x + (job.center.x - x) * towardWall, y: 0.45 + HEIGHT * 0.4, z: z + (job.center.z - z) * towardWall });
    }
  });
}
