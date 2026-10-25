// The Claude models Qubi can use and how hard they think. The person picks one in the chat; the route
// only accepts the ids listed here, so nothing else ever reaches the API. No React, no I/O.
//
// What the API accepts (claude-api skill): the three models take adaptive thinking and
// `output_config.effort`; none accepts `budget_tokens`, `thinking: disabled` or sampling parameters.
// Opus 5.5 and Sonnet 5.5 can retry a policy refusal on a fallback model; Haiku 5.5 has no fallback.

export type AgentModelId = "claude-sonnet-5-5" | "claude-opus-5-5" | "claude-haiku-5-5";
export type AgentEffort = "low" | "medium" | "high";
export type AgentTier = "balanced" | "deep" | "fast";

export type AgentModel = {
  id: AgentModelId;
  tier: AgentTier;
  // Whether the API can retry a refusal on its own fallback model (server-side fallback)
  fallback: boolean;
};

export const AGENT_MODELS: readonly AgentModel[] = [
  { id: "claude-sonnet-5-5", tier: "balanced", fallback: true },
  { id: "claude-opus-5-5", tier: "deep", fallback: true },
  { id: "claude-haiku-5-5", tier: "fast", fallback: false },
];
export const EFFORTS: readonly AgentEffort[] = ["low", "medium", "high"];

export const DEFAULT_MODEL: AgentModelId = "claude-sonnet-5-5";
export const DEFAULT_EFFORT: AgentEffort = "medium";

export type AgentChoice = { model: AgentModelId; effort: AgentEffort };
export const DEFAULT_CHOICE: AgentChoice = { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT };

export const isModelId = (value: unknown): value is AgentModelId => AGENT_MODELS.some((m) => m.id === value);
export const isEffort = (value: unknown): value is AgentEffort => EFFORTS.includes(value as AgentEffort);

export function modelOf(id: AgentModelId): AgentModel {
  return AGENT_MODELS.find((m) => m.id === id) ?? AGENT_MODELS[0];
}

// Anything that is not on the lists falls back to the default (never throws)
export function normalizeChoice(raw: unknown, fallback: AgentChoice = DEFAULT_CHOICE): AgentChoice {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    model: isModelId(r.model) ? r.model : fallback.model,
    effort: isEffort(r.effort) ? r.effort : fallback.effort,
  };
}

export function serializeChoice(choice: AgentChoice): string {
  return JSON.stringify(normalizeChoice(choice));
}

// The saved text -> a valid choice (the default for missing or broken text)
export function parseChoice(text: string | null | undefined): AgentChoice {
  if (!text) return DEFAULT_CHOICE;
  try {
    return normalizeChoice(JSON.parse(text));
  } catch {
    return DEFAULT_CHOICE;
  }
}

// What the route sends to the API for a choice. A call (voice) needs a quick answer: lowest effort there.
export type AgentRequestConfig = {
  model: AgentModelId;
  effort: AgentEffort;
  thinking: { type: "adaptive" };
  fallback: boolean;
};

export function requestConfig(choice: AgentChoice, { voice = false }: { voice?: boolean } = {}): AgentRequestConfig {
  const { model, effort } = normalizeChoice(choice);
  return { model, effort: voice ? "low" : effort, thinking: { type: "adaptive" }, fallback: modelOf(model).fallback };
}

// What an anonymous caller may use: Sonnet or Haiku at medium effort or lower, unless the owner allows Opus
// (QUBBOT_ALLOW_OPUS=1). Anything costlier is lowered, never refused, so the chat keeps working.
export function restrictChoice(choice: AgentChoice, allowOpus: boolean): AgentChoice {
  if (allowOpus) return choice;
  return {
    model: choice.model === "claude-opus-5-5" ? DEFAULT_MODEL : choice.model,
    effort: choice.effort === "high" ? "medium" : choice.effort,
  };
}
