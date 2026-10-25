"use client";

// ViewModel for the agent chat: messages, the draft, and whether the panel is minimized or pinned.
// With a `lab` it also runs the agent loop: ask the model, run the tools it calls on the bench, show a
// short card for each thing done, and ask again with the results until the model is finished.
//
// Qubi follows the loop through `onEvent` (AgentEvent: thinking, tools, reply, plan, step, done, error).
// `ask(text, { mode })` is the same loop for the call: it resolves with Qubi's final words, and in
// "voice" mode the model answers in one or two short spoken sentences. A plan the model publishes
// (lab_plan / lab_step) becomes a task card in the chat, kept here because the chat owns the conversation.
//
// Every question also gets a run card (models/runStory): the same events tell what Qubi is doing, step by
// step, and how long it took. The person's model and effort (models/agentModels) are kept in this browser
// and sent with each call; the route accepts only its own list.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AGENT_MODELS, EFFORTS, parseChoice, type AgentChoice, type AgentEffort, type AgentModelId } from "@/models/agentModels";
import { canSend, createMessage, transcript, type ChatMessage, type ChatRole } from "@/models/chat";
import type { AgentBlock, AgentMessage, AgentOutcome, AgentToolCall, AgentToolResult, QuickCopy } from "@/models/lab/agentTools";
import { applyAgentTool, newTask, resultText, toolPart, updateTask } from "@/models/lab/agentTools";
import type { AssistantCopy, IdeaKey } from "@/models/lab/assistant";
import { emptyDesign, type Design } from "@/models/lab/circuit";
import { analyzePrompt, applyCompletion, completions as completionsFor } from "@/models/promptAssist";
import type { AgentEvent, QubiTask } from "@/models/qubi/types";
import { currentActivity, newRun, runReducer, type RunState } from "@/models/runStory";
import { askAgent, readAgentChoice, saveAgentChoice, subscribeAgentChoice, type AgentMode } from "@/services/agentService";
import { downloadFile } from "@/services/labStorage";
import { issueLines } from "@/viewmodels/useLabViewModel";
import { chatCopy } from "@/views/copy/chat";
import { labCopy } from "@/views/copy/lab";
import { qubiCopy } from "@/views/copy/qubi";

// Types a view may need (a view never imports models directly)
export type { AgentEvent, QubiStepState, QubiTask } from "@/models/qubi/types";
export type AskMode = AgentMode;
export type { RunActivity, RunState, RunStep } from "@/models/runStory";
export type { AgentEffort, AgentModelId } from "@/models/agentModels";
// What the chat's views need to draw an answer and its run card (views go through the view model)
export { parseMarkdown } from "@/models/markdown";
export type { Block, Inline } from "@/models/markdown";
export { BEAM_AFTER_MS, ORB_AFTER_MS, currentActivity, formatSeconds, orbOf, stepMs, summarize } from "@/models/runStory";
export type { OrbKind } from "@/models/runStory";
export type { Completion, PromptHint } from "@/models/promptAssist";

// A chat line: a message, plus an optional small tag ("sin IA"), a card (something the agent did), a task
// (the plan Qubi is carrying out), the run card of an answer (what Qubi did and how long it took) or the
// mark of a line that was spoken in a call
export type ChatEntry = ChatMessage & { tag?: string; card?: boolean; task?: QubiTask; voice?: boolean; run?: RunState };

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
const MAX_STEPS = 30; // model calls per message: a safety net against a loop (a plan takes a few per step)
const SETTLE_MS = 60; // lets the lab re-render after tools changed the bench
const EFFECTS: Record<string, "simulate" | "enclosure" | "sketch"> = {
  lab_simulate: "simulate",
  lab_make_enclosure: "enclosure",
  lab_make_sketch: "sketch",
};

const PART_TEXT = labCopy.parts as Record<string, { name: string }>;
// The parts the composer can complete by name
const PART_NAMES = Object.entries(PART_TEXT).map(([id, part]) => ({ id, name: part.name }));
const PICKER = chatCopy.picker;
const MODEL_OPTIONS = AGENT_MODELS.map((m) => ({ id: m.id, name: PICKER.models[m.id]?.name ?? m.id, note: PICKER.models[m.id]?.note ?? "" }));
const EFFORT_OPTIONS = EFFORTS.map((id) => ({ id, name: PICKER.efforts[id]?.name ?? id, hint: PICKER.efforts[id]?.hint ?? "" }));
const EXAMPLE_TEXT = labCopy.agent.examples as Record<string, string>;
const ASSISTANT = labCopy.agent.assistant;

// The texts of the "no AI" shortcuts (load an example, clear the bench)
const QUICK: QuickCopy = {
  exampleName: (name) => EXAMPLE_TEXT[name] ?? name,
  loadingExample: ASSISTANT.loadingExample,
  chooseExample: ASSISTANT.chooseExample,
  clearing: ASSISTANT.clearing,
};

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
    case "lab_move": {
      const part = result.part;
      return typeof part === "string" && part ? cards.move(labelOf(part)) : null;
    }
    case "lab_rotate": {
      const part = result.part;
      return typeof part === "string" && part ? cards.rotate(labelOf(part)) : null;
    }
    case "lab_load_example":
      return typeof result.name === "string" ? cards.load(EXAMPLE_TEXT[result.name] ?? result.name) : null;
    case "lab_clear":
      return result.alreadyEmpty ? null : cards.clear;
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

const PLAN_TOOLS = new Set(["lab_plan", "lab_step"]);
type Plan = { entryId: string; task: QubiTask };

export function useChatViewModel({
  suggestions = [] as string[],
  lab,
  onEvent,
}: {
  suggestions?: string[];
  lab?: ChatLab;
  // Called at every step of the loop so Qubi (the robot, the call) can follow along. Must not throw.
  onEvent?: (e: AgentEvent) => void;
} = {}) {
  const [messages, setMessages] = useState<ChatEntry[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(false);
  // The model and effort the person picked: saved in this browser (the default on the server and while loading)
  const choiceText = useSyncExternalStore(subscribeAgentChoice, readAgentChoice, () => null);
  const choice = useMemo(() => parseChoice(choiceText), [choiceText]);
  const [activeCompletion, setActiveCompletion] = useState(0);
  // Whether the person moved the selection with the arrows: only then does Enter accept instead of send
  const [picked, setPicked] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // Replies from a conversation that was cleared are dropped
  const conversation = useRef(0);
  // What the model has seen (user text, its own turns, tool results); the screen shows ChatEntry instead
  const wire = useRef<AgentMessage[]>([]);
  const noAiNoted = useRef(false);
  // Questions run one at a time: one asked while Qubi is busy waits its turn
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  // The plan Qubi is carrying out (its card is the chat entry `entryId`)
  const plan = useRef<Plan | null>(null);
  const taskCount = useRef(0);
  // The latest lab and listener, so a loop that outlives a render still reads the current ones
  const labRef = useRef(lab);
  const onEventRef = useRef(onEvent);
  const choiceRef = useRef(choice);
  // The chat entry of the run that is working now (its events update that card)
  const activeRun = useRef<string | null>(null);
  useEffect(() => {
    labRef.current = lab;
    onEventRef.current = onEvent;
    choiceRef.current = choice;
  });

  const add = (id: number, ...entries: ChatEntry[]) => {
    if (id === conversation.current) setMessages((current) => [...current, ...entries]);
  };
  const line = (role: ChatRole, text: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({ ...createMessage(role, text), ...extra });
  const emit = (event: AgentEvent) => {
    const entryId = activeRun.current;
    if (entryId) {
      const at = Date.now();
      setMessages((all) => all.map((m) => (m.id === entryId && m.run ? { ...m, run: runReducer(m.run, event, at) } : m)));
    }
    try {
      onEventRef.current?.(event);
    } catch {
      // A broken listener must never break the chat
    }
  };

  // lab_plan and lab_step: the tool checks the call, the chat keeps the plan and its card
  function runPlanTool(id: number, call: AgentToolCall): AgentToolResult {
    const out = applyAgentTool(emptyDesign(), call.name, call.input);
    const action = out.action;
    if (!out.result.ok || !action) return out.result;
    if (action.kind === "plan") {
      const task = newTask(`t${++taskCount.current}`, action.goal, action.steps);
      const entry = line("sys", action.goal, { task });
      plan.current = { entryId: entry.id, task };
      add(id, entry);
      emit({ type: "plan", goal: action.goal, steps: action.steps });
    } else if (action.kind === "step") {
      const current = plan.current;
      if (!current) return { ok: false, error: "no_plan", hint: "Call lab_plan first." };
      const next = updateTask(current.task, action.index, action.state);
      if (!next) return { ok: false, error: "unknown_step", steps: current.task.steps.length, hint: "index counts from 0 within the plan." };
      plan.current = { ...current, task: next };
      if (id === conversation.current) setMessages((all) => all.map((m) => (m.id === current.entryId ? { ...m, task: next } : m)));
      emit({ type: "step", index: action.index, state: action.state });
    }
    return out.result;
  }

  // Runs the calls in order on the bench; returns what to tell the model and the bench after them
  function runTools(id: number, calls: AgentToolCall[]): { results: AgentBlock[]; design: Design | null } {
    const results: AgentBlock[] = [];
    let design: Design | null = null;
    for (const call of calls) {
      emit({ type: "toolStart", name: call.name, input: call.input });
      let result: AgentToolResult;
      const current = labRef.current;
      if (PLAN_TOOLS.has(call.name)) {
        result = runPlanTool(id, call);
      } else if (!current) {
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
      emit({ type: "toolEnd", name: call.name, input: call.input, ok: result.ok, part: toolPart(call.name, call.input, result) });
      results.push({ type: "tool_result", tool_use_id: call.id, content: resultText(result), ...(result.ok ? {} : { is_error: true }) });
    }
    return { results, design };
  }

  // One question through the whole loop. Resolves with Qubi's final words (never rejects).
  async function run(id: number, said: string, mode: AskMode): Promise<string> {
    if (id !== conversation.current) return "";
    const spoken = mode === "voice";
    const asked = choiceRef.current;
    const card = line("bot", "", { run: newRun(Date.now(), asked) });
    activeRun.current = card.id;
    setMessages((current) => [...current, line("user", said, spoken ? { voice: true } : {}), card]);
    const before = wire.current;
    let history: AgentMessage[] = [...before, { role: "user", content: said }];
    let final = "";
    let lastStop = "end";
    let tooMany = false;
    try {
      let design = labRef.current?.design ?? emptyDesign();
      for (let step = 0; ; step++) {
        if (step >= MAX_STEPS) {
          tooMany = true;
          add(id, line("sys", labCopy.agent.tooManySteps));
          break;
        }
        emit({ type: "thinking" });
        const { reply, noAi } = await askAgent({ messages: history, design, lastUserText: said, copy: assistantCopy(design), quick: QUICK, mode, choice: asked });
        if (id !== conversation.current) return "";
        lastStop = reply.stop;
        // The rule-based assistant is no Claude: the run card must not say which model answered
        if (noAi) setMessages((all) => all.map((m) => (m.id === card.id && m.run ? { ...m, run: { ...m.run, model: undefined, effort: undefined } } : m)));
        if (noAi && !noAiNoted.current) {
          noAiNoted.current = true;
          add(id, line("sys", labCopy.agent.noAiNote));
        }
        if (reply.text) {
          final = reply.text;
          add(id, line("bot", reply.text, { ...(noAi ? { tag: labCopy.agent.noAi } : {}), ...(spoken ? { voice: true } : {}) }));
          emit({ type: "reply", text: reply.text });
        }
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
        if (id !== conversation.current) return "";
      }
      wire.current = history;
      emit({ type: "done" });
      if (final) return final;
      if (lastStop === "refusal") return labCopy.agent.refused;
      if (lastStop === "max_tokens") return labCopy.agent.cutOff;
      return tooMany ? labCopy.agent.tooManySteps : qubiCopy.tasks.doneFallback;
    } catch {
      wire.current = before;
      add(id, line("sys", labCopy.agent.failed));
      if (id === conversation.current) emit({ type: "error" });
      return labCopy.agent.failed;
    } finally {
      if (activeRun.current === card.id) activeRun.current = null;
      if (id === conversation.current) {
        pending.current = Math.max(0, pending.current - 1);
        setBusy(pending.current > 0);
      }
    }
  }

  // Ask Qubi something as if the person had written it. Resolves with his final words; "voice" mode asks
  // for 1 or 2 short spoken sentences. Safe to call from a stale closure: it only reads refs.
  function ask(text: string, { mode = "chat" }: { mode?: AskMode } = {}): Promise<string> {
    const said = text.trim();
    if (!said) return Promise.resolve("");
    const id = conversation.current;
    pending.current++;
    setBusy(true);
    const next = queue.current.then(() => run(id, said, mode));
    queue.current = next.catch(() => undefined);
    return next;
  }

  function send(text = draft) {
    if (!canSend(text, busy)) return;
    setDraft("");
    void ask(text);
  }

  // A line spoken in a call that did not go through `ask` (the ElevenLabs voice keeps its own conversation)
  function appendTranscript(role: "user" | "bot", text: string) {
    const said = text.trim();
    if (said) setMessages((current) => [...current, line(role, said, { voice: true })]);
  }

  // The composer's help: the word being typed can become a part's name
  const completionList = dismissedFor === draft ? [] : completionsFor(draft, PART_NAMES);
  const completionAt = Math.min(activeCompletion, Math.max(0, completionList.length - 1));
  const writeDraft = (text: string) => {
    setDraft(text);
    setActiveCompletion(0);
    setPicked(false);
  };
  const running = messages.findLast((m) => m.run?.status === "running")?.run ?? null;

  function updateChoice(next: AgentChoice) {
    choiceRef.current = next;
    saveAgentChoice(next);
  }

  // Saves the conversation as a text file. -> whether there was something to save
  function exportChat(): boolean {
    if (!messages.some((m) => m.role === "user" || m.role === "bot")) return false;
    const date = new Date().toLocaleDateString("es", { dateStyle: "long" });
    const text = transcript(messages, { ...chatCopy.saved, date });
    return downloadFile(chatCopy.saved.file, text, "text/markdown;charset=utf-8");
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
    setDraft: writeDraft,
    // What Qubi is doing now (null when he is not working), to show in the header
    activity: running ? currentActivity(running) : null,
    // The model picker: the options, what is chosen and how to change it
    choice,
    modelOptions: MODEL_OPTIONS,
    effortOptions: EFFORT_OPTIONS,
    setModel: (model: AgentModelId) => updateChoice({ ...choiceRef.current, model }),
    setEffort: (effort: AgentEffort) => updateChoice({ ...choiceRef.current, effort }),
    // Help while writing
    hints: analyzePrompt(draft),
    completions: completionList,
    activeCompletion: completionAt,
    completionPicked: picked,
    moveCompletion: (by: number) => {
      setPicked(true);
      setActiveCompletion((completionAt + by + completionList.length) % Math.max(1, completionList.length));
    },
    acceptCompletion: (index = completionAt) => {
      const item = completionList[index];
      if (item) writeDraft(applyCompletion(draft, item));
    },
    dismissCompletions: () => setDismissedFor(draft),
    exportChat,
    send,
    ask,
    appendTranscript,
    newConversation: () => {
      conversation.current++;
      wire.current = [];
      noAiNoted.current = false;
      plan.current = null;
      activeRun.current = null;
      pending.current = 0;
      queue.current = Promise.resolve();
      setMessages([createMessage("sys", WELCOME_TEXT)]);
      setDraft("");
      setBusy(false);
    },
    toggleMinimized: () => setMinimized((m) => !m),
    togglePinned: () => setPinned((p) => !p),
  };
}

export type ChatViewModel = ReturnType<typeof useChatViewModel>;
