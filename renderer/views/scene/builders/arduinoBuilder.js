// Low-poly Arduino parts for the lab's bench (spec/005-arduino-lab.md), in the map's style: matte graphite
// and silver, one accent; only a lit LED (and a problem) glows. Each builder returns
//   { group, size: { w, d }, pins: { name: THREE.Vector3 (local, where a wire lands) }, update?(live, t) }
// with the group's origin at the center of the part's footprint, on the bench's surface.
import * as THREE from 'three';
import { materials, box, cylinder, PALETTE, labColor } from '../materials.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...extra });
const PCB = flat(PALETTE.lab.pcb);
const HEADER = flat(PALETTE.lab.header, { roughness: 0.9 });
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Arduino Uno / Nano / Mega: a board with the digital header along the top edge (pin 0 on the right, as
// on the real board) and power + analog along the bottom edge
function board(part) {
  const group = new THREE.Group();
  const size = part.key === 'nano' ? { w: 4.4, d: 2.2 } : part.key === 'mega' ? { w: 9.2, d: 4.2 } : { w: 5.4, d: 4.2 };
  const { w, d } = size;
  box(group, PCB, w, 0.12, d, 0, 0, 0);
  box(group, materials.metal, 1.1, 0.5, 1.0, -w / 2 + 0.45, 0.12, -d / 2 + 1.0); // USB
  box(group, HEADER, 0.9, 0.45, 0.9, -w / 2 + 0.4, 0.12, d / 2 - 0.8); // power jack
  box(group, HEADER, 1.9, 0.14, 0.5, 0.6, 0.12, 0.7); // the ATmega
  const pins = {};
  // Top edge, right to left: 0..7, a gap, 8..13, GND, AREF
  const digitalLow = ['0', '1', '2', '3', '4', '5', '6', '7'];
  const digitalHigh = ['8', '9', '10', '11', '12', '13', 'GND.3', 'AREF'];
  const top = -d / 2 + 0.3;
  digitalLow.forEach((n, i) => { pins[n] = v(w / 2 - 0.5 - i * 0.27, 0.45, top); });
  digitalHigh.forEach((n, i) => { pins[n] = v(w / 2 - 0.5 - 8 * 0.27 - 0.25 - i * 0.27, 0.45, top); });
  box(group, HEADER, 8 * 0.27 + 0.1, 0.3, 0.32, w / 2 - 0.5 - 3.5 * 0.27, 0.12, top);
  box(group, HEADER, 8 * 0.27 + 0.1, 0.3, 0.32, w / 2 - 0.5 - 8 * 0.27 - 0.25 - 3.5 * 0.27, 0.12, top);
  // Bottom edge, left to right: power, then analog
  const power = ['IOREF', 'RESET', '3.3V', '5V', 'GND.1', 'GND.2', 'VIN'];
  const analog = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
  const bottom = d / 2 - 0.3;
  const p0 = -w / 2 + 1.5, a0 = p0 + 7 * 0.27 + 0.4;
  power.forEach((n, i) => { pins[n] = v(p0 + i * 0.27, 0.45, bottom); });
  analog.forEach((n, i) => { pins[n] = v(a0 + i * 0.27, 0.45, bottom); });
  box(group, HEADER, 7 * 0.27 + 0.1, 0.3, 0.32, p0 + 3 * 0.27, 0.12, bottom);
  box(group, HEADER, 6 * 0.27 + 0.1, 0.3, 0.32, a0 + 2.5 * 0.27, 0.12, bottom);
  return { group, size, pins };
}

// An LED: a colored dome on two legs; it glows with its brightness (bloom)
function led(part) {
  const group = new THREE.Group();
  const color = labColor(part.attrs.color ?? 'red', PALETTE.lab.named.red);
  const lens = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, emissive: color, emissiveIntensity: 0.05, transparent: true, opacity: 0.92 });
  cylinder(group, materials.metal, 0.03, 0.35, -0.1, 0, 0);
  cylinder(group, materials.metal, 0.03, 0.3, 0.1, 0, 0);
  cylinder(group, lens, 0.2, 0.32, 0, 0.32, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lens);
  dome.position.y = 0.64;
  group.add(dome);
  const update = (live) => {
    const b = live ? (live.brightness ?? (live.on ? 1 : 0)) : 0;
    lens.emissiveIntensity = 0.05 + 2.4 * b;
  };
  return { group, size: { w: 0.5, d: 0.5 }, pins: { A: v(-0.1, 0.05, 0), C: v(0.1, 0.05, 0) }, update };
}

// A resistor: a silver body with three color bands (220 Ω: red, red, brown)
function resistor() {
  const group = new THREE.Group();
  const body = cylinder(group, flat(0xc9b38a), 0.11, 0.9, 0, 0.12, 0);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.23, 0);
  [-0.22, -0.07, 0.08].forEach((x, i) => {
    const band = cylinder(group, flat(i < 2 ? PALETTE.lab.named.red : PALETTE.lab.named.brown), 0.115, 0.06, 0, 0.12, 0);
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0.23, 0);
  });
  const lead = (x) => { const l = cylinder(group, materials.metal, 0.02, 0.4, 0, 0, 0); l.rotation.z = Math.PI / 2; l.position.set(x, 0.23, 0); };
  lead(-0.6);
  lead(0.6);
  return { group, size: { w: 1.6, d: 0.3 }, pins: { 1: v(-0.8, 0.2, 0), 2: v(0.8, 0.2, 0) } };
}

// A passive buzzer: a black drum; a purple ring pulses while it sounds
function buzzer() {
  const group = new THREE.Group();
  cylinder(group, HEADER, 0.45, 0.45, 0, 0, 0);
  cylinder(group, flat(0x23262b), 0.08, 0.02, 0, 0.45, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  ring.visible = false;
  group.add(ring);
  const update = (live, t) => {
    const hz = live?.hz ?? 0;
    ring.visible = hz > 0;
    if (hz > 0) {
      const k = (t * 2) % 1;
      ring.scale.setScalar(1 + k * 0.9);
      ring.material.opacity = 1 - k;
    }
  };
  return { group, size: { w: 1, d: 1 }, pins: { 1: v(-0.2, 0.05, 0.45), 2: v(0.2, 0.05, 0.45) }, update };
}

// HC-SR04: a small board standing up, its two "eyes" looking along +x (where the obstacle is)
function ultrasonic() {
  const group = new THREE.Group();
  box(group, flat(0x3b4048), 0.12, 1.0, 2.0, 0, 0.1, 0);
  for (const z of [-0.5, 0.5]) {
    const eye = cylinder(group, materials.metal, 0.36, 0.4, 0, 0, 0);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(0.26, 0.6, z);
    const mesh = cylinder(group, HEADER, 0.28, 0.02, 0, 0, 0);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(0.47, 0.6, z);
  }
  box(group, HEADER, 0.3, 0.12, 1.1, -0.12, 0, 0);
  const pins = { VCC: v(-0.2, 0.08, -0.4), TRIG: v(-0.2, 0.08, -0.13), ECHO: v(-0.2, 0.08, 0.13), GND: v(-0.2, 0.08, 0.4) };
  return { group, size: { w: 0.8, d: 2.0 }, pins };
}

// Everything else (servo, joystick, L298N, HC-05, motor, battery…): a box with its pins along the front
function generic(part, pinNames) {
  const group = new THREE.Group();
  const w = Math.max(1.2, pinNames.length * 0.28 + 0.3), d = 1.0;
  box(group, flat(0x4d545d), w, 0.5, d, 0, 0, 0);
  box(group, flat(0xc9ced4), w - 0.2, 0.04, d - 0.2, 0, 0.5, 0);
  const pins = {};
  pinNames.forEach((n, i) => { pins[n] = v(-w / 2 + 0.3 + i * 0.28, 0.1, d / 2); });
  return { group, size: { w, d }, pins };
}

export function buildPart(part, spec) {
  switch (part.kind) {
    case 'board': return board(part);
    case 'led': return led(part);
    case 'resistor': return resistor(part);
    case 'buzzer': return buzzer(part);
    case 'ultrasonic': return ultrasonic(part);
    default: return generic(part, spec?.pins ?? []);
  }
}

// A wire: a tube that rises from one pin, arcs over and lands on the other
const wireMaterials = new Map();
export function buildWire(a, b, color, material = null) {
  const lift = 0.7 + a.distanceTo(b) * 0.08;
  const curve = new THREE.CatmullRomCurve3([a, v(a.x, a.y + lift, a.z), v(b.x, b.y + lift, b.z), b]);
  const mat = material ?? wireMaterials.get(color) ?? wireMaterials.set(color, flat(labColor(color), { roughness: 0.5 })).get(color);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.045, 6, false), mat);
  mesh.castShadow = true;
  return mesh;
}
