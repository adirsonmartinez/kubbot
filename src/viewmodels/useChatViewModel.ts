"use client";

// ViewModel for the agent chat: messages, the draft, and whether the panel is minimized or pinned.
// With a `lab` it also runs the agent loop: ask the model, run the tools it calls on the bench, show a
// short card for each thing done, and ask again with the results until the model is finished.

import { useEffect, useRef, useState } from "react";
import { canSend, createMessage, type ChatMessage, type ChatRole } from "@/models/chat";
import type { AgentBlock, AgentMessage, AgentOutcome, AgentToolCall, AgentToolResult } from "@/models/lab/agentTools";
import { resultText } from "@/models/lab/agentTools";
import type { AssistantCopy, IdeaKey } from "@/models/lab/assistant";
import { emptyDesign, type Design } from "@/models/lab/circuit";
import { askAgent } from "@/services/agentService";
import { issueLines } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";

// A chat line: a message, plus an optional small tag ("sin IA") or a card (something the agent did)
export type ChatEntry = ChatMessage & { tag?: string; card?: boolean };

// What the chat needs from the lab view model to act on the bench
export type ChatLab = {
  design: Design;
  // Runs one tool on the bench. May return the whole outcome ({ design, result }) or only the result.
  applyAgentTool: (name: string, input: unknown) => AgentOutcome | AgentToolResult;
  // Called after simulate, enclosure or sketch worked, so the lab can show it
  onEffect?: (kind: "simulate" | "enclosure" | "sketch") => void;
};

const WELCOME_TEXT = "Nueva conversación";
const WELCOME = createMessage("sys", WELCOME_TEXT);
const MAX_STEPS = 12; // model calls per message: a safety net against a loop
const SETTLE_MS = 60; // lets the lab re-render after tools changed the bench
const EFFECTS: Record<string, "simulate" | "enclosure" | "sketch"> = {
  lab_simulate: "simulate",
  lab_make_enclosure: "enclosure",
  lab_make_sketch: "sketch",
};

const PART_TEXT = labCopy.parts as Record<string, { name: string }>;
const ASSISTANT = labCopy.agent.assistant;

// "Sensor de distancia 2" from "hc-sr04-2", without needing the part to be on the bench yet
function labelOf(id: string): string {
  const type = id.replace(/-\d+$/, "");
  const n = /-(\d+)$/.exec(id)?.[1];
  const name = PART_TEXT[type]?.name ?? id;
  return n ? labCopy.panel.partLabel(name, Number(n)) : name;
}
const nameOfType = (type: string) => PART_TEXT[type]?.name ?? type;

function assistantCopy(design: Design): AssistantCopy {
  return {
    partName: nameOfType,
    hint: ASSISTANT.hint,
    noBoard: ASSISTANT.noBoard,
    nothingToWire: ASSISTANT.nothingToWire,
    wiring: ASSISTANT.wiring,
    allGood: ASSISTANT.allGood,
    issuesIntro: ASSISTANT.issuesIntro,
    issue: (issue) => issueLines(design, [issue])[0]?.text ?? "",
    ideasIntro: ASSISTANT.ideasIntro,
    ideasEmpty: ASSISTANT.ideasEmpty,
    idea: (key: IdeaKey, missing) => `${ASSISTANT.ideas[key]} ${missing.length ? ASSISTANT.ideaMissing(missing) : ASSISTANT.ideaReady}`,
    simulating: ASSISTANT.simulating,
    simulateBlocked: ASSISTANT.simulateBlocked,
    enclosure: ASSISTANT.enclosure,
    sketch: ASSISTANT.sketch,
  };
}

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// The short line shown in the chat for something a tool did; null for reads and refusals
function cardText(tool: string, input: unknown, result: AgentToolResult): string | null {
  if (!result.ok) return null;
  const cards = labCopy.agent.cards;
  const pin = (end: unknown) => {
    const e = record(end);
    return cards.pin(String(e.pin ?? ""), labelOf(String(e.part ?? "")));
  };
  switch (tool) {
    case "lab_add_part":
      return typeof result.id === "string" ? cards.add(labelOf(result.id)) : null;
    case "lab_connect":
      return cards.connect(pin(result.from), pin(result.to));
    case "lab_auto_wire":
      return cards.autoWire(Number(result.wiresAdded) || 0);
    case "lab_remove": {
      const part = record(input).part;
      return typeof part === "string" && part ? cards.removePart(labelOf(part)) : cards.removeWire;
    }
    case "lab_simulate":
      return cards.simulate;
    case "lab_make_enclosure":
      return cards.enclosure;
    case "lab_make_sketch":
      return cards.sketch;
    default:
      return null;
  }
}

const isOutcome = (out: AgentOutcome | AgentToolResult): out is AgentOutcome => "result" in out && "design" in out;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useChatViewModel({ suggestions = [] as string[], lab }: { suggestions?: string[]; lab?: ChatLab } = {}) {
  const [messages, setMessages] = useState<ChatEntry[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Replies from a conversation that was cleared are dropped
  const conversation = useRef(0);
  // What the model has seen (user text, its own turns, tool results); the screen shows ChatEntry instead
  const wire = useRef<AgentMessage[]>([]);
  const noAiNoted = useRef(false);
  // The latest lab, so a loop that outlives a render still reads the current bench
  const labRef = useRef(lab);
  useEffect(() => {
    labRef.current = lab;
  });

  const add = (id: number, ...entries: ChatEntry[]) => {
    if (id === conversation.current) setMessages((current) => [...current, ...entries]);
  };
  const line = (role: ChatRole, text: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({ ...createMessage(role, text), ...extra });

  // Runs the calls in order on the bench; returns what to tell the model and the bench after them
  function runTools(id: number, calls: AgentToolCall[]): { results: AgentBlock[]; design: Design | null } {
    const results: AgentBlock[] = [];
    let design: Design | null = null;
    for (const call of calls) {
      let result: AgentToolResult;
      const current = labRef.current;
      if (!current) {
        result = { ok: false, error: "lab_unavailable" };
      } else {
        try {
          const out = current.applyAgentTool(call.name, call.input);
          if (isOutcome(out)) {
            result = out.result;
            design = out.design;
          } else {
            result = out;
          }
        } catch {
          result = { ok: false, error: "tool_failed" };
        }
      }
      const card = cardText(call.name, call.input, result);
      if (card) add(id, line("sys", card, { card: true }));
      const effect = Object.hasOwn(EFFECTS, call.name) ? EFFECTS[call.name] : undefined;
      if (result.ok && effect) labRef.current?.onEffect?.(effect);
      results.push({ type: "tool_result", tool_use_id: call.id, content: resultText(result), ...(result.ok ? {} : { is_error: true }) });
    }
    return { results, design };
  }

  async function send(text = draft) {
    if (!canSend(text, busy)) return;
    const id = conversation.current;
    const said = text.trim();
    setMessages((current) => [...current, createMessage("user", said)]);
    setDraft("");
    setBusy(true);
    const before = wire.current;
    let history: AgentMessage[] = [...before, { role: "user", content: said }];
    try {
      let design = labRef.current?.design ?? emptyDesign();
      for (let step = 0; ; step++) {
        if (step >= MAX_STEPS) {
          add(id, line("sys", labCopy.agent.tooManySteps));
          break;
        }
        const { reply, noAi } = await askAgent({ messages: history, design, lastUserText: said, copy: assistantCopy(design) });
        if (id !== conversation.current) return;
        if (noAi && !noAiNoted.current) {
          noAiNoted.current = true;
          add(id, line("sys", labCopy.agent.noAiNote));
        }
        if (reply.text) add(id, line("bot", reply.text, noAi ? { tag: labCopy.agent.noAi } : {}));
        if (reply.stop === "max_tokens") add(id, line("sys", labCopy.agent.cutOff));
        if (reply.stop === "refusal" && !reply.text) add(id, line("sys", labCopy.agent.refused));

        // The model's turn goes back as it came; a call cut off mid-way must not stay in the history
        const content = noAi ? reply.text : reply.content.filter((b) => reply.stop === "tool_use" || b.type !== "tool_use");
        if (content.length) history = [...history, { role: "assistant", content }];
        if (!reply.toolCalls.length) break;

        const done = runTools(id, reply.toolCalls);
        // The rule-based assistant answers once: it has no model to hand the results to
        if (noAi) break;
        history = [...history, { role: "user", content: done.results }];
        if (done.design) design = done.design;
        else {
          await wait(SETTLE_MS);
          design = labRef.current?.design ?? design;
        }
        if (id !== conversation.current) return;
      }
      wire.current = history;
    } catch {
      wire.current = before;
      add(id, line("sys", labCopy.agent.failed));
    } finally {
      if (id === conversation.current) setBusy(false);
    }
  }

  return {
    messages,
    draft,
    busy,
    canSend: canSend(draft, busy),
    // Suggestions only until the person writes something
    suggestions: messages.some((m) => m.role === "user") ? [] : suggestions,
    minimized,
    pinned,
    setDraft,
    send,
    newConversation: () => {
      conversation.current++;
      wire.current = [];
      noAiNoted.current = false;
      setMessages([createMessage("sys", WELCOME_TEXT)]);
      setDraft("");
      setBusy(false);
    },
    toggleMinimized: () => setMinimized((m) => !m),
    togglePinned: () => setPinned((p) => !p),
  };
}

export type ChatViewModel = ReturnType<typeof useChatViewModel>;
