// The Arduino lab's bench in 3D (spec/005-arduino-lab.md), on its own layer. Draws LabViewModel's store:
// the parts where diagram.json puts them (Wokwi pixels / 40; all piled up -> a row above the board), the
// wires as arcs between pins, a ruler and an obstacle in front of each HC-SR04 (a click on the ruler, with
// the mouse or the hand's cursor, moves the obstacle there), lit LEDs, a pulsing buzzer, and a red (error)
// or amber (warning) rim under a part with an issue, its wires red too. Clicks go to labViewModel.handlePick.
import * as THREE from 'three';
import { platform, glowPad, box, PALETTE } from './materials.js';
import { buildPart, buildWire } from './builders/arduinoBuilder.js';

const PX = 40; // Wokwi's pixels per bench unit
const CM = 0.05; // bench units per centimeter in front of a sensor (2 m = 10 units)
const RULER_CM = 200;
const ERROR_WIRE = new THREE.MeshStandardMaterial({ color: PALETTE.danger, emissive: PALETTE.danger, emissiveIntensity: 0.4, roughness: 0.5 });

// Where each part goes (its footprint's center): diagram.json's top-left in pixels, unless they are piled up
function layout(parts, built) {
  const others = parts.filter((p) => p.kind !== 'board');
  const distinct = new Set(others.map((p) => `${p.left},${p.top}`)).size;
  const piled = others.length > 1 && distinct < others.length / 2;
  const at = new Map();
  if (!piled) {
    for (const p of parts) {
      const { w, d } = built.get(p.id).size;
      at.set(p.id, { x: p.left / PX + w / 2, z: p.top / PX + d / 2 });
    }
    return at;
  }
  let x = 0;
  for (const p of parts) {
    const { w, d } = built.get(p.id).size;
    if (p.kind === 'board') at.set(p.id, { x: w / 2, z: d / 2 });
    else { at.set(p.id, { x: x + w / 2, z: -3.2 + d / 2 }); x += w + 0.7; }
  }
  return at;
}

export function createLabView({ sceneView, labViewModel }) {
  const root = new THREE.Group();
  sceneView.layers.lab.add(root);
  let pickables = [];
  let updaters = [];
  let built = -1;
  let selectionPad = null;
  const positions = new Map(); // id -> { x, z, w, d }

  function clear() {
    root.clear();
    pickables = [];
    updaters = [];
    positions.clear();
    selectionPad = null;
  }

  function rebuild(st) {
    clear();
    if (!st.parts.length) return;
    const parts = st.parts;
    const builtParts = new Map(parts.map((p) => [p.id, buildPart(p, { pins: p.pins })]));
    const at = layout(parts, builtParts);

    // Bounds (with room for the rulers), then everything is centered on the origin
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of parts) {
      const { x, z } = at.get(p.id), { w, d } = builtParts.get(p.id).size;
      const reach = p.kind === 'ultrasonic' ? RULER_CM * CM + 1.5 : 0;
      minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2 + reach);
      minZ = Math.min(minZ, z - d / 2); maxZ = Math.max(maxZ, z + d / 2);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const top = platform(root, maxX - minX + 2.4, maxZ - minZ + 2.4, 0, 0);

    const worst = new Map();
    for (const issue of st.issues) for (const id of issue.parts) if (worst.get(id) !== 'error') worst.set(id, issue.level);

    for (const p of parts) {
      const b = builtParts.get(p.id);
      const { x, z } = at.get(p.id);
      const pos = { x: x - cx, z: z - cz, w: b.size.w, d: b.size.d };
      positions.set(p.id, pos);
      b.group.position.set(pos.x, top, pos.z);
      b.group.userData.pick = { type: 'lab-part', id: p.id };
      root.add(b.group);
      pickables.push(b.group);
      if (b.update) updaters.push((s, t) => b.update(s.status === 'running' ? s.live[p.id] : null, t));
      const level = worst.get(p.id);
      if (level) glowPad(b.group, level === 'error' ? PALETTE.danger : PALETTE.warn, b.size.w + 0.4, b.size.d + 0.4, 0.02);
      if (p.kind === 'ultrasonic') addRuler(p.id, pos, top);
    }

    // Wires between the pins; a part with an error turns its wires red
    const pinAt = (end) => {
      const b = builtParts.get(end.part), pos = positions.get(end.part);
      const local = b?.pins[end.pin];
      return local ? new THREE.Vector3(pos.x + local.x, top + local.y, pos.z + local.z) : null;
    };
    for (const w of st.wires) {
      const a = pinAt(w.from), c = pinAt(w.to);
      if (!a || !c) continue;
      const bad = worst.get(w.from.part) === 'error' || worst.get(w.to.part) === 'error';
      root.add(buildWire(a, c, w.color, bad ? ERROR_WIRE : null));
    }
    applySelection(st);
  }

  // The ruler in front of an HC-SR04 (one pickable tile per 10 cm) and the obstacle that moves on it
  function addRuler(id, pos, top) {
    const x0 = pos.x + pos.w / 2 + 0.2;
    const tileMat = [new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x4d545d, roughness: 0.9 })];
    for (let cm = 10; cm <= RULER_CM; cm += 10) {
      const tile = box(root, tileMat[(cm / 10) % 2], 10 * CM - 0.02, 0.03, 1.6, x0 + (cm - 5) * CM, top, pos.z);
      tile.userData.pick = { type: 'lab-ruler', id, cm };
      pickables.push(tile);
      if (cm % 50 === 0) box(root, new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6 }), 0.04, 0.05, 1.7, x0 + cm * CM, top, pos.z);
    }
    const obstacle = new THREE.Group();
    box(obstacle, new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.6 }), 0.25, 1.8, 2.0, 0, 0, 0);
    obstacle.position.set(x0 + 100 * CM, top, pos.z);
    root.add(obstacle);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.25, depthWrite: false }));
    beam.position.y = top + 0.6;
    root.add(beam);
    updaters.push((s) => {
      const cm = s.distance[id] ?? 100;
      const goal = x0 + Math.min(cm, RULER_CM + 20) * CM;
      obstacle.position.x += (goal - obstacle.position.x) * 0.25;
      const len = Math.max(0.01, obstacle.position.x - x0);
      beam.visible = s.status === 'running';
      beam.scale.x = len;
      beam.position.set(x0 + len / 2, top + 0.6, pos.z);
    });
  }

  // The selected part: a purple rim under it
  function applySelection(st) {
    if (selectionPad) { root.remove(selectionPad); selectionPad = null; }
    const pos = st.selected && positions.get(st.selected);
    if (!pos) return;
    selectionPad = new THREE.Group();
    glowPad(selectionPad, PALETTE.accent, pos.w + 0.6, pos.d + 0.6, 0.31);
    selectionPad.position.set(pos.x, 0, pos.z);
    root.add(selectionPad);
  }

  let selected = null;
  labViewModel.store.subscribe((st) => {
    if (st.version !== built) {
      built = st.version;
      rebuild(st);
      selected = st.selected;
    } else if (st.selected !== selected) {
      selected = st.selected;
      applySelection(st);
    }
  }, { immediate: true });

  sceneView.onFrame((t) => {
    if (!sceneView.layers.lab.visible) return;
    const st = labViewModel.store.state;
    for (const u of updaters) u(st, t);
  });

  return { pickTargets: () => pickables };
}
