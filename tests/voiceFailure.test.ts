import assert from "node:assert/strict";
import { test } from "node:test";
import { voiceFailure } from "../src/lib/voiceFailure.ts";

test("a key ElevenLabs rejects answers 503 bad-key, so the call falls back to the browser voice", () => {
  assert.deepEqual(voiceFailure(401), { status: 503, error: "bad-key" });
  assert.deepEqual(voiceFailure(403), { status: 503, error: "bad-key" });
  assert.deepEqual(voiceFailure(400, '{"detail":{"status":"missing_permissions"}}'), { status: 503, error: "bad-key" });
});

test("other upstream failures keep their answers", () => {
  assert.deepEqual(voiceFailure(429), { status: 429, error: "quota" });
  assert.deepEqual(voiceFailure(402), { status: 429, error: "quota" });
  assert.deepEqual(voiceFailure(500, "unauthorized"), { status: 502, error: "api" });
  assert.deepEqual(voiceFailure(undefined), { status: 502, error: "network" });
});
