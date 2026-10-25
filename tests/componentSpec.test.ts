import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS, catalogSections, componentOf, isUserComponent, registerUserComponents } from "../src/models/lab/catalog.ts";
import { addPart, autoWire, checkDesign, emptyDesign, parseDesign, serializeDesign } from "../src/models/lab/circuit.ts";
import { ID_PREFIX, parseSpec, slugId, specToComponent, userEntryFor, validateSpec, type ComponentSpec } from "../src/models/lab/componentSpec.ts";
import { enclosureFor } from "../src/models/lab/enclosure.ts";
import { pinRole, suggestWires } from "../src/models/lab/guide.ts";
import { simulate } from "../src/models/lab/simulation.ts";
import { sketchFor } from "../src/models/lab/sketch.ts";

afterEach(() => registerUserComponents([]));

const mq2 = (): ComponentSpec => ({
  id: "usr-gas-mq-2",
  name: "Sensor de gas MQ-2",
  desc: "Detecta humo y gas.",
  category: "sensors",
  kind: "part",
  size: [32, 22, 27],
  sizeEstimated: true,
  volts: [4.5, 5.5],
  mA: 150,
  pins: [
    { id: "VCC", role: "power" },
    { id: "GND", role: "ground" },
    { id: "DOUT", role: "signal-in" },
    { id: "AOUT", role: "analog-in" },
  ],
  source: { name: "Hoja de datos", license: "CC-BY", url: "" },
});
const keys = (spec: ComponentSpec) => validateSpec(spec).issues.map((i) => `${i.level}:${i.key}`);
const withSpec = (patch: Partial<ComponentSpec>): ComponentSpec => ({ ...mq2(), ...patch });

test("a complete ficha is valid with no issues", () => {
  const check = validateSpec(mq2());
  assert.equal(check.ok, true);
  assert.deepEqual(check.issues, []);
});

test("sizes must be 1 to 300 mm", () => {
  assert.ok(keys(withSpec({ size: [0, 20, 20] })).includes("red:size"));
  assert.ok(keys(withSpec({ size: [20, 301, 20] })).includes("red:size"));
  assert.ok(keys(withSpec({ size: [20, 20, Number.NaN] })).includes("red:size"));
  assert.equal(validateSpec(withSpec({ size: [1, 300, 1] })).ok, true);
});

test("pin ids are unique and well formed", () => {
  const dup = withSpec({ pins: [...mq2().pins, { id: "VCC", role: "signal-in" }] });
  assert.ok(keys(dup).includes("red:pinDuplicate"));
  assert.ok(keys(withSpec({ pins: [{ id: "bad pin!", role: "ground" }] })).includes("red:pinId"));
  assert.ok(keys(withSpec({ pins: [] })).includes("red:noPins"));
});

test("a part needs a ground pin", () => {
  const noGround = withSpec({ pins: mq2().pins.filter((p) => p.role !== "ground") });
  assert.ok(keys(noGround).includes("red:noGround"));
});

test("the power pin and the volts go together", () => {
  const noVolts = withSpec({ volts: undefined });
  assert.ok(keys(noVolts).includes("red:voltsMissing"));
  assert.ok(keys(withSpec({ volts: [5.5, 4.5] })).includes("red:voltsOrder"));
  assert.ok(keys(withSpec({ volts: [0, 99] })).includes("red:volts"));
  // volts with no way to power the part is only a warning
  const noPower = withSpec({ pins: mq2().pins.filter((p) => p.role !== "power") });
  assert.ok(keys(noPower).includes("yellow:noPower"));
  // an LED-like part with no supply pin and no volts is fine
  assert.equal(validateSpec(withSpec({ volts: undefined, pins: [{ id: "SIG", role: "signal-out" }, { id: "GND", role: "ground" }] })).ok, true);
});

test("roles must be known and match the kind", () => {
  assert.ok(keys(withSpec({ pins: [{ id: "GND", role: "ground" }, { id: "X", role: "teleport" }] })).includes("red:pinRole"));
  assert.ok(keys(withSpec({ pins: [{ id: "GND", role: "board-gnd" }] })).includes("red:pinRole"));
});

test("the license: missing or non-commercial is a yellow personal-use warning", () => {
  const license = (l: string) => keys(withSpec({ source: { name: "x", license: l, url: "" } }));
  assert.ok(license("").includes("yellow:licenseMissing"));
  assert.ok(license("CC-BY-NC").includes("yellow:licensePersonal"));
  assert.ok(license("CC BY-NC-SA 4.0").includes("yellow:licensePersonal"));
  assert.ok(license("Non-Commercial").includes("yellow:licensePersonal"));
  assert.deepEqual(license("MIT"), []);
  assert.equal(validateSpec(withSpec({ source: { name: "", license: "", url: "" } })).ok, true, "yellow does not block saving");
});

test("ids: prefix, slug and no clash with the built-in parts", () => {
  assert.ok(keys(withSpec({ id: "led" })).includes("red:id"));
  assert.ok(keys(withSpec({ id: "usr-Bad Id" })).includes("red:id"));
  assert.equal(slugId("Sensor de Gás MQ-2"), "usr-sensor-de-gas-mq-2");
  assert.equal(slugId("   "), "usr-pieza");
  assert.equal(slugId("LED", ["usr-led"]), "usr-led-2");
  assert.ok(COMPONENTS.every((c) => !c.id.startsWith(ID_PREFIX)));
});

test("a board needs a logic level and ground", () => {
  const board: ComponentSpec = {
    ...mq2(), id: "usr-mi-placa", category: "boards", kind: "board", logic: 3.3, volts: undefined, size: [50, 20, 8],
    pins: [{ id: "V5", role: "board-5v" }, { id: "G", role: "board-gnd" }, { id: "P1", role: "board-pwm" }, { id: "P2", role: "board-analog" }],
  };
  assert.equal(validateSpec(board).ok, true);
  assert.ok(keys({ ...board, logic: undefined }).includes("red:logic"));
  assert.ok(keys({ ...board, category: "sensors" }).includes("red:kindCategory"));
  const c = specToComponent(board);
  assert.equal(c.kind, "board");
  if (c.kind === "board") {
    assert.deepEqual(c.pins.find((p) => p.id === "P1")?.kinds, ["digital", "pwm"]);
    assert.equal(c.holes.length, 4, "default mounting holes");
    assert.equal(c.logic, 3.3);
  }
});

test("specToComponent maps roles to what each pin accepts", () => {
  const c = specToComponent(mq2());
  assert.equal(c.kind, "part");
  const acc = (id: string) => c.pins.find((p) => p.id === id);
  assert.deepEqual(acc("VCC"), { id: "VCC", accepts: ["5v"], required: true });
  assert.deepEqual(acc("GND")?.accepts, ["gnd"]);
  assert.deepEqual(acc("DOUT")?.accepts, ["digital"]);
  assert.deepEqual(acc("AOUT")?.accepts, ["analog"]);
  // a 3.3 V part takes the 3.3 V rail; a wide one takes both
  assert.deepEqual(specToComponent(withSpec({ volts: [3, 3.6] })).pins[0], { id: "VCC", accepts: ["3v3"], required: true });
  assert.deepEqual(specToComponent(withSpec({ volts: [3.3, 5] })).pins[0], { id: "VCC", accepts: ["5v", "3v3"], required: true });
  // i2c pins mark the bus; an optional pin is not required; explicit accepts win
  const i2c = specToComponent(withSpec({ pins: [{ id: "SDA", role: "sda" }, { id: "SCL", role: "scl" }, { id: "NC", role: "signal-in", optional: true, accepts: ["pwm"] }, { id: "GND", role: "ground" }] }));
  assert.equal(i2c.kind === "part" && i2c.bus, "i2c");
  assert.deepEqual(i2c.pins.find((p) => p.id === "NC"), { id: "NC", accepts: ["pwm"], required: false });
});

test("parseSpec cleans anything, never throws, and leaves problems for the validator", () => {
  for (const raw of [null, undefined, 3, "x", [], {}, { pins: "no", size: "big", volts: 5 }]) {
    const spec = parseSpec(raw);
    assert.equal(typeof spec.name, "string");
    assert.equal(validateSpec(spec).ok, false, "an empty ficha is not saveable");
  }
  const spec = parseSpec({ name: "  Sensor  ", size: ["30", 20, 10], volts: ["3.3", 5], mA: "12", pins: [{ id: "A 1!", role: "signal-in", kinds: ["digital", "nope"] }, null, 7], category: "bogus" });
  assert.equal(spec.name, "Sensor");
  assert.deepEqual(spec.size, [30, 20, 10]);
  assert.deepEqual(spec.volts, [3.3, 5]);
  assert.equal(spec.mA, 12);
  assert.equal(spec.pins.length, 1);
  assert.equal(spec.pins[0].id, "A1");
  assert.equal(spec.category, "sensors");
  assert.ok(spec.id.startsWith("usr-"));
  // a round trip through JSON gives the same ficha
  assert.deepEqual(parseSpec(JSON.parse(JSON.stringify(mq2()))), mq2());
});

test("registering user components: componentOf and catalogSections see them, built-ins stay", () => {
  assert.equal(componentOf("usr-gas-mq-2"), null);
  registerUserComponents([userEntryFor(mq2())]);
  assert.equal(componentOf("usr-gas-mq-2")?.id, "usr-gas-mq-2");
  assert.equal(isUserComponent("usr-gas-mq-2"), true);
  assert.equal(isUserComponent("led"), false);
  assert.equal(componentOf("led")?.id, "led");
  const builtIn = COMPONENTS.length;
  const sensors = catalogSections().find((s) => s.category === "sensors")!;
  assert.ok(sensors.items.some((c) => c.id === "usr-gas-mq-2"));
  assert.equal(catalogSections("mq-2").flatMap((s) => s.items).length, 1);
  assert.equal(COMPONENTS.length, builtIn, "COMPONENTS is untouched");
  // a user entry cannot take over a built-in id
  registerUserComponents([userEntryFor(withSpec({ id: "led" }))]);
  assert.equal(componentOf("led")?.kind, "part");
  assert.equal(isUserComponent("led"), false);
  registerUserComponents([]);
  assert.equal(componentOf("usr-gas-mq-2"), null);
});

test("an imported part wires, is understood by the guide, simulates, boxes and gets a sketch", () => {
  registerUserComponents([userEntryFor(mq2())]);
  let design = addPart(emptyDesign(), "arduino-uno", { x: 0, z: 0 }).design;
  const added = addPart(design, "usr-gas-mq-2", { x: 10, z: 0 });
  assert.ok(added.id);
  design = autoWire(added.design, added.id!).design;
  const id = added.id!;

  // wiring + checker: supply, ground, a digital pin and an analog pin all reach the board
  assert.equal(design.wires.length, 4);
  assert.deepEqual(checkDesign(design).issues, []);
  const wired = Object.fromEntries(design.wires.map((w) => [w.from.part === id ? w.from.pin : w.to.pin, w.from.part === id ? w.to.pin : w.from.pin]));
  assert.equal(wired.VCC, "5V");
  assert.equal(wired.GND, "GND");
  assert.ok(/^A\d$/.test(wired.AOUT));

  // guide
  assert.equal(pinRole("usr-gas-mq-2", "VCC"), "power");
  assert.equal(pinRole("usr-gas-mq-2", "GND"), "ground");
  assert.equal(pinRole("usr-gas-mq-2", "DOUT"), "signal-in", "the role the person set, not a guess from the pin kind");
  assert.equal(pinRole("usr-gas-mq-2", "AOUT"), "analog-in");
  assert.equal(pinRole("usr-gas-mq-2", "NOPE"), null);
  assert.equal(suggestWires(addPart(addPart(emptyDesign(), "arduino-uno").design, "usr-gas-mq-2").design).length, 4);

  // simulation: alive is "generic"; unwired it is dead
  const sim = simulate(design, 1000).parts[id];
  assert.deepEqual(sim, { kind: "generic", on: true });
  const lone = addPart(design, "usr-gas-mq-2", { x: 20, z: 0 });
  const dead = simulate(lone.design, 1000).parts[lone.id!];
  assert.equal(dead.dead, true);
  assert.equal(dead.kind, "generic");

  // enclosure uses its size and does not throw
  const box = enclosureFor(design);
  assert.equal(box.ok, true);

  // sketch: named pins and a placeholder, no invented behavior
  const sketch = sketchFor(design);
  assert.equal(sketch.ok, true);
  assert.match(sketch.code, /const int GAS_MQ_2_1_DOUT = /);
  assert.match(sketch.code, /const int GAS_MQ_2_1_AOUT = A\d;/);
  assert.match(sketch.code, /Sensor de gas MQ-2 1: pieza importada/);
  assert.doesNotMatch(sketch.code, /GAS_MQ_2_1_VCC/);
});

test("a saved bench with an imported part loads only when the part is registered", () => {
  registerUserComponents([userEntryFor(mq2())]);
  const text = serializeDesign(autoWire(addPart(addPart(emptyDesign(), "arduino-uno").design, "usr-gas-mq-2").design, "usr-gas-mq-2-1").design);
  assert.equal(parseDesign(text).design.parts.length, 2);
  registerUserComponents([]);
  assert.equal(parseDesign(text).design.parts.length, 1, "unknown parts are dropped, not thrown");
});

test("unknown types never throw in guide, simulation, sketch or enclosure", () => {
  const design = { version: 1 as const, parts: [{ id: "ghost-1", type: "ghost", x: 0, z: 0, rot: 0 }], wires: [] };
  assert.equal(pinRole("ghost", "A"), null);
  assert.doesNotThrow(() => simulate(design, 0));
  assert.doesNotThrow(() => sketchFor(design));
  assert.doesNotThrow(() => enclosureFor(design));
});
