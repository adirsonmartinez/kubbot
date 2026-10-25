import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePrompt, applyCompletion, completions } from "../src/models/promptAssist.ts";

const PARTS = [
  { id: "hc-sr04", name: "Sensor de distancia" },
  { id: "dht22", name: "Sensor de temperatura y humedad" },
  { id: "servo", name: "Servomotor" },
  { id: "camera", name: "Cámara" },
];

test("hints: nothing for an empty box, a warning for a pasted key", () => {
  assert.deepEqual(analyzePrompt(""), []);
  assert.deepEqual(analyzePrompt("   "), []);
  assert.deepEqual(analyzePrompt("mi clave: abc123456 es esta"), [{ kind: "secret" }]);
  assert.deepEqual(analyzePrompt("sk-ant-api03-abcdefghijklmnop1234"), [{ kind: "secret" }]);
  assert.deepEqual(analyzePrompt("conecta todo"), []);
});

test("a single finished word asks for more, one still being typed does not", () => {
  assert.deepEqual(analyzePrompt("hola "), [{ kind: "short" }]);
  assert.deepEqual(analyzePrompt("hola"), []);
  assert.deepEqual(analyzePrompt("hola qubi "), []);
});

test("completions match the start of the name or of one of its words, without accents", () => {
  assert.deepEqual(completions("pon un sens", PARTS).map((c) => c.id), ["hc-sr04", "dht22"]);
  assert.deepEqual(completions("camara", PARTS).map((c) => c.id), ["camera"]);
  assert.deepEqual(completions("agrega temper", PARTS).map((c) => c.id), ["dht22"]);
  assert.deepEqual(completions("pon el @se", PARTS).map((c) => c.id), ["hc-sr04", "dht22", "servo"]);
});

test("no completions for short words, finished words or an empty box", () => {
  assert.deepEqual(completions("se", PARTS), []);
  assert.deepEqual(completions("sensor ", PARTS), []);
  assert.deepEqual(completions("", PARTS), []);
  assert.deepEqual(completions("xyz", PARTS), []);
});

test("applyCompletion replaces the word being typed", () => {
  assert.equal(applyCompletion("pon un sens", { id: "hc-sr04", name: "Sensor de distancia" }), "pon un Sensor de distancia ");
  assert.equal(applyCompletion("@se", { id: "servo", name: "Servomotor" }), "Servomotor ");
});
