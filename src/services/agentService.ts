// Talks to the chat agent: one model turn per call through /api/agent. Without a key (the route answers
// 503) it falls back to the rule-based assistant and says so with `noAi`, so the chat still works.
// The key never reaches the browser; this file only knows the route.

import { assist, type AssistantCopy } from "@/models/lab/assistant";
import type { AgentBlock, AgentMessage, AgentReply, AgentStop } from "@/models/lab/agentTools";
import type { Design } from "@/models/lab/circuit";

const ROUTE = "/api/agent";
const TIMEOUT_MS = 120_000;
const STOPS: AgentStop[] = ["end", "tool_use", "max_tokens", "refusal"];

export type AgentAnswer = { reply: AgentReply; noAi: boolean };
export type AgentQuestion = {
  // The whole conversation so far, ending with the person's message or tool results
  messages: AgentMessage[];
  design: Design;
  // The person's last words and the texts for the rule-based fallback
  lastUserText: string;
  copy: AssistantCopy;
};

// Once the route said "no key" the answer holds until the server restarts: stop asking
let noKey = false;

function isReply(value: unknown): value is AgentReply {
  const r = value as Partial<AgentReply> | null;
  return !!r && typeof r.text === "string" && Array.isArray(r.toolCalls) && Array.isArray(r.content) && STOPS.includes(r.stop as AgentStop);
}

function ruleAnswer({ lastUserText, design, copy }: AgentQuestion): AgentAnswer {
  const rule = assist(lastUserText, design, copy);
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
    body: JSON.stringify({ messages: question.messages, design: question.design }),
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
