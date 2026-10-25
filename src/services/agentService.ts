// Talks to the chat agent: one model turn per call through /api/agent. Without a key (the route answers
// 503) it falls back to the rule-based assistant and says so with `noAi`, so the chat still works.
// The key never reaches the browser; this file only knows the route.

import { assist, type AssistantCopy } from "@/models/lab/assistant";
import { quickRule, type AgentBlock, type AgentMessage, type AgentReply, type AgentStop, type QuickCopy } from "@/models/lab/agentTools";
import type { Design } from "@/models/lab/circuit";
import { serializeChoice, type AgentChoice } from "@/models/agentModels";

const ROUTE = "/api/agent";
const TIMEOUT_MS = 120_000;
const CHOICE_KEY = "qubbot.chat.model.v1";
const STOPS: AgentStop[] = ["end", "tool_use", "max_tokens", "refusal"];

// "chat" is the written conversation; "voice" asks for 1 or 2 short spoken sentences
export type AgentMode = "chat" | "voice";

export type AgentAnswer = { reply: AgentReply; noAi: boolean };
export type AgentQuestion = {
  // The whole conversation so far, ending with the person's message or tool results
  messages: AgentMessage[];
  design: Design;
  // The person's last words and the texts for the rule-based fallback
  lastUserText: string;
  copy: AssistantCopy;
  // The texts for the shortcuts of the rule-based fallback ("carga un ejemplo", "limpia el banco")
  quick?: QuickCopy;
  mode?: AgentMode;
  // The model and effort the person picked (the route checks them against its own list)
  choice?: AgentChoice;
};

// The person's model and effort, kept in this browser. A view model reads them with useSyncExternalStore:
// `readAgentChoice` is the saved text (a stable string), `subscribeAgentChoice` tells when it changes.
let chosenText: string | null = null; // what was saved in this page (used when there is no storage)
const choiceListeners = new Set<() => void>();

export function readAgentChoice(): string | null {
  try {
    return globalThis.localStorage?.getItem(CHOICE_KEY) ?? chosenText;
  } catch {
    return chosenText;
  }
}

export function subscribeAgentChoice(listener: () => void): () => void {
  choiceListeners.add(listener);
  globalThis.addEventListener?.("storage", listener); // another tab changed it
  return () => {
    choiceListeners.delete(listener);
    globalThis.removeEventListener?.("storage", listener);
  };
}

export function saveAgentChoice(choice: AgentChoice): void {
  chosenText = serializeChoice(choice);
  try {
    globalThis.localStorage?.setItem(CHOICE_KEY, chosenText);
  } catch {
    // No storage (private window): the choice lasts until the page closes
  }
  choiceListeners.forEach((l) => l());
}

// Once the route said "no key" the answer holds until the server restarts: stop asking
let noKey = false;

function isReply(value: unknown): value is AgentReply {
  const r = value as Partial<AgentReply> | null;
  return !!r && typeof r.text === "string" && Array.isArray(r.toolCalls) && Array.isArray(r.content) && STOPS.includes(r.stop as AgentStop);
}

function ruleAnswer({ lastUserText, design, copy, quick }: AgentQuestion): AgentAnswer {
  const rule = (quick && quickRule(lastUserText, quick)) || assist(lastUserText, design, copy);
  const content: AgentBlock[] = [{ type: "text", text: rule.text }];
  const stop: AgentStop = rule.toolCalls.length ? "tool_use" : "end";
  return { reply: { text: rule.text, toolCalls: rule.toolCalls, stop, content }, noAi: true };
}

// Throws when the route fails for any reason other than "no key"
export async function askAgent(question: AgentQuestion): Promise<AgentAnswer> {
  if (noKey) return ruleAnswer(question);
  const response = await fetch(ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: question.messages, design: question.design, mode: question.mode ?? "chat", ...(question.choice ? { model: question.choice.model, effort: question.choice.effort } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 503) {
    noKey = true;
    return ruleAnswer(question);
  }
  if (!response.ok) throw new Error(`agent ${response.status}`);
  const data: unknown = await response.json();
  if (!isReply(data)) throw new Error("agent reply");
  return { reply: data, noAi: false };
}
