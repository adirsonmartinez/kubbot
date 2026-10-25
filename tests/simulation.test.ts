import test from "node:test";
import assert from "node:assert/strict";
import { addPart, autoWire, connect, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { wireKind } from "../src/models/lab/layout.ts";
import { COMPONENTS } from "../src/models/lab/catalog.ts";
import { NEAR_CM, SIM_KINDS, deadParts, simulate, worldAt, type SimState } from "../src/models/lab/simulation.ts";

// A board plus parts, each one auto-wired in turn; returns the design and the ids in order
function benchMany(board: string, ...types: string[]) {
  let design = addPart(emptyDesign(), board, { x: 0, z: 0 }).design;
  const ids: string[] = [];
  types.forEach((type, i) => {
    const r = addPart(design, type, { x: 8 * (i + 1), z: 0 });
    design = autoWire(r.design, r.id!).design;
    ids.push(r.id!);
  });
  return { design, ids };
}
const bench = (board: string, type: string) => benchMany(board, type);
const at = (d: Design, id: string, t: number): SimState => simulate(d, t).parts[id];
// Narrow a state to a kind, failing the test when it is something else
function as<K extends SimState["kind"]>(state: SimState, kind: K): Extract<SimState, { kind: K }> {
  assert.equal(state.kind, kind);
  assert.ok(!state.dead, `${kind} is alive`);
  return state as Extract<SimState, { kind: K }>;
}
const wireOf = (d: Design, pred: (kind: string) => boolean) => d.wires.find((w) => pred(wireKind(d, w)))!;

// A part wired by hand: signal and ground to the board, the power pin to the given board pin
function hand(type: string, pins: Record<string, string>, board = "arduino-uno") {
  let d = addPart(emptyDesign(), board).design;
  const r = addPart(d, type, { x: 8 });
  d = r.design;
  for (const [pin, boardPin] of Object.entries(pins)) d = connect(d, { part: r.id!, pin }, { part: `${board}-1`, pin: boardPin }).design;
  return { design: d, id: r.id! };
}

test("simulate returns { parts, wires } with the right shapes", () => {
  const { design } = bench("arduino-uno", "led");
  const result = simulate(design, 0);
  for (const id of Object.keys(result.parts)) assert.ok(result.parts[id].kind, `part ${id} has kind`);
  for (const id of Object.keys(result.wires)) assert.equal(typeof result.wires[id], "number");
  assert.deepEqual(Object.keys(result.parts).sort(), design.parts.map((p) => p.id).sort());
  assert.deepEqual(Object.keys(result.wires).sort(), design.wires.map((w) => w.id).sort());
  assert.equal(SIM_KINDS.led, "led");
  assert.equal(SIM_KINDS.distance, "distance");
});

test("every catalog part has a state of its own kind when wired (nothing falls through)", () => {
  for (const c of COMPONENTS.filter((c) => c.kind === "part" && c.id !== "resistor-220")) {
    const { design, ids } = bench("arduino-uno", c.id);
    const state = at(design, ids[0], 1234);
    assert.ok(!state.dead, `${c.id} alive`);
    assert.notEqual(state.kind, "unknown", c.id);
  }
});

test("determinism: same design and time give identical results, even through the cache", () => {
  const { design } = benchMany("arduino-uno", "hc-sr04", "servo-sg90", "led", "oled-128x64");
  assert.deepEqual(simulate(design, 12345), simulate(design, 12345));
  const copy = JSON.parse(JSON.stringify(design)) as Design;
  assert.deepEqual(simulate(copy, 777), simulate(design, 777));
});

test("determinism: the distance changes with time and repeats every 6 s", () => {
  const { design, ids } = bench("arduino-uno", "hc-sr04");
  const at0 = as(at(design, ids[0], 0), "distance").cm;
  const at3 = as(at(design, ids[0], 3000), "distance").cm;
  const at6 = as(at(design, ids[0], 6000), "distance").cm;
  assert.ok(at0 >= 5 && at0 <= 60 && at3 >= 5 && at3 <= 60);
  assert.notEqual(at0, at3);
  assert.equal(at0, at6);
  assert.equal(as(at(design, ids[0], 1500), "distance").cm, 60);
  assert.equal(as(at(design, ids[0], 4500), "distance").cm, 5);
});

test("the world is a pure function of the time, negative times included", () => {
  assert.deepEqual(worldAt(5000), worldAt(5000));
  const w = worldAt(-1000);
  assert.ok(w.distanceCm >= 5 && w.distanceCm <= 60 && w.knob >= 0 && w.knob <= 100);
  assert.equal(worldAt(-1).pressed, false, "negative time wraps instead of staying pressed");
  assert.equal(worldAt(-2900).pressed, true);
  assert.equal(worldAt(-1).motion, worldAt(6999).motion);
});

test("LED blinks at 1 Hz when nothing controls it", () => {
  const { design, ids } = bench("arduino-uno", "led");
  const on = (t: number) => as(at(design, ids[0], t), "led").on;
  assert.deepEqual([0, 250, 500, 750, 1000].map(on), [true, true, false, false, true]);
  assert.equal(on(-250), false, "negative time wraps: -250 ms is 750 ms into the period");
});

test("LED follows the distance sensor and turns on under 20 cm only", () => {
  const { design, ids } = benchMany("arduino-uno", "hc-sr04", "led");
  assert.equal(as(at(design, ids[1], 4500), "led").on, true, "5 cm");
  assert.equal(as(at(design, ids[1], 0), "led").on, false, "32 cm: off, not blinking");
  for (let t = 0; t < 6000; t += 250) {
    assert.equal(as(at(design, ids[1], t), "led").on, worldAt(t).distanceCm < NEAR_CM, `t=${t}`);
  }
});

test("a button or a PIR is also something the LED reacts to", () => {
  const withButton = benchMany("arduino-uno", "button", "led");
  assert.equal(as(at(withButton.design, withButton.ids[1], 100), "led").on, true, "pressed");
  assert.equal(as(at(withButton.design, withButton.ids[1], 1000), "led").on, false, "released");
  const withPir = benchMany("arduino-uno", "pir", "led");
  assert.equal(as(at(withPir.design, withPir.ids[1], 500), "led").on, true, "movement");
  assert.equal(as(at(withPir.design, withPir.ids[1], 3000), "led").on, false, "calm");
});

test("buzzer and relay: on when close, off when far; they pulse by themselves with no sensor", () => {
  const { design, ids } = benchMany("arduino-uno", "hc-sr04", "buzzer", "relay");
  assert.equal(as(at(design, ids[1], 5000), "buzzer").on, true);
  assert.equal(as(at(design, ids[2], 5000), "relay").on, true);
  assert.equal(as(at(design, ids[1], 0), "buzzer").on, false);
  assert.equal(as(at(design, ids[2], 0), "relay").on, false);
  const alone = benchMany("arduino-uno", "buzzer", "relay");
  assert.equal(as(at(alone.design, alone.ids[0], 50), "buzzer").on, true);
  assert.equal(as(at(alone.design, alone.ids[0], 500), "buzzer").on, false);
  assert.equal(as(at(alone.design, alone.ids[1], 500), "relay").on, true);
  assert.equal(as(at(alone.design, alone.ids[1], 1500), "relay").on, false);
});

test("servo follows the distance: 5 cm is 0 degrees, 60 cm is 180", () => {
  const { design, ids } = benchMany("arduino-uno", "hc-sr04", "servo-sg90");
  assert.ok(as(at(design, ids[1], 1500), "servo").angle >= 179.9);
  assert.ok(as(at(design, ids[1], 4500), "servo").angle <= 0.1);
  const mid = as(at(design, ids[1], 0), "servo").angle;
  assert.ok(mid > 80 && mid < 100, `mid ${mid}`);
});

test("servo sweeps 0 to 180 and back in 4 s when there is no sensor", () => {
  const { design, ids } = bench("arduino-uno", "servo-sg90");
  const angle = (t: number) => Math.round(as(at(design, ids[0], t), "servo").angle);
  assert.deepEqual([0, 2000, 4000, 1000].map(angle), [0, 180, 0, 90]);
});

test("a part that is not wired is dead; so is one with a missing pin", () => {
  let d = addPart(emptyDesign(), "arduino-uno").design;
  const r = addPart(d, "led", { x: 8 });
  assert.deepEqual(simulate(r.design, 1000).parts[r.id!], { kind: "led", dead: true });
  d = connect(r.design, { part: r.id!, pin: "SIG" }, { part: "arduino-uno-1", pin: "D13" }).design;
  assert.equal(simulate(d, 1000).parts[r.id!].dead, true, "GND is missing");
  d = connect(d, { part: r.id!, pin: "GND" }, { part: "arduino-uno-1", pin: "GND" }).design;
  assert.equal(simulate(d, 1000).parts[r.id!].dead, undefined, "now it works");
});

test("a part wired only to other parts, never to a board, is dead", () => {
  let d = addPart(addPart(emptyDesign(), "arduino-uno").design, "led", { x: 8 }).design;
  d = addPart(d, "buzzer", { x: 16 }).design;
  d = connect(d, { part: "led-1", pin: "SIG" }, { part: "buzzer-1", pin: "SIG" }).design;
  d = connect(d, { part: "led-1", pin: "GND" }, { part: "buzzer-1", pin: "GND" }).design;
  const s = simulate(d, 0);
  assert.equal(s.parts["led-1"].dead, true);
  assert.equal(s.parts["buzzer-1"].dead, true);
});

test("a shorted part is dead, the board on that net stops, and its wires go dark", () => {
  // the buzzer's ground goes to 5 V: power and ground meet
  const { design, id } = hand("buzzer", { SIG: "D2", GND: "5V" });
  const r = simulate(design, 1000);
  assert.equal(r.parts[id].dead, true);
  assert.deepEqual(r.parts["arduino-uno-1"], { kind: "board", running: false });
  assert.ok(design.wires.every((w) => r.wires[w.id] === 0), "all wires on a dead part are dark");
  assert.ok(deadParts(design).has(id));
});

test("a part on too low a voltage is dead; a soft warning (5 V echo into a 3.3 V board) still works", () => {
  const weak = hand("hc-sr04", { VCC: "3V3", TRIG: "D2", ECHO: "D3", GND: "GND" });
  assert.equal(simulate(weak.design, 0).parts[weak.id].dead, true, "a 5 V sensor on 3.3 V");
  const echo = benchMany("esp32-devkit", "hc-sr04");
  assert.equal(at(echo.design, echo.ids[0], 0).dead, undefined, "level warning does not stop it");
  assert.equal(as(at(echo.design, "esp32-devkit-1", 0), "board").running, true);
});

test("two parts on one board pin (pinShared) both keep working", () => {
  let d = addPart(emptyDesign(), "arduino-uno").design;
  for (const type of ["led", "buzzer"]) {
    const r = addPart(d, type, { x: d.parts.length * 8 });
    d = r.design;
    d = connect(d, { part: r.id!, pin: "SIG" }, { part: "arduino-uno-1", pin: "D4" }).design;
    d = connect(d, { part: r.id!, pin: "GND" }, { part: "arduino-uno-1", pin: "GND" }).design;
  }
  const s = simulate(d, 0);
  assert.equal(s.parts["led-1"].dead, undefined);
  assert.equal(s.parts["buzzer-1"].dead, undefined);
});

test("a dead sensor does not drive the others", () => {
  // the HC-SR04 has no ground: dead, so the LED goes back to blinking by itself
  let d = addPart(addPart(emptyDesign(), "arduino-uno").design, "hc-sr04", { x: 8 }).design;
  d = connect(d, { part: "hc-sr04-1", pin: "VCC" }, { part: "arduino-uno-1", pin: "5V" }).design;
  d = connect(d, { part: "hc-sr04-1", pin: "TRIG" }, { part: "arduino-uno-1", pin: "D2" }).design;
  const led = addPart(d, "led", { x: 16 });
  d = autoWire(led.design, led.id!).design;
  assert.equal(simulate(d, 0).parts["hc-sr04-1"].dead, true);
  assert.equal(as(simulate(d, 0).parts[led.id!], "led").on, true, "blinking: on in the first half second");
  assert.equal(as(simulate(d, 600).parts[led.id!], "led").on, false);
});

test("the display shows the distance, else the climate, else a greeting", () => {
  const dist = benchMany("arduino-uno", "hc-sr04", "oled-128x64");
  const d = as(at(dist.design, dist.ids[1], 0), "display");
  assert.equal(d.lines[0], "Dist: 33 cm");
  const clim = benchMany("arduino-uno", "dht22", "lcd-1602-i2c");
  const c = as(at(clim.design, clim.ids[1], 0), "display");
  assert.match(c.lines[0], /^\d\d\.\d°C$/, "one decimal, no float noise");
  assert.match(c.lines[1], /^H: \d\d\.\d%$/);
  const hi = bench("arduino-uno", "oled-128x64");
  assert.deepEqual(as(at(hi.design, hi.ids[0], 4200), "display").lines, ["¡Hola!", "4 s"]);
});

test("DHT22: temperature 22 to 28, humidity 40 to 60", () => {
  const { design, ids } = bench("arduino-uno", "dht22");
  for (let t = 0; t < 60000; t += 5000) {
    const s = as(at(design, ids[0], t), "climate");
    assert.ok(s.c >= 22 && s.c <= 28 && s.h >= 40 && s.h <= 60, `t=${t}: ${s.c} ${s.h}`);
  }
});

test("PIR sees movement 2 s of every 7 s, the button is pressed 0.5 s of every 3 s", () => {
  const pir = bench("arduino-uno", "pir");
  assert.deepEqual([0, 3000, 7000].map((t) => as(at(pir.design, pir.ids[0], t), "motion").detected), [true, false, true]);
  const btn = bench("arduino-uno", "button");
  assert.deepEqual([0, 600, 3000].map((t) => as(at(btn.design, btn.ids[0], t), "button").pressed), [true, false, true]);
});

test("knob, soil and light give 0 to 100", () => {
  const { design, ids } = benchMany("arduino-uno", "potentiometer", "soil", "ldr");
  for (let t = 0; t < 30000; t += 2500) {
    for (const [i, kind] of [[0, "knob"], [1, "soil"], [2, "light"]] as const) {
      const p = as(at(design, ids[i], t), kind).percent;
      assert.ok(p >= 0 && p <= 100, `${kind} ${p}`);
    }
  }
});

test("the motor follows the knob, else the distance (close is fast), else cruises", () => {
  const knob = benchMany("arduino-uno", "potentiometer", "l298n");
  assert.ok(as(at(knob.design, knob.ids[1], 0), "motors").speed < 0.05);
  assert.ok(as(at(knob.design, knob.ids[1], 7500), "motors").speed > 0.95);
  const dist = benchMany("arduino-uno", "hc-sr04", "l298n");
  assert.ok(as(at(dist.design, dist.ids[1], 4500), "motors").speed > 0.95, "5 cm");
  assert.ok(as(at(dist.design, dist.ids[1], 1500), "motors").speed < 0.05, "60 cm");
  const alone = bench("arduino-uno", "l298n");
  assert.equal(as(at(alone.design, alone.ids[0], 0), "motors").speed, 0.6);
});

test("board is running, the battery is alive when wired", () => {
  const { design } = bench("arduino-uno", "led");
  assert.deepEqual(as(at(design, "arduino-uno-1", 99999), "board"), { kind: "board", running: true });
  let d = addPart(addPart(emptyDesign(), "arduino-uno").design, "battery-aa4", { x: 12 }).design;
  d = autoWire(d, "battery-aa4-1").design;
  assert.equal(as(simulate(d, 0).parts["battery-aa4-1"], "battery").on, true);
});

test("wire flow: steady 1 on power and ground, pulses between 0.35 and 1 on signals and the bus", () => {
  const { design } = benchMany("arduino-uno", "hc-sr04", "oled-128x64");
  for (let t = 0; t < 2000; t += 130) {
    const r = simulate(design, t);
    for (const w of design.wires) {
      const kind = wireKind(design, w);
      const flow = r.wires[w.id];
      if (kind === "power" || kind === "gnd") assert.equal(flow, 1, `${kind} ${w.id}`);
      else assert.ok(flow >= 0.35 && flow <= 1, `${kind} ${w.id} flow ${flow}`);
    }
  }
  const r0 = simulate(design, 0);
  const r1 = simulate(design, 100);
  const signal = wireOf(design, (k) => k === "signal");
  assert.notEqual(r0.wires[signal.id], r1.wires[signal.id], "signals move with time");
  assert.ok(wireOf(design, (k) => k === "bus"), "there is a bus wire");
});

test("wire flow is 0 when either end is dead", () => {
  const { design, id } = hand("led", { SIG: "D13", GND: "5V" });
  const r = simulate(design, 100);
  for (const w of design.wires) assert.equal(r.wires[w.id], 0, w.id);
  assert.equal(r.parts[id].dead, true);
});

test("simulate handles negative and huge times and an empty design", () => {
  const { design } = bench("arduino-uno", "hc-sr04");
  for (const t of [-1000, -1e9, 59000, 1e12]) {
    const r = simulate(design, t);
    assert.ok(Object.values(r.wires).every((f) => f >= 0 && f <= 1), `t=${t}`);
  }
  assert.deepEqual(simulate(emptyDesign(), 0), { parts: {}, wires: {} });
});

test("the cache never leaks one design's health into another", () => {
  const good = bench("arduino-uno", "led");
  const broken = hand("led", { SIG: "D13", GND: "5V" });
  assert.equal(simulate(good.design, 0).parts[good.ids[0]].dead, undefined);
  assert.equal(simulate(broken.design, 0).parts[broken.id].dead, true);
  assert.equal(simulate(good.design, 0).parts[good.ids[0]].dead, undefined);
});
