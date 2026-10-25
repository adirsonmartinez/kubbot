// One wire of the bench in three.js (imperative; Wires.tsx mounts it): a glossy tube along the arc from
// wireCurve, a plug at each pin like a jumper wire's connector, a thicker invisible tube to click on, and
// glowing particles that flow while the simulation runs. Only the invisible tube takes pointer events.

import * as THREE from "three";
import type { WireKind } from "@/models/lab/layout";
import { pointAlong, wireLength, type Vec3 } from "./wireCurve";

export const WIRE_COLORS: Record<WireKind, number> = { power: 0xd9534f, gnd: 0x2b2f35, bus: 0x4a90e2, signal: 0xe6e9ec };
// Particles are lit above the bloom threshold, so a flowing wire really glows
const SPARK_COLORS: Record<WireKind, number> = { power: 0xff9a8f, gnd: 0xa9b6ff, bus: 0x8fc2ff, signal: 0xd4d0ff };
const SPARK_GAIN = 1.7;

export const CONNECTOR = { top: 0.17, width: 0.13, height: 0.2 }; // a wire starts at its plug's top
const RADIUS = 0.045;
const PICK_RADIUS = 0.13;
const PICK_MARGIN = 0.32; // arc length at each end that stays clickable as the pin, not as the wire
const SPARK_RADIUS = 0.066;
const SPARK_SPEED = 2.6; // world units per second at full flow
const REVEAL_SECONDS = 0.45;
const MAX_SPARKS = 14;
const NO_RAYCAST = () => {};

const plugGeometry = new THREE.BoxGeometry(CONNECTOR.width, CONNECTOR.height, CONNECTOR.width);
const sparkGeometry = new THREE.SphereGeometry(SPARK_RADIUS, 8, 6);
const sparkMaterials = new Map<WireKind, THREE.MeshBasicMaterial>();
const sparkMaterial = (kind: WireKind) => {
  let m = sparkMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(SPARK_COLORS[kind]).multiplyScalar(SPARK_GAIN), toneMapped: false });
    sparkMaterials.set(kind, m);
  }
  return m;
};

const vec = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const easeOut = (k: number) => 1 - (1 - k) ** 3;

function tubeGeometry(points: readonly Vec3[], radius: number, radial: number) {
  const curve = new THREE.CatmullRomCurve3(points.map(vec), false, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, radial, false);
}

export type WireVisual = {
  group: THREE.Group;
  pickMesh: THREE.Mesh;
  setPoints: (points: Vec3[]) => void;
  setReverse: (reverse: boolean) => void;
  setHot: (hot: boolean) => void;
  setVisible: (visible: boolean) => void;
  mid: () => Vec3;
  update: (dt: number, flow?: number, running?: boolean) => void;
  dispose: () => void;
};

// `reverse`: particles travel from the last point to the first. `reveal`: the wire grows out of its first
// pin (a new wire) instead of showing whole.
export function buildWire({ id, kind, points, reverse = false, reveal = false }: { id: string; kind: WireKind; points: Vec3[]; reverse?: boolean; reveal?: boolean }): WireVisual {
  const group = new THREE.Group();
  group.name = `wire-${id}`;
  const color = WIRE_COLORS[kind];
  // a ground wire is nearly black: a faint glow keeps it readable on the dark mat
  const idle = kind === "gnd" ? 0.3 : 0;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.15, emissive: kind === "gnd" ? 0x4a525c : color, emissiveIntensity: idle });
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), material);
  tube.castShadow = true;
  tube.raycast = NO_RAYCAST;
  const pick = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  const plugA = new THREE.Mesh(plugGeometry, material);
  const plugB = new THREE.Mesh(plugGeometry, material);
  for (const plug of [plugA, plugB]) {
    plug.castShadow = true;
    plug.raycast = NO_RAYCAST;
  }
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial(kind), MAX_SPARKS);
  sparks.frustumCulled = false; // its bounds are not updated as the instances move
  sparks.count = 0;
  sparks.raycast = NO_RAYCAST;
  group.add(tube, pick, plugA, plugB, sparks);

  let curve: Vec3[] = points;
  let length = 1;
  let age = reveal ? 0 : REVEAL_SECONDS;
  let phase = 0;
  let hot = false;
  const dummy = new THREE.Object3D();
  const plugAt = (plug: THREE.Mesh, p: Vec3) => plug.position.set(p.x, p.y - (CONNECTOR.top - CONNECTOR.height / 2), p.z);

  function applyReveal() {
    const k = easeOut(Math.min(1, age / REVEAL_SECONDS));
    const index = tube.geometry.index;
    if (index) tube.geometry.setDrawRange(0, Math.floor((index.count * k) / 3) * 3);
    plugB.visible = k >= 0.98;
  }

  function setPoints(next: Vec3[]) {
    curve = next;
    length = wireLength(next) || 1;
    tube.geometry.dispose();
    tube.geometry = tubeGeometry(next, RADIUS, 8);
    // the pickable part skips the ends so the pins keep their own clicks
    const skip = Math.max(1, Math.ceil(((next.length - 1) * PICK_MARGIN) / length));
    const middle = next.slice(skip, next.length - skip);
    pick.geometry.dispose();
    pick.geometry = tubeGeometry(middle.length >= 2 ? middle : next, PICK_RADIUS, 4);
    plugAt(plugA, next[0]);
    plugAt(plugB, next[next.length - 1]);
    applyReveal();
  }

  // flow 0..1 comes from the simulation; the tube glows a little with it, so the wire feels alive
  function update(dt: number, flow = 0, running = false) {
    if (age < REVEAL_SECONDS) {
      age = Math.min(REVEAL_SECONDS, age + dt);
      applyReveal();
    }
    const live = running && flow > 0.02 && age >= REVEAL_SECONDS;
    material.emissiveIntensity = hot ? 0.5 : live ? Math.max(idle, 0.12 * flow) : idle;
    if (!live) {
      sparks.count = 0;
      return;
    }
    const n = Math.max(3, Math.min(MAX_SPARKS, Math.round(length * 1.15)));
    phase = (phase + (dt * SPARK_SPEED * (0.35 + 0.65 * flow)) / length) % 1;
    for (let i = 0; i < n; i++) {
      const u = (phase + i / n) % 1;
      const p = pointAlong(curve, reverse ? 1 - u : u, length);
      // a soft pulse along the wire, stronger with more flow
      const s = (0.55 + 0.45 * Math.sin((u * 6 + phase * 4) * Math.PI)) * (0.55 + 0.6 * flow);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(Math.max(0.25, s));
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.count = n;
    sparks.instanceMatrix.needsUpdate = true;
  }

  setPoints(points);

  return {
    group,
    pickMesh: pick,
    setPoints,
    setReverse(value) {
      reverse = value;
    },
    setHot(value) {
      hot = value;
    },
    setVisible(value) {
      group.visible = value;
    },
    mid: () => curve[curve.length >> 1],
    update,
    dispose() {
      tube.geometry.dispose();
      pick.geometry.dispose();
      (pick.material as THREE.Material).dispose();
      material.dispose();
      sparks.dispose();
      group.removeFromParent();
    },
  };
}
