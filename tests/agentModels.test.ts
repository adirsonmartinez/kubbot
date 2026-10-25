import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_MODELS,
  DEFAULT_CHOICE,
  isEffort,
  isModelId,
  normalizeChoice,
  parseChoice,
  requestConfig,
  serializeChoice,
} from "../src/models/agentModels.ts";

test("the list has Sonnet 5.5 first and only the three allowed models", () => {
  assert.deepEqual(
    AGENT_MODELS.map((m) => m.id),
    ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  );
  assert.equal(DEFAULT_CHOICE.model, "claude-sonnet-5-5");
});

test("only listed ids pass", () => {
  assert.equal(isModelId("claude-opus-5-5"), true);
  assert.equal(isModelId("claude-opus-4-8"), false);
  assert.equal(isModelId("claude-sonnet-5-5-20260101"), false);
  assert.equal(isModelId(undefined), false);
  assert.equal(isEffort("high"), true);
  assert.equal(isEffort("max"), false);
  assert.equal(isEffort("xhigh"), false);
});

test("normalizeChoice replaces anything invalid with the default", () => {
  assert.deepEqual(normalizeChoice({ model: "gpt-5", effort: "max" }), DEFAULT_CHOICE);
  assert.deepEqual(normalizeChoice({ model: "claude-haiku-5-5", effort: "low" }), { model: "claude-haiku-5-5", effort: "low" });
  assert.deepEqual(normalizeChoice(null), DEFAULT_CHOICE);
  assert.deepEqual(normalizeChoice("x"), DEFAULT_CHOICE);
  // a half-valid choice keeps the valid half
  assert.deepEqual(normalizeChoice({ model: "claude-opus-5-5", effort: 3 }), { model: "claude-opus-5-5", effort: DEFAULT_CHOICE.effort });
});

test("a saved choice round-trips and broken text gives the default", () => {
  const choice = { model: "claude-opus-5-5", effort: "high" } as const;
  assert.deepEqual(parseChoice(serializeChoice(choice)), choice);
  assert.deepEqual(parseChoice("{not json"), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice(null), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice(JSON.stringify({ model: "evil", effort: "high" })), { model: DEFAULT_CHOICE.model, effort: "high" });
});

test("requestConfig: adaptive thinking for all, fallback not for Haiku, low effort in a call", () => {
  const sonnet = requestConfig({ model: "claude-sonnet-5-5", effort: "high" });
  assert.deepEqual(sonnet.thinking, { type: "adaptive" });
  assert.equal(sonnet.effort, "high");
  assert.equal(sonnet.fallback, true);
  assert.equal(requestConfig({ model: "claude-opus-5-5", effort: "medium" }).fallback, true);
  assert.equal(requestConfig({ model: "claude-haiku-5-5", effort: "medium" }).fallback, false);
  assert.equal(requestConfig({ model: "claude-opus-5-5", effort: "high" }, { voice: true }).effort, "low");
  // an invalid choice never reaches the request
  assert.equal(requestConfig({ model: "x" as never, effort: "z" as never }).model, DEFAULT_CHOICE.model);
});
