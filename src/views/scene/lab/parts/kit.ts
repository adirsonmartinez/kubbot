// Shared kit for the lab's procedural parts. Everything here works in MILLIMETRES: the part's body group is
// scaled by MM, so a builder thinks in the datasheet's units. Geometries are shared and never disposed;
// materials are cached by name, except the ones a part animates (those are made with ctx.own and disposed).
import * as THREE from "three";
import type { BoardPin, Component, PartPin } from "../../../../models/lab/catalog.ts";
import type { PartContext } from "./types.ts";

// --- Shared geometry (unit sized, scaled per mesh) ---
const geometries = new Map<string, THREE.BufferGeometry>();
function geometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let found = geometries.get(key);
  if (!found) {
    found = make();
    geometries.set(key, found);
  }
  return found as T;
}

export const unit = {
  box: () => geometry("box", () => new THREE.BoxGeometry(1, 1, 1)),
  cylinder: (seg = 24) => geometry(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  sphere: (seg = 20) => geometry(`sph${seg}`, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg >> 1))),
  dome: (seg = 20, rings = 0) =>
    geometry(`dome${seg}.${rings}`, () => new THREE.SphereGeometry(0.5, seg, rings || Math.max(3, seg >> 2), 0, Math.PI * 2, 0, Math.PI / 2)),
  plane: () => geometry("plane", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  disc: (seg = 24) => geometry(`disc${seg}`, () => new THREE.CircleGeometry(0.5, seg).rotateX(-Math.PI / 2)),
  annulus: (ratio: number, seg = 32) => geometry(`ann${ratio.toFixed(3)}.${seg}`, () => new THREE.RingGeometry(0.5 * ratio, 0.5, seg).rotateX(-Math.PI / 2)),
  torus: (ratio: number, seg = 20) => geometry(`tor${ratio.toFixed(3)}.${seg}`, () => new THREE.TorusGeometry(0.5, 0.5 * ratio, 8, seg).rotateX(Math.PI / 2)),
};

// --- Materials ---
type MatOptions = { r?: number; m?: number; emissive?: number; ei?: number; flat?: boolean; opacity?: number; double?: boolean };
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(name: string, color: number, o: MatOptions = {}): THREE.MeshStandardMaterial {
  let found = materials.get(name);
  if (!found) {
    found = new THREE.MeshStandardMaterial({
      color,
      roughness: o.r ?? 0.55,
      metalness: o.m ?? 0.1,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 1,
      flatShading: !!o.flat,
      transparent: o.opacity != null,
      opacity: o.opacity ?? 1,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    materials.set(name, found);
  }
  return found;
}

export const K = {
  pcb: (color: number) => mat(`pcb${color}`, color, { r: 0.42, m: 0.05 }),
  black: mat("black", 0x15171b, { r: 0.45, m: 0.2 }),
  dark: mat("dark", 0x24272d, { r: 0.55, m: 0.15 }),
  header: mat("header", 0x1b1c20, { r: 0.6, m: 0.1 }),
  silver: mat("silver", 0xc9ccd1, { r: 0.28, m: 0.85 }),
  steel: mat("steel", 0x8e949c, { r: 0.35, m: 0.8 }),
  gold: mat("gold", 0xd9b24c, { r: 0.28, m: 0.9 }),
  copper: mat("copper", 0xb8733a, { r: 0.4, m: 0.7 }),
  silk: mat("silk", 0xdfe9ee, { r: 0.9, m: 0 }),
  white: mat("white", 0xf1f1ec, { r: 0.45, m: 0.05 }),
  hole: mat("hole", 0x0a0b0d, { r: 1, m: 0 }),
  smdTan: mat("smdTan", 0xc9a56b, { r: 0.6, m: 0.2 }),
  smdBlack: mat("smdBlack", 0x1d1e22, { r: 0.5, m: 0.1 }),
  green: mat("greenTerm", 0x2fa14f, { r: 0.5, m: 0.05 }),
  blueTerm: mat("blueTerm", 0x2457c8, { r: 0.5, m: 0.05 }),
};

// --- Primitives. (x, y, z) is the bottom centre for box / cyl / dome; the centre for cylH / sphere ---
type Mat = THREE.Material;
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: Mat, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = sx * sy * sz > 40;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function box(parent: THREE.Object3D, material: Mat, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const mesh = put(parent, unit.box(), material, w, h, d, x, y + h / 2, z);
  mesh.rotation.y = ry;
  return mesh;
}

export const cyl = (parent: THREE.Object3D, material: Mat, r: number, h: number, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh =>
  put(parent, unit.cylinder(seg), material, r * 2, h, r * 2, x, y + h / 2, z);

// Horizontal cylinder along 'x' or 'z', centred on (x, y, z)
export function cylH(parent: THREE.Object3D, material: Mat, r: number, len: number, x: number, y: number, z: number, axis: "x" | "z" = "x", seg = 16): THREE.Mesh {
  const mesh = put(parent, unit.cylinder(seg), material, r * 2, len, r * 2, x, y, z);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  else mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export const sphere = (parent: THREE.Object3D, material: Mat, r: number, x: number, y: number, z: number, seg = 16): THREE.Mesh =>
  put(parent, unit.sphere(seg), material, r * 2, r * 2, r * 2, x, y, z);

// Half sphere standing on y: radius r, height h
export const dome = (parent: THREE.Object3D, material: Mat, r: number, h: number, x = 0, y = 0, z = 0, seg = 20, rings = 0): THREE.Mesh =>
  put(parent, unit.dome(seg, rings), material, r * 2, h * 2, r * 2, x, y, z);

// Flat shapes lying on a surface at height y
export const disc = (parent: THREE.Object3D, material: Mat, r: number, x: number, y: number, z: number, seg = 24): THREE.Mesh =>
  put(parent, unit.disc(seg), material, r * 2, 1, r * 2, x, y, z);
export const annulus = (parent: THREE.Object3D, material: Mat, rOut: number, rIn: number, x: number, y: number, z: number, seg = 32): THREE.Mesh =>
  put(parent, unit.annulus(rIn / rOut, seg), material, rOut * 2, 1, rOut * 2, x, y, z);
export const torus = (parent: THREE.Object3D, material: Mat, r: number, tube: number, x: number, y: number, z: number, seg = 20): THREE.Mesh =>
  put(parent, unit.torus(tube / r, seg), material, r * 2, r * 2, r * 2, x, y, z);

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// A cylinder from point a to point b
type Vec3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);
export function rod(parent: THREE.Object3D, material: Mat, a: Vec3, b: Vec3, r: number, seg = 8): THREE.Mesh {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const mesh = put(parent, unit.cylinder(seg), material, r * 2, dir.length(), r * 2, mid.x, mid.y, mid.z);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = false;
  return mesh;
}

// --- PCB: a rounded slab with optional see-through mounting holes (gold pads around them) ---
export type Hole = [number, number];
function pcbGeometry(w: number, d: number, t: number, r: number, holes: Hole[], holeR: number): THREE.BufferGeometry {
  return geometry(`pcb${w}x${d}x${t}r${r}h${holes.map((h) => h.join(",")).join(";")}${holeR}`, () => {
    const shape = new THREE.Shape();
    const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x1 - r, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + r);
    shape.lineTo(x1, y1 - r); shape.quadraticCurveTo(x1, y1, x1 - r, y1);
    shape.lineTo(x0 + r, y1); shape.quadraticCurveTo(x0, y1, x0, y1 - r);
    shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    for (const [hx, hz] of holes) {
      const hole = new THREE.Path();
      hole.absarc(hx, -hz, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
  });
}

type PcbOptions = { t?: number; r?: number; holes?: Hole[]; holeR?: number; y?: number; x?: number; z?: number };
// Returns the top height (t). `holes` are [x, z] from the centre.
export function pcb(parent: THREE.Object3D, color: number, w: number, d: number, { t = 1.6, r = 1.2, holes = [], holeR = 1.6, y = 0, x = 0, z = 0 }: PcbOptions = {}): number {
  const mesh = new THREE.Mesh(pcbGeometry(w, d, t, r, holes, holeR), K.pcb(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  for (const [hx, hz] of holes) annulus(parent, K.gold, holeR + 1.3, holeR, x + hx, y + t + 0.06, z + hz, 20);
  return t;
}

// Holes of a catalog board ([x, y] from the corner) as [x, z] from the centre
export const holesOf = (spec: Component): Hole[] =>
  spec.kind === "board" ? spec.holes.map(([hx, hy]): Hole => [hx - spec.size[0] / 2, hy - spec.size[1] / 2]) : [];

// --- Silkscreen: thin pale lines and marks on a PCB (y = the board's top) ---
const SILK_H = 0.14;
export function silkLine(parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, th = 0.4): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  return box(parent, K.silk, len, SILK_H, th, (x0 + x1) / 2, y - 0.02, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0));
}
export function silkRect(parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, th = 0.4): void {
  silkLine(parent, x0 - th / 2, z0, x1 + th / 2, z0, y, th);
  silkLine(parent, x0 - th / 2, z1, x1 + th / 2, z1, y, th);
  silkLine(parent, x0, z0, x0, z1, y, th);
  silkLine(parent, x1, z0, x1, z1, y, th);
}
// A row of short marks (pin labels, like printed text) along x or z
export function silkMarks(parent: THREE.Object3D, x: number, z: number, n: number, step: number, y: number, { axis = "x", len = 1.4, th = 0.45 }: { axis?: "x" | "z"; len?: number; th?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const o = i * step;
    if (axis === "x") box(parent, K.silk, len, SILK_H, th, x + o, y - 0.02, z);
    else box(parent, K.silk, th, SILK_H, len, x, y - 0.02, z + o);
  }
}
// Arduino's infinity logo: two flat rings
export function silkLogo(parent: THREE.Object3D, x: number, z: number, y: number, r = 2.2): void {
  torus(parent, K.silk, r, 0.34, x - r * 0.95, y + 0.12, z, 18);
  torus(parent, K.silk, r, 0.34, x + r * 0.95, y + 0.12, z, 18);
}

// --- Components ---
type ChipOptions = { leads?: "dip" | "quad" | "skirt" | "none"; n?: number; dot?: boolean; body?: Mat };
// A chip: black body, a pin-1 dot and leads. leads: 'dip' (n per side along x), 'quad', 'skirt' or 'none'
export function chip(parent: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, h: number, { leads = "skirt", n = 8, dot = true, body = K.black }: ChipOptions = {}): void {
  box(parent, body, w, h, d, x, y, z);
  if (dot) cyl(parent, K.dark, Math.min(w, d) * 0.07 + 0.15, 0.12, x - w / 2 + Math.min(w, d) * 0.2, y + h, z + d / 2 - Math.min(w, d) * 0.2, 10);
  if (leads === "dip") {
    const pitch = (w - 1.2) / (n - 1);
    for (let i = 0; i < n; i++) {
      const lx = x - w / 2 + 0.6 + i * pitch;
      box(parent, K.silver, 0.5, 0.5, 1.1, lx, y + 0.1, z + d / 2 + 0.45);
      box(parent, K.silver, 0.5, 0.5, 1.1, lx, y + 0.1, z - d / 2 - 0.45);
    }
  } else if (leads === "quad") {
    box(parent, K.silver, w + 1.2, 0.3, d - 1, x, y, z);
    box(parent, K.silver, w - 1, 0.3, d + 1.2, x, y, z);
  } else if (leads === "skirt") {
    box(parent, K.silver, w, 0.3, d + 1.2, x, y, z);
  }
}

// A surface-mount resistor / capacitor: tan or black body, silver end caps
export function smd(parent: THREE.Object3D, x: number, y: number, z: number, w = 1.6, d = 0.9, h = 0.5, material: Mat = K.smdBlack, axis: "x" | "z" = "x"): void {
  const alongX = axis === "x";
  box(parent, material, alongX ? w : d, h, alongX ? d : w, x, y, z);
  const cap = 0.3;
  const o = w / 2 - cap / 2;
  box(parent, K.silver, alongX ? cap : d, h + 0.05, alongX ? d : cap, x + (alongX ? o : 0), y, z + (alongX ? 0 : o));
  box(parent, K.silver, alongX ? cap : d, h + 0.05, alongX ? d : cap, x - (alongX ? o : 0), y, z - (alongX ? 0 : o));
}

// A row of small SMD parts, like the "sprinkles" around any real board: [x, z, axis?, material?]
export type Sprinkle = [number, number, ("x" | "z")?, Mat?];
export function sprinkles(parent: THREE.Object3D, y: number, spots: Sprinkle[]): void {
  for (const [x, z, axis, material] of spots) smd(parent, x, y, z, 1.7, 0.95, 0.5, material ?? K.smdTan, axis ?? "x");
}

// A can capacitor: coloured sleeve, silver top with a cross score, a pale stripe on one side
export function elCap(parent: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, color = 0x1d1d1f): void {
  cyl(parent, mat(`cap${color}`, color, { r: 0.45, m: 0.3 }), r, h, x, y, z, 18);
  cyl(parent, K.silver, r * 0.92, 0.2, x, y + h, z, 18);
  box(parent, K.silver, r * 1.4, 0.05, 0.25, x, y + h + 0.2, z);
  box(parent, K.silver, 0.25, 0.05, r * 1.4, x, y + h + 0.2, z);
  box(parent, mat("capStripe", 0xdad8cf, { r: 0.7, m: 0 }), 0.7, h * 0.85, 0.3, x - r * 0.97, y + h * 0.075, z, Math.PI / 2);
}

// A metal crystal can lying along x
export function crystal(parent: THREE.Object3D, x: number, y: number, z: number, len = 10, r = 2): void {
  cylH(parent, K.silver, r, len, x, y + r, z, "x", 14);
  box(parent, K.steel, len * 0.9, 0.2, r * 0.8, x, y + r * 2 - 0.05, z);
}

type UsbOptions = { dir?: number; len?: number; w?: number; h?: number; mouthW?: number; mouthH?: number };
// A USB-style port on the +/-x end: a metal shell with a dark mouth and a pale tongue. dir = -1 faces -x.
export function usbPort(parent: THREE.Object3D, x: number, y: number, z: number, { dir = -1, len = 16, w = 12, h = 11, mouthW = 8.4, mouthH = 7.4 }: UsbOptions = {}): void {
  box(parent, K.silver, len, h, w, x, y, z);
  box(parent, K.steel, len + 0.1, 0.3, w * 0.55, x, y + h - 0.2, z);
  const face = x + dir * (len / 2 + 0.05);
  box(parent, K.black, 0.5, mouthH, mouthW, face, y + (h - mouthH) / 2, z);
  box(parent, K.silk, 0.7, mouthH * 0.28, mouthW * 0.7, face + dir * 0.1, y + h / 2 - mouthH * 0.14, z);
}

// --- Animation helpers ---
export type Smooth = { v: number; to: number; rate: number; step(dt: number): number; snap(x: number): number };
// An eased value: set `.to`, call step(dt) every frame. Frame-rate independent.
export function smooth(value = 0, rate = 10): Smooth {
  const s: Smooth = {
    v: value,
    to: value,
    rate,
    step(dt) {
      s.v += (s.to - s.v) * (1 - Math.exp(-s.rate * Math.max(0, dt)));
      return s.v;
    },
    snap(x) {
      s.v = s.to = x;
      return x;
    },
  };
  return s;
}

const LIT = new THREE.Color();
type LedOptions = { w?: number; d?: number; h?: number; peak?: number };
// A small LED on a board that glows (emissive: the bloom pass catches it) when set(true). Smooth on/off.
export function statusLed(ctx: PartContext, parent: THREE.Object3D, x: number, y: number, z: number, color: number, { w = 1.8, d = 1, h = 0.7, peak = 2.4 }: LedOptions = {}) {
  const dim = new THREE.Color(color).multiplyScalar(0.28);
  const material = ctx.own(new THREE.MeshStandardMaterial({ color: dim, emissive: color, emissiveIntensity: 0, roughness: 0.35, metalness: 0 }));
  const mesh = box(parent, material, w, h, d, x, y, z);
  const level = smooth(0, 16);
  ctx.tick((_, dt) => {
    level.step(dt);
    material.emissiveIntensity = level.v * peak;
    material.color.copy(dim).lerp(LIT.set(color), level.v * 0.85);
  });
  return { mesh, set(on: boolean) { level.to = on ? 1 : 0; }, snap(on: boolean) { level.snap(on ? 1 : 0); } };
}

type RingsOptions = { x: number; y: number; z: number; r0?: number; r1?: number; rise?: number; color?: number; count?: number; period?: number; opacity?: number };
export type RingsTune = { period?: number; r1?: number; rise?: number };
// Expanding rings (sound / sonar waves) that rise from a point while set(true). tune() changes the pace
// (seconds per wave), the final radius and the height they climb, smoothly: the phase accumulates, so a new
// period never makes the rings jump.
export function pulseRings(ctx: PartContext, parent: THREE.Object3D, { x, y, z, r0 = 5, r1 = 12, rise = 18, color = 0x9fe8ff, count = 2, period = 1.5, opacity = 0.55 }: RingsOptions) {
  const gain = smooth(0, 6);
  const now = { period, r1, rise };
  const goal = { period, r1, rise };
  let clock = 0;
  const rings = Array.from({ length: count }, () => {
    const material = ctx.own(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(unit.annulus(0.86, 40), material);
    mesh.visible = false;
    mesh.raycast = () => {};
    mesh.userData.noBounds = true;
    parent.add(mesh);
    return { mesh, material };
  });
  ctx.tick((_, dt) => {
    gain.step(dt);
    const k = 1 - Math.exp(-5 * Math.max(0, dt));
    now.period += (goal.period - now.period) * k;
    now.r1 += (goal.r1 - now.r1) * k;
    now.rise += (goal.rise - now.rise) * k;
    clock += Math.max(0, dt) / Math.max(0.05, now.period);
    rings.forEach(({ mesh, material }, i) => {
      const phase = (clock + i / count) % 1;
      const a = gain.v * opacity * Math.pow(1 - phase, 1.4) * Math.min(1, phase * 8);
      mesh.visible = a > 0.004;
      if (!mesh.visible) return;
      const r = r0 + (now.r1 - r0) * phase;
      mesh.scale.set(r * 2, 1, r * 2);
      mesh.position.set(x, y + now.rise * phase, z);
      material.opacity = a;
    });
  });
  return {
    set(on: boolean) { gain.to = on ? 1 : 0; },
    tune(next: RingsTune) {
      goal.period = next.period ?? goal.period;
      goal.r1 = next.r1 ?? goal.r1;
      goal.rise = next.rise ?? goal.rise;
    },
  };
}

// A small floating label (a sprite, so it always faces the camera) with one or two short lines, for a live
// value such as "23 cm". show(null) hides it. `w` is its width in millimetres (it is twice as wide as tall).
type TagOptions = { x: number; y: number; z: number; w?: number; color?: string };
export function tag(ctx: PartContext, parent: THREE.Object3D, { x, y, z, w = 14, color = "#e9fbff" }: TagOptions) {
  const W = 256, H = 128; // fixed canvas: a texture cannot change size once it is on the GPU
  const surface = makeCanvas(W, H);
  const texture = surface ? ctx.own(new THREE.CanvasTexture(surface.canvas)) : null;
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  const material = ctx.own(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(w, w / 2, 1);
  sprite.position.set(x, y, z);
  sprite.visible = false;
  sprite.renderOrder = 20;
  sprite.raycast = () => {};
  sprite.userData.noBounds = true;
  parent.add(sprite);
  let shown = "";
  function show(lines: readonly string[] | null) {
    const list = lines?.filter((line) => line !== "").slice(0, 2) ?? [];
    sprite.visible = list.length > 0;
    const key = list.join("\n");
    if (!list.length || key === shown) return;
    shown = key;
    if (!surface || !texture) return;
    const { g } = surface;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(8, 12, 16, 0.86)";
    g.beginPath();
    g.roundRect(3, 3, W - 6, H - 6, 26);
    g.fill();
    g.strokeStyle = "rgba(255, 255, 255, 0.3)";
    g.lineWidth = 4;
    g.stroke();
    const size = list.length === 1 ? 70 : 46;
    g.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    list.forEach((line, i) => g.fillText(line, W / 2, (H / list.length) * (i + 0.5) + 3, W - 28));
    texture.needsUpdate = true;
  }
  return { show, sprite };
}

// --- Screens drawn on a canvas (no document in node tests or workers: the screen falls back to a flat colour) ---
function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  try {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    return g ? { canvas, g } : null;
  } catch {
    return null;
  }
}

type ScreenOptions = {
  w: number; d: number; x: number; y: number; z: number; cols: number; rows: number; px?: number; py?: number;
  fg: string; on: string; off: string; cell?: boolean; glow?: number; font?: string;
};
// A grid of text cells on a lit panel. `show(lines)` draws; null turns the panel off.
//   cols x rows cells; `fg` text, `on` panel colour, `off` panel colour when dark; `cell` draws a faint
//   box behind every character (the LCD look); `glow` blurs the text (the OLED look)
export function screen(ctx: PartContext, parent: THREE.Object3D, { w, d, x, y, z, cols, rows, px = 256, py = 128, fg, on, off, cell = false, glow = 0, font = "bold 20px ui-monospace, Menlo, Consolas, monospace" }: ScreenOptions) {
  const canvas = makeCanvas(px, py);
  const texture = canvas ? ctx.own(new THREE.CanvasTexture(canvas.canvas)) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  const material = ctx.own(new THREE.MeshBasicMaterial({ color: texture ? 0xffffff : off, map: texture, toneMapped: false }));
  const mesh = new THREE.Mesh(unit.plane(), material);
  mesh.scale.set(w, 1, d);
  mesh.position.set(x, y, z);
  mesh.raycast = () => {};
  parent.add(mesh);

  let shown: string | null | undefined = undefined;
  function draw(lines: string[] | null) {
    const key = lines ? lines.join("\n") : null;
    if (key === shown) return;
    shown = key;
    if (!canvas || !texture) {
      material.color.set(lines ? on : off);
      return;
    }
    const { g } = canvas;
    const cw = px / cols, ch = py / rows;
    g.fillStyle = lines ? on : off;
    g.fillRect(0, 0, px, py);
    if (lines && cell) {
      g.fillStyle = "rgba(0,0,0,0.13)";
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.fillRect(c * cw + 1.5, r * ch + 3, cw - 3, ch - 6);
    }
    if (lines) {
      g.font = font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = fg;
      if (glow) {
        g.shadowColor = fg;
        g.shadowBlur = glow;
      }
      lines.slice(0, rows).forEach((line, r) => {
        [...String(line).slice(0, cols)].forEach((chr, c) => g.fillText(chr, c * cw + cw / 2, r * ch + ch / 2 + 1));
      });
      g.shadowBlur = 0;
    }
    texture.needsUpdate = true;
  }
  draw(null);
  return { show: draw, mesh };
}

// Colour of a pin by what it carries (the catalog's kinds / accepts)
export function pinColor(pin: BoardPin | PartPin | undefined): number {
  const kinds: string[] = pin ? ("kinds" in pin ? pin.kinds : pin.accepts) : [];
  if (kinds.includes("gnd")) return 0x4b5058;
  if (kinds.some((k) => k === "5v" || k === "3v3" || k === "vin")) return 0xd9534f;
  if (kinds.includes("sda") || kinds.includes("scl")) return 0x4aa3ff;
  if (kinds.includes("analog") && !kinds.includes("digital")) return 0x57c785;
  if (kinds.includes("analog")) return 0xa9c96a;
  return 0xd9b24c;
}
