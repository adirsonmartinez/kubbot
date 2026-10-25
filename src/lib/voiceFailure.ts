// How /api/voice answers when ElevenLabs fails. A key the account rejects (401/403, or a body that says so)
// is a 503 "bad-key", like a missing key: the call then falls back to the browser voice without a message.
// Pure: the route passes the upstream status (undefined when the network failed) and the start of its body.

export type VoiceFailure = { status: number; error: "bad-key" | "quota" | "api" | "network" };

const REJECTED_KEY = /invalid_api_key|missing_permissions|unauthorized|api key/i;

export function voiceFailure(status: number | undefined, body = ""): VoiceFailure {
  if (status === 401 || status === 403 || (status !== undefined && status < 500 && REJECTED_KEY.test(body))) return { status: 503, error: "bad-key" };
  if (status === 429 || status === 402) return { status: 429, error: "quota" };
  return { status: 502, error: status ? "api" : "network" };
}
