import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildPart, PART_TYPES } from "../src/views/scene/lab/parts/index.ts";
import { COMPONENTS, componentOf } from "../src/models/lab/catalog.ts";
import { pinSpots } from "../src/models/lab/layout.ts";

const STATES: Record<string, Record<string, unknown>> = {
  led: { kind: "led", on: true },
  "servo-sg90": { kind: "servo", angle: 30 },
  "hc-sr04": { kind: "distance", cm: 20 },
  pir: { kind: "motion", detected: true },
  dht22: { kind: "climate", c: 24, h: 50 },
  soil: { kind: "soil", percent: 80 },
  ldr: { kind: "light", percent: 90 },
  buzzer: { kind: "buzzer", on: true },
  relay: { kind: "relay", on: true },
  "oled-128x64": { kind: "display", lines: ["Dist: 23 cm", "Servo: 40"] },
  "lcd-1602-i2c": { kind: "display", lines: ["Temp: 24.5 C", "Hum: 51 %"] },
  button: { kind: "button", pressed: true },
  potentiometer: { kind: "knob", percent: 85 },
  l298n: { kind: "motors", speed: 200 },
  "battery-aa4": { kind: "battery", on: true },
};
const stateOf = (type: string) => STATES[type] ?? { kind: "board", running: true };

const run = (part: ReturnType<typeof buildPart>, steps = 40, dt = 0.05) => {
  for (let i = 0; i < steps; i++) part.update(i * dt, dt);
};
const meshes = (root: THREE.Object3D) => {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) found.push(o);
  });
  return found;
};
// Materials that are not shared with other parts: the ones a part animates
const ownMaterial = (part: ReturnType<typeof buildPart>, test: (m: THREE.MeshStandardMaterial) => boolean) =>
  meshes(part.body).map((m) => m.material).find((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial && test(m));
const groupChild = (part: ReturnType<typeof buildPart>) => part.body.children.find((c): c is THREE.Group => c.type === "Group")!;

test("there is a model for every catalog part", () => {
  assert.equal(COMPONENTS.length, 20);
  assert.deepEqual([...PART_TYPES].sort(), COMPONENTS.map((c) => c.id).sort());
});

test("buildPart rejects an unknown type", () => {
  assert.throws(() => buildPart("flux-capacitor"), /unknown part/);
});

for (const { id } of COMPONENTS) {
  test(`${id}: pins sit at pinSpots and picks are set`, () => {
    const part = buildPart(id);
    assert.ok(part.group instanceof THREE.Group);
    assert.deepEqual(part.group.userData.pick, { type: "part" });
    assert.deepEqual(part.body.userData.pick, { type: "part" });
    const spots = pinSpots({ type: id, x: 0, z: 0, rot: 0 });
    assert.equal(part.pins.size, componentOf(id)!.pins.length);
    for (const spot of spots) {
      const pin = part.pins.get(spot.pin);
      assert.ok(pin, `pin ${spot.pin}`);
      assert.deepEqual(pin.userData.pick, { type: "pin", pin: spot.pin });
      assert.ok(Math.abs(pin.position.x - spot.x) < 0.01 && Math.abs(pin.position.y - spot.y) < 0.01 && Math.abs(pin.position.z - spot.z) < 0.01, `${id} ${spot.pin} position`);
      assert.equal(pin.parent, part.group);
    }
    part.dispose();
  });

  test(`${id}: sits on the floor and stays near its catalog size`, () => {
    const part = buildPart(id);
    const box = new THREE.Box3();
    part.group.updateMatrixWorld(true);
    for (const m of meshes(part.body)) if (!m.userData.noBounds) box.union(new THREE.Box3().setFromObject(m));
    const [w, d, h] = componentOf(id)!.size.map((v) => v * 0.1);
    assert.ok(box.min.y > -0.01, "nothing below the floor");
    assert.ok(box.max.y > h * 0.5 && box.max.y < h * 3.5, `height ${box.max.y} vs ${h}`);
    assert.ok(box.max.x - box.min.x > w * 0.8 && box.max.x - box.min.x < w * 1.5, "width");
    assert.ok(box.max.z - box.min.z > d * 0.8 && box.max.z - box.min.z < d * 2.2, "depth");
    part.dispose();
  });

  test(`${id}: setSim, setLevel, setSelected, setHover, update and dispose do not throw`, () => {
    const part = buildPart(id);
    const first = [...part.pins.keys()][0];
    part.setSim(stateOf(id));
    part.setSim({ kind: "x", dead: true });
    part.setSim(null);
    part.setSim(undefined);
    part.setSim("garbage");
    part.setSim({ kind: "x", lines: 5, percent: "no" });
    part.setSim(stateOf(id));
    for (const level of ["red", "yellow", "green", undefined, "nope"]) {
      part.setLevel(level);
      part.update(1, 0.016);
    }
    part.setSelected(true);
    part.setSelected(false);
    part.setHover(first);
    part.setHover("NOPE");
    part.setHover(null);
    run(part, 20);
    part.update(0, 0);
    part.dispose();
    part.update(1, 0.016); // after dispose: harmless
  });

  test(`${id}: a dead part shows nothing alive`, () => {
    const part = buildPart(id);
    const emissive = () => {
      let peak = 0;
      for (const m of meshes(part.body)) {
        const material = m.material;
        if (material instanceof THREE.MeshStandardMaterial && m.visible) peak = Math.max(peak, material.emissive.getHex() === 0 ? 0 : material.emissiveIntensity);
        if (material instanceof THREE.MeshBasicMaterial && material.blending === THREE.AdditiveBlending && m.visible) peak = Math.max(peak, material.opacity * 10);
      }
      return peak;
    };
    part.setSim(stateOf(id));
    run(part, 60);
    part.setSim({ kind: "x", dead: true });
    run(part, 80);
    const dead = emissive();
    assert.ok(dead <= 0.12, `${id} still glows at ${dead}`);
    part.dispose();
  });
}

test("dispose frees what a part created but not the shared geometry and materials", () => {
  const a = buildPart("led");
  const b = buildPart("led");
  const shared = meshes(b.body).find((m) => !m.userData.noBounds)!;
  const own = ownMaterial(a, (m) => m.transparent)!;
  let freed = 0;
  own.addEventListener("dispose", () => freed++);
  let sharedFreed = 0;
  shared.geometry.addEventListener("dispose", () => sharedFreed++);
  a.dispose();
  assert.equal(freed, 1);
  assert.equal(sharedFreed, 0);
  assert.ok(meshes(b.body).length > 0);
  b.dispose();
});

test("the display shows nothing without a document and does not throw", () => {
  const part = buildPart("oled-128x64");
  part.setSim({ kind: "display", lines: ["hola", "mundo"] });
  part.setSim({ kind: "display", lines: ["solo uno"] });
  part.setSim({ kind: "display" });
  run(part, 5);
  part.dispose();
});

test("glow shows for red and amber only, and fades out for green", () => {
  const part = buildPart("arduino-uno");
  const glowRoot = () => part.group.children.find((c) => c.name === "level-glow");
  part.update(0, 0.016);
  assert.equal(glowRoot(), undefined);
  part.setLevel("red");
  assert.equal(glowRoot()!.visible, true);
  part.setLevel("green");
  run(part, 60);
  assert.equal(glowRoot()!.visible, false);
  part.setLevel("yellow");
  assert.equal(glowRoot()!.visible, true);
  part.dispose();
});

test("the selection ring appears and disappears", () => {
  const part = buildPart("led");
  const ring = () => part.group.children.find((c) => c.name === "selection-ring");
  assert.equal(ring(), undefined);
  part.setSelected(true);
  part.update(0, 0.016);
  assert.equal(ring()!.visible, true);
  part.setSelected(false);
  run(part, 40);
  assert.equal(ring()!.visible, false);
  part.dispose();
});

test("hover enlarges only the hovered pin", () => {
  const part = buildPart("hc-sr04");
  const tip = (id: string) => part.pins.get(id)!.children.find((c) => c instanceof THREE.Mesh && c.geometry.type === "SphereGeometry" && c.material instanceof THREE.MeshStandardMaterial)!;
  const rest = tip("TRIG").scale.x;
  part.setHover("TRIG");
  run(part, 30);
  assert.ok(tip("TRIG").scale.x > rest * 2);
  assert.ok(Math.abs(tip("ECHO").scale.x - rest) < 1e-6);
  part.setHover(null);
  run(part, 60);
  assert.ok(Math.abs(tip("TRIG").scale.x - rest) < 0.01);
  part.dispose();
});

test("the servo horn follows the angle with easing", () => {
  const part = buildPart("servo-sg90");
  const horn = groupChild(part);
  part.update(0, 0.016);
  assert.ok(Math.abs(horn.rotation.y + Math.PI / 2) < 1e-6, "rests in the middle (90 degrees)");
  part.setSim({ kind: "servo", angle: 0 });
  part.update(0.1, 0.05);
  assert.ok(horn.rotation.y < 0 && horn.rotation.y > -Math.PI / 2, "moving, not jumping");
  run(part, 100);
  assert.ok(Math.abs(horn.rotation.y) < 0.01);
  part.setSim({ kind: "servo", angle: 180 });
  run(part, 100);
  assert.ok(Math.abs(horn.rotation.y + Math.PI) < 0.01);
  part.setSim(null);
  run(part, 100);
  assert.ok(Math.abs(horn.rotation.y + Math.PI / 2) < 0.01);
  part.dispose();
});

test("the LED glows when on and is dim at rest or dead", () => {
  const part = buildPart("led");
  const shell = ownMaterial(part, (m) => m.transparent && m.opacity > 0.5)!;
  const level = () => {
    run(part);
    return shell.emissiveIntensity;
  };
  assert.ok(level() < 0.1);
  part.setSim({ kind: "led", on: true });
  assert.ok(level() > 2);
  part.setSim({ kind: "led", dead: true });
  assert.ok(level() < 0.1);
  part.dispose();
});

test("a running board lights its power LED and a stopped one does not", () => {
  const part = buildPart("arduino-uno");
  const lit = () => {
    run(part, 40);
    return meshes(part.body).some((m) => m.material instanceof THREE.MeshStandardMaterial && m.material.emissiveIntensity > 1);
  };
  assert.equal(lit(), false);
  part.setSim({ kind: "board", running: true });
  assert.equal(lit(), true);
  part.setSim({ kind: "board", running: false });
  assert.equal(lit(), false);
  part.dispose();
});

test("the button cap goes down when pressed", () => {
  const part = buildPart("button");
  const cap = groupChild(part);
  part.setSim({ kind: "button", pressed: true });
  run(part, 20);
  assert.ok(cap.position.y < -1);
  part.setSim(null);
  run(part, 20);
  assert.ok(Math.abs(cap.position.y) < 0.01);
  part.dispose();
});

test("the knob turns with percent", () => {
  const part = buildPart("potentiometer");
  const knob = groupChild(part);
  const at = (percent: number) => {
    part.setSim({ kind: "knob", percent });
    run(part, 80);
    return knob.rotation.y;
  };
  assert.ok(Math.abs(at(50)) < 0.01);
  assert.ok(at(100) < -2);
  assert.ok(at(0) > 2);
  part.dispose();
});

test("dispose removes the part from its parent", () => {
  const parent = new THREE.Group();
  const part = buildPart("pico");
  parent.add(part.group);
  part.dispose();
  assert.equal(parent.children.length, 0);
});

const sprites = (root: THREE.Object3D) => {
  const found: THREE.Sprite[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Sprite) found.push(o);
  });
  return found;
};
// The sonar rings: wrap-arounds (a new wave starts) and the widest ring seen while running
const sonar = (cm: number) => {
  const part = buildPart("hc-sr04");
  const rings = meshes(part.body).filter((m) => m.material instanceof THREE.MeshBasicMaterial && m.material.blending === THREE.AdditiveBlending);
  part.setSim({ kind: "distance", cm });
  let starts = 0;
  let widest = 0;
  let last = Infinity;
  for (let i = 0; i < 400; i++) {
    part.update(i * 0.02, 0.02);
    const y = rings[0].position.y;
    if (i > 100 && y < last - 1) starts++;
    last = y;
    if (i > 100) for (const ring of rings) if (ring.visible) widest = Math.max(widest, ring.scale.x);
  }
  part.dispose();
  return { starts, widest };
};

test("the sonar waves are faster and smaller for something close than for something far", () => {
  const near = sonar(8);
  const far = sonar(120);
  assert.ok(near.starts > far.starts, `waves: near ${near.starts}, far ${far.starts}`);
  assert.ok(far.widest > near.widest, `size: near ${near.widest}, far ${far.widest}`);
});

test("the distance sensor and the climate sensor float a value label while they run", () => {
  for (const [type, state] of [["hc-sr04", { kind: "distance", cm: 23 }], ["dht22", { kind: "climate", c: 24.5, h: 51 }]] as const) {
    const part = buildPart(type);
    const label = sprites(part.body);
    assert.equal(label.length, 1, type);
    assert.equal(label[0].visible, false, `${type} is quiet at rest`);
    part.setSim(state);
    assert.equal(label[0].visible, true, type);
    part.setSim({ kind: "x", dead: true });
    assert.equal(label[0].visible, false, `${type} dead`);
    part.dispose();
  }
});

test("the motor driver's rotors spin with the speed and stop when it is zero or dead", () => {
  const part = buildPart("l298n");
  const turned = (state: Record<string, unknown> | null) => {
    part.setSim(state);
    const rotors = part.body.children.filter((c): c is THREE.Group => c.type === "Group");
    const before = rotors.map((r) => r.rotation.y);
    run(part, 20);
    return rotors.map((r, i) => Math.abs(r.rotation.y - before[i]));
  };
  assert.ok(turned({ kind: "motors", speed: 1 }).every((v) => v > 15));
  const slow = turned({ kind: "motors", speed: 0.25 });
  assert.ok(slow.every((v) => v > 0.5 && v < 8), JSON.stringify(slow));
  assert.ok(turned({ kind: "motors", speed: 0 }).every((v) => v === 0));
  assert.ok(turned({ kind: "x", dead: true }).every((v) => v === 0));
  part.dispose();
});

// --- Imported parts (custom.ts) ---
import { registerUserComponents } from "../src/models/lab/catalog.ts";
import { userEntryFor, type ComponentSpec } from "../src/models/lab/componentSpec.ts";
import { coverFit } from "../src/views/scene/lab/parts/custom.ts";

const imported = (patch: Partial<ComponentSpec> = {}): ComponentSpec => ({
  id: "usr-prueba", name: "Prueba", desc: "", category: "sensors", kind: "part", size: [30, 20, 12], volts: [4.5, 5.5], mA: 10,
  pins: [{ id: "VCC", role: "power" }, { id: "SIG", role: "signal-in" }, { id: "GND", role: "ground" }],
  source: { name: "x", license: "MIT", url: "" }, ...patch,
});

for (const [label, patch] of [
  ["sensor", {}],
  ["display", { category: "displays", size: [40, 25, 5] }],
  ["input", { category: "inputs", size: [15, 15, 18] }],
  ["power", { category: "power", size: [60, 40, 20] }],
  ["board", { category: "boards", kind: "board", logic: 3.3, volts: undefined, size: [50, 25, 8], pins: [{ id: "V5", role: "board-5v" }, { id: "G", role: "board-gnd" }, { id: "P1", role: "board-digital" }] }],
] as [string, Partial<ComponentSpec>][]) {
  test(`imported ${label}: pins at pinSpots, picks set, sim and dispose do not throw (with and without a photo)`, () => {
    const spec = imported(patch);
    registerUserComponents([userEntryFor(spec)]);
    try {
      for (const photo of [undefined, "data:image/png;base64,AAAA"]) {
        const part = buildPart(spec.id, photo);
        assert.deepEqual(part.group.userData.pick, { type: "part" });
        const spots = pinSpots({ type: spec.id, x: 0, z: 0, rot: 0 });
        assert.equal(part.pins.size, spec.pins.length);
        for (const spot of spots) {
          const pin = part.pins.get(spot.pin)!;
          assert.deepEqual(pin.userData.pick, { type: "pin", pin: spot.pin });
          assert.ok(Math.abs(pin.position.x - spot.x) < 0.01 && Math.abs(pin.position.z - spot.z) < 0.01);
        }
        assert.equal(meshes(part.body).some((m) => m.name === "photo"), !!photo, "the photo plane exists only with a photo");
        part.setSim({ kind: "generic", on: true });
        part.update(1, 0.016);
        part.setSim({ kind: "generic", dead: true });
        part.setSim(null);
        part.setLevel("red");
        part.setHover("nope");
        part.dispose();
        assert.doesNotThrow(() => part.update(2, 0.016));
        part.dispose();
      }
    } finally {
      registerUserComponents([]);
    }
  });
}

test("imported part: the photo saved with the part is used when none is passed", () => {
  registerUserComponents([userEntryFor(imported(), "data:image/png;base64,AAAA")]);
  try {
    const part = buildPart("usr-prueba");
    assert.ok(meshes(part.body).some((m) => m.name === "photo"));
    part.dispose();
  } finally {
    registerUserComponents([]);
  }
  assert.throws(() => buildPart("usr-prueba"), /unknown part/, "gone once unregistered");
});

test("imported part: stays near its ficha size", () => {
  const spec = imported({ size: [40, 30, 10] });
  registerUserComponents([userEntryFor(spec)]);
  try {
    const part = buildPart(spec.id);
    const box = new THREE.Box3();
    part.group.updateMatrixWorld(true);
    for (const m of meshes(part.body)) if (!m.userData.noBounds) box.union(new THREE.Box3().setFromObject(m));
    assert.ok(box.min.y > -0.01);
    assert.ok(box.max.x - box.min.x > 3.2 && box.max.x - box.min.x < 6, "width ~4 units");
    assert.ok(box.max.z - box.min.z > 2.4 && box.max.z - box.min.z < 4.5, "depth ~3 units");
    part.dispose();
  } finally {
    registerUserComponents([]);
  }
});

test("coverFit crops the long side and keeps the plane filled", () => {
  assert.deepEqual(coverFit(2, 1), { repeat: [0.5, 1], offset: [0.25, 0] });
  assert.deepEqual(coverFit(0.5, 1), { repeat: [1, 0.5], offset: [0, 0.25] });
  assert.deepEqual(coverFit(1, 1), { repeat: [1, 1], offset: [0, 0] });
  assert.deepEqual(coverFit(0, 1), { repeat: [1, 1], offset: [0, 0] });
});
