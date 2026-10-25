import test from "node:test";
import assert from "node:assert/strict";
import { componentOf } from "../src/models/lab/catalog.ts";
import { addPart, autoWire, emptyDesign, connect, type Design } from "../src/models/lab/circuit.ts";
import { IDEAS, assist, ideasFor, intentOf, type AssistantCopy } from "../src/models/lab/assistant.ts";

const copy: AssistantCopy = {
  partName: (t) => `N:${t}`,
  hint: "HINT",
  noBoard: "NOBOARD",
  nothingToWire: "NOTHING",
  wiring: "WIRING",
  allGood: "GOOD",
  issuesIntro: (n) => `ISSUES ${n}`,
  issue: (i) => `${i.key}`,
  ideasIntro: (have) => `IDEAS from ${have.join(",")}`,
  ideasEmpty: "EMPTY",
  idea: (k, missing) => `${k}${missing.length ? ` missing ${missing.join("+")}` : ""}`,
  simulating: "SIM",
  simulateBlocked: "BLOCKED",
  enclosure: "BOX",
  sketch: "CODE",
};

const bench = (...types: string[]): Design => types.reduce((d, type, i) => addPart(d, type, { x: i * 8 }).design, emptyDesign());

test("intents from plain Spanish, with or without accents", () => {
  const cases: [string, string][] = [
    ["conecta todo", "wire"],
    ["Conéctalo tú", "wire"],
    ["revisa mis conexiones", "review"],
    ["¿Está bien mi circuito?", "review"],
    ["simula el circuito", "simulate"],
    ["hazle una caja imprimible", "enclosure"],
    ["dame el código", "sketch"],
    ["¿Qué puedo construir?", "ideas"],
    ["dame ideas", "ideas"],
    ["hola", "hint"],
    ["", "hint"],
  ];
  for (const [text, intent] of cases) assert.equal(intentOf(text), intent, text);
});

test("every idea uses only catalog parts, no board needed", () => {
  assert.equal(new Set(IDEAS.map((i) => i.key)).size, IDEAS.length);
  for (const idea of IDEAS) for (const need of idea.needs) assert.equal(componentOf(need)?.kind, "part", `${idea.key}: ${need}`);
});

test("ideasFor: complete ideas first, then partial, none for an empty bench", () => {
  assert.deepEqual(ideasFor(emptyDesign()), []);
  const ideas = ideasFor(bench("arduino-uno", "hc-sr04", "buzzer"));
  assert.equal(ideas[0].key, "distanceAlarm");
  assert.deepEqual(ideas[0].missing, []);
  assert.ok(ideas.length <= 3);
  assert.ok(ideas.slice(1).every((i) => i.missing.length > 0));
});

test("ideas: from the parts on the bench, naming what is missing", () => {
  const r = assist("¿qué puedo construir?", bench("arduino-uno", "hc-sr04"), copy);
  assert.equal(r.intent, "ideas");
  assert.match(r.text, /IDEAS from N:arduino-uno,N:hc-sr04/);
  assert.match(r.text, /distanceAlarm missing N:buzzer/);
  assert.equal(r.toolCalls.length, 0);
});

test("ideas on an empty bench suggest starters", () => {
  const r = assist("ideas", emptyDesign(), copy);
  assert.match(r.text, /^EMPTY/);
  assert.match(r.text, /nightLight/);
});

test("conecta: asks for lab_auto_wire on all parts, but only with a board and parts", () => {
  assert.equal(assist("conecta", emptyDesign(), copy).text, "NOBOARD");
  assert.equal(assist("conecta", bench("hc-sr04"), copy).text, "NOBOARD");
  assert.equal(assist("conecta", bench("arduino-uno"), copy).text, "NOTHING");
  const r = assist("conecta todo", bench("arduino-uno", "led"), copy);
  assert.equal(r.text, "WIRING");
  assert.deepEqual(r.toolCalls.map((c) => [c.name, c.input]), [["lab_auto_wire", { part: "all" }]]);
});

test("revisa: lists the checker's issues, says all good when there are none", () => {
  const r = assist("revisa", bench("arduino-uno", "hc-sr04"), copy);
  assert.match(r.text, /^ISSUES \d/);
  assert.match(r.text, /• missing/);
  assert.equal(assist("revisa", emptyDesign(), copy).text, "HINT");
  const wired = assist("conecta", bench("arduino-uno", "led"), copy);
  assert.equal(wired.toolCalls.length, 1);
  // A green bench: wire by hand through the model functions
  let d = bench("arduino-uno", "led");
  d = autoWire(d, "led-1").design; // the LED gets its resistor
  assert.equal(assist("revisa", d, copy).text, "GOOD");
  // A bare LED on a pin is red, and the review says so
  const bare = connect(bench("arduino-uno", "led"), { part: "led-1", pin: "SIG" }, { part: "arduino-uno-1", pin: "D3" }).design;
  assert.match(assist("revisa", bare, copy).text, /ledNoResistor/);
});

test("simula: refuses on red and without a board, otherwise calls the tool", () => {
  assert.equal(assist("simula", emptyDesign(), copy).text, "NOBOARD");
  let d = bench("arduino-uno", "led");
  assert.deepEqual(assist("simula", d, copy).toolCalls.map((c) => c.name), ["lab_simulate"]);
  d = connect(d, { part: "led-1", pin: "GND" }, { part: "arduino-uno-1", pin: "5V" }).design;
  d = connect(d, { part: "arduino-uno-1", pin: "5V" }, { part: "arduino-uno-1", pin: "GND" }).design;
  const blocked = assist("simula", d, copy);
  assert.equal(blocked.text, "BLOCKED");
  assert.equal(blocked.toolCalls.length, 0);
});

test("caja and codigo: need a board, then call their tool", () => {
  assert.equal(assist("caja", emptyDesign(), copy).text, "NOBOARD");
  assert.deepEqual(assist("hazle una caja", bench("arduino-uno"), copy).toolCalls.map((c) => c.name), ["lab_make_enclosure"]);
  assert.deepEqual(assist("dame el código", bench("arduino-uno"), copy).toolCalls.map((c) => c.name), ["lab_make_sketch"]);
});

test("anything else gets the hint and never throws", () => {
  for (const text of ["hola", "???", "x".repeat(10000), "\u0000"]) {
    const r = assist(text, emptyDesign(), copy);
    assert.equal(r.text, "HINT");
    assert.deepEqual(r.toolCalls, []);
  }
});
