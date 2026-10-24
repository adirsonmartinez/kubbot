// An integration node in the band at the top of the map (Vercel, GitHub, Clerk, PostHog, and Supabase while it
// waits for an account): a dark platform like Supabase's, a small silver emblem that hints at the service (it
// spins while there is a connection) and a light: purple when connected, amber with an incident, off when
// disconnected. Pending ("Por conectar": set up, waiting for the person's account) is a piece half built: a
// see-through emblem that stays still, the light off and a dashed outline around the platform. It never glows.
// Origin at the center of the platform, on the ground.
import * as THREE from 'three';
import { box, cylinder, materials as M, PALETTE } from '../materials.js';

const PLATFORM = 4;
const BASE = 0.55;

function mesh(parent, geometry, mat, y) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.y = y;
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Pending: one see-through silver for every emblem and a dashed outline in the map's neutral marker color
let pendingMaterial = null;
let outlineMaterial = null;
const pending = () => (pendingMaterial ??= new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }));
const outline = () => (outlineMaterial ??= new THREE.LineDashedMaterial({ color: PALETTE.marker, dashSize: 0.4, gapSize: 0.28, transparent: true, opacity: 0.75 }));

// Each emblem stands on the platform (y = BASE) and spins slowly in `update`
const EMBLEMS = {
  // Stacked disks (a database); only drawn here while pending: a live Supabase has its own node
  supabase(g) {
    const e = new THREE.Group();
    e.position.y = BASE;
    g.add(e);
    [0, 0.5, 1].forEach((y, i) => cylinder(e, i === 2 ? M.white : M.bodyLight, 0.95, 0.38, 0, y, 0));
    return e;
  },
  // A triangle (pyramid)
  vercel(g) {
    const cone = mesh(g, new THREE.ConeGeometry(1.15, 1.7, 3), M.white, BASE + 0.85);
    return cone;
  },
  // A dark puck with a ring (the round logo)
  github(g) {
    const e = new THREE.Group();
    e.position.y = BASE;
    g.add(e);
    cylinder(e, M.bodyDark, 1, 0.6, 0, 0, 0);
    mesh(e, new THREE.TorusGeometry(0.62, 0.11, 10, 32).rotateX(-Math.PI / 2), M.white, 0.62);
    cylinder(e, M.white, 0.22, 0.12, 0, 0.6, 0);
    return e;
  },
  // An open ring (a "C") around a dot, standing
  clerk(g) {
    const e = new THREE.Group();
    e.position.y = BASE + 1.05;
    g.add(e);
    const ring = mesh(e, new THREE.TorusGeometry(0.75, 0.2, 12, 40, Math.PI * 1.5), M.bodyLight, 0);
    ring.rotation.z = Math.PI * 0.25;
    mesh(e, new THREE.SphereGeometry(0.26, 16, 12), M.white, 0);
    return e;
  },
  // Rising bars (analytics)
  posthog(g) {
    const e = new THREE.Group();
    e.position.y = BASE;
    g.add(e);
    [0.6, 1.1, 1.6].forEach((h, i) => box(e, i === 2 ? M.bodyLight : M.body, 0.42, h, 0.42, (i - 1) * 0.55, 0, 0));
    return e;
  },
};

const LIGHT = { connected: () => M.accentSolid, incident: () => M.warnSolid, disconnected: () => M.slab, pending: () => M.slab };

export function buildIntegration(key, status = 'connected') {
  const g = new THREE.Group();
  box(g, M.slabEdge, PLATFORM, 0.3, PLATFORM, 0, 0, 0);
  box(g, M.slab, PLATFORM - 0.4, 0.25, PLATFORM - 0.4, 0, 0.3, 0);
  const led = box(g, (LIGHT[status] ?? LIGHT.connected)(), 0.5, 0.06, 0.12, 0, BASE, PLATFORM / 2 - 0.45);
  led.castShadow = false;
  const emblem = EMBLEMS[key]?.(g) ?? null;
  if (status === 'pending') {
    emblem?.traverse((o) => { if (o.isMesh) { o.material = pending(); o.castShadow = false; } });
    const square = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLATFORM + 0.9, PLATFORM + 0.9).rotateX(-Math.PI / 2)), outline());
    square.position.y = 0.08;
    square.computeLineDistances();
    g.add(square);
  }

  const live = status !== 'disconnected' && status !== 'pending';
  function update(t) {
    if (emblem && live) emblem.rotation.y = t * 0.5;
  }

  return { group: g, update, labelY: BASE + 3 };
}
