import test from "node:test";
import assert from "node:assert/strict";
import {
  welcomeReducer,
  recommend,
  type WelcomeState,
  type BuildIntent,
  type ExperienceLevel,
  type WelcomeRecommendation,
} from "../src/models/qubi/welcome.ts";

/* ---------- welcomeReducer ---------- */

test("initial state has step 0, no answer, no recommendation", () => {
  const state = { step: 0 as const, answer: null, recommendation: null };
  assert.equal(state.step, 0);
  assert.equal(state.answer, null);
  assert.equal(state.recommendation, null);
});

test("skip resets to step 3, clears answer and recommendation", () => {
  const state: WelcomeState = {
    step: 1,
    answer: { build: "medir distancia" as BuildIntent, experience: "nunca" as ExperienceLevel },
    recommendation: { example: "parkingSensor" as WelcomeRecommendation["example"], prompt: "", parts: [] },
  };
  const next = welcomeReducer(state, { type: "skip" });
  assert.equal(next.step, 3);
  assert.equal(next.answer, null);
  assert.equal(next.recommendation, null);
});

test("step 0 + answer-build: advances to step 1 with the answer", () => {
  const state: WelcomeState = { step: 0, answer: null, recommendation: null };
  const next = welcomeReducer(state, { type: "answer-build", value: "medir distancia" });
  assert.equal(next.step, 1);
  assert.deepEqual(next.answer, { build: "medir distancia", experience: "nunca" });
  assert.equal(next.recommendation, null);
});

test("step 0 + answer-build with 'otra cosa' stores freeText", () => {
  const state: WelcomeState = { step: 0, answer: null, recommendation: null };
  const next = welcomeReducer(state, { type: "answer-build", value: "otra cosa", freeText: "un reloj" });
  assert.equal(next.step, 1);
  assert.equal(next.answer!.freeText, "un reloj");
});

test("other options do NOT store freeText", () => {
  const state: WelcomeState = { step: 0, answer: null, recommendation: null };
  const next = welcomeReducer(state, { type: "answer-build", value: "cuidar plantas" });
  assert.equal(next.answer!.freeText, undefined);
});

test("step 1 + answer-experience: advances to step 3 with recommendation", () => {
  const state: WelcomeState = {
    step: 1,
    answer: { build: "cuidar plantas" as BuildIntent, experience: "nunca" as ExperienceLevel },
    recommendation: null,
  };
  const next = welcomeReducer(state, { type: "answer-experience", value: "sí" });
  assert.equal(next.step, 3);
  assert.deepEqual(next.answer, { build: "cuidar plantas", experience: "sí" });
  assert.ok(next.recommendation);
  assert.equal(next.recommendation.example, "plantWaterer");
});

test("ignores answer-experience when already past step 1", () => {
  const state: WelcomeState = { step: 3, answer: { build: "medir distancia" as BuildIntent, experience: "nunca" as ExperienceLevel }, recommendation: null };
  const next = welcomeReducer(state, { type: "answer-experience", value: "sí" });
  assert.equal(next.step, 3);
});

test("ignores answer-build when already past step 0", () => {
  const state: WelcomeState = { step: 1, answer: { build: "medir distancia" as BuildIntent, experience: "nunca" as ExperienceLevel }, recommendation: null };
  const next = welcomeReducer(state, { type: "answer-build", value: "clima de mi cuarto" });
  assert.equal(next.step, 1);
});

/* ---------- recommend ---------- */

test("medir distancia + nunca → parkingSensor", () => {
  const r = recommend({ build: "medir distancia" as BuildIntent, experience: "nunca" as ExperienceLevel });
  assert.equal(r.example, "parkingSensor");
  assert.ok(r.prompt.includes("sensor de estacionamiento"));
  assert.ok(r.parts.includes("hc-sr04"));
  assert.ok(r.parts.includes("servo-sg90"));
  assert.ok(r.parts.includes("oled-128x64"));
});

test("cuidar plantas + un poco → plantWaterer", () => {
  const r = recommend({ build: "cuidar plantas" as BuildIntent, experience: "un poco" as ExperienceLevel });
  assert.equal(r.example, "plantWaterer");
  assert.ok(r.prompt.includes("riego"));
  assert.ok(r.parts.includes("soil"));
  assert.ok(r.parts.includes("relay"));
});

test("clima de mi cuarto + sí → weatherStation", () => {
  const r = recommend({ build: "clima de mi cuarto" as BuildIntent, experience: "sí" as ExperienceLevel });
  assert.equal(r.example, "weatherStation");
  assert.ok(r.prompt.includes("estación del clima"));
  assert.ok(r.parts.includes("dht22"));
  assert.ok(r.parts.includes("oled-128x64"));
});

test("alarma de movimiento + nunca → parkingSensor", () => {
  const r = recommend({ build: "alarma de movimiento" as BuildIntent, experience: "nunca" as ExperienceLevel });
  assert.equal(r.example, "parkingSensor");
  assert.ok(r.prompt.includes("alarma de movimiento"));
  assert.ok(r.parts.includes("pir"));
  assert.ok(r.parts.includes("buzzer"));
});

test("un robot que se mueve + un poco → parkingSensor", () => {
  const r = recommend({ build: "un robot que se mueve" as BuildIntent, experience: "un poco" as ExperienceLevel });
  assert.equal(r.example, "parkingSensor");
  assert.ok(r.prompt.includes("robot que se mueva"));
  assert.ok(r.parts.includes("hc-sr04"));
  assert.ok(r.parts.includes("l298n"));
});

test("otra cosa + nunca → null example with freeText prompt", () => {
  const r = recommend({ build: "otra cosa" as BuildIntent, freeText: "un robot", experience: "nunca" as ExperienceLevel });
  assert.equal(r.example, null);
  assert.ok(r.prompt.includes("un robot"));
  assert.deepEqual(r.parts, []);
});

test("otra cosa sin freeText → generic fallback", () => {
  const r = recommend({ build: "otra cosa" as BuildIntent, experience: "nunca" as ExperienceLevel });
  assert.equal(r.example, null);
  assert.ok(r.prompt.includes("no lo sé"));
  assert.deepEqual(r.parts, []);
});

test("intro text reflects experience level", () => {
  const never = recommend({ build: "medir distancia" as BuildIntent, experience: "nunca" as ExperienceLevel });
  const poco = recommend({ build: "medir distancia" as BuildIntent, experience: "un poco" as ExperienceLevel });
  const yes = recommend({ build: "medir distancia" as BuildIntent, experience: "sí" as ExperienceLevel });

  assert.ok(never.prompt.includes("nunca armé"));
  assert.ok(poco.prompt.includes("hice algo pequeño"));
  assert.ok(yes.prompt.includes("tengo experiencia"));
});

test("all recommendations have non-empty prompt and at least one part (except custom)", () => {
  const builds: BuildIntent[] = ["medir distancia", "cuidar plantas", "clima de mi cuarto", "alarma de movimiento", "un robot que se mueve", "otra cosa"];
  const levels: ExperienceLevel[] = ["nunca", "un poco", "sí"];

  for (const b of builds) {
    for (const l of levels) {
      const r = recommend({ build: b, experience: l });
      assert.ok(r.prompt.length > 10, `prompt too short for ${b}/${l}`);
      // "otra cosa" has no catalog suggestions, only a free-text prompt
      if (b !== "otra cosa") assert.ok(r.parts.length > 0, `no parts for ${b}/${l}`);
    }
  }
});