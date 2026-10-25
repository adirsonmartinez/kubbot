// The rule-based assistant: what the chat answers when there is no AI key. It reads the person's words
// for a few intents (ideas, wire it, review, simulate, box, code) and answers from the bench. It never
// invents wiring: "conecta" asks for the same lab_auto_wire the real agent would call, so the checker
// still has the last word. All visible text comes in through AssistantCopy (the view model passes
// labCopy), so this module has no copy and no view imports.

import { componentOf } from "./catalog.ts";
import { checkDesign, type Design, type Issue } from "./circuit.ts";
import type { AgentToolCall } from "./agentTools.ts";

export type AssistantIntent = "wire" | "review" | "ideas" | "simulate" | "enclosure" | "sketch" | "hint";

export type IdeaKey =
  | "distanceAlarm" | "plantCare" | "nightLight" | "motionLight" | "weatherStation"
  | "radar" | "knobServo" | "robotCar" | "doorbell";

// Each idea needs only catalog parts (checked by the tests). The board is chosen separately.
export const IDEAS: { key: IdeaKey; needs: string[] }[] = [
  { key: "distanceAlarm", needs: ["hc-sr04", "buzzer"] },
  { key: "plantCare", needs: ["soil", "led"] },
  { key: "nightLight", needs: ["ldr", "led"] },
  { key: "motionLight", needs: ["pir", "led"] },
  { key: "weatherStation", needs: ["dht22", "lcd-1602-i2c"] },
  { key: "radar", needs: ["hc-sr04", "servo-sg90"] },
  { key: "knobServo", needs: ["potentiometer", "servo-sg90"] },
  { key: "robotCar", needs: ["l298n", "hc-sr04"] },
  { key: "doorbell", needs: ["button", "buzzer"] },
];

// Ideas to offer when the bench is empty: the easiest first
const STARTERS: IdeaKey[] = ["nightLight", "distanceAlarm", "weatherStation"];
const MAX_IDEAS = 3;

export type AssistantCopy = {
  partName: (type: string) => string;
  hint: string;
  noBoard: string;
  nothingToWire: string;
  wiring: string;
  allGood: string;
  issuesIntro: (count: number) => string;
  issue: (issue: Issue) => string;
  ideasIntro: (have: string[]) => string;
  ideasEmpty: string;
  // One idea as a short plain sentence; `missing` are the names of the parts still to add
  idea: (key: IdeaKey, missing: string[]) => string;
  simulating: string;
  simulateBlocked: string;
  enclosure: string;
  sketch: string;
};

export type AssistantReply = { text: string; toolCalls: AgentToolCall[]; intent: AssistantIntent };

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const RULES: [AssistantIntent, RegExp][] = [
  ["wire", /\bconect|\bcabl|\bunel|\bunir\b|\bune\b|conectalo/],
  ["review", /\brevis|\bverific|\bcheq|\berror|\bproblem|esta bien|funcionara|\bcomprueb/],
  ["simulate", /\bsimul|\barranc|\bprueba(lo|la)?\b|\bponlo a funcionar|\bcorre\b/],
  ["enclosure", /\bcaja|\bcarcasa|\bimprim|\bstl\b|\bcase\b/],
  ["sketch", /\bcodigo|\bsketch|\bprograma|\b\.?ino\b/],
  ["ideas", /\bidea|\bconstru|\bproyecto|\bque puedo|\bsugier|\brecomien|\bhacer\b|\barma(r|lo)?\b/],
];

export function intentOf(message: string): AssistantIntent {
  const q = plain(message);
  return RULES.find(([, re]) => re.test(q))?.[0] ?? "hint";
}

// Ideas ranked by how many of their parts are already on the bench (all of them first)
export function ideasFor(design: Design): { key: IdeaKey; missing: string[]; have: number }[] {
  const onBench = new Set(design.parts.map((p) => p.type));
  return IDEAS.map((idea) => ({
    key: idea.key,
    missing: idea.needs.filter((n) => !onBench.has(n)),
    have: idea.needs.filter((n) => onBench.has(n)).length,
  }))
    .filter((i) => i.have > 0)
    .sort((a, b) => a.missing.length - b.missing.length || b.have - a.have)
    .slice(0, MAX_IDEAS);
}

const hasBoard = (design: Design) => design.parts.some((p) => componentOf(p.type)?.kind === "board");
const call = (name: string, input: Record<string, unknown> = {}): AgentToolCall => ({ id: `rule-${name}`, name, input });

export function assist(message: string, design: Design, copy: AssistantCopy): AssistantReply {
  const intent = intentOf(message);
  const reply = (text: string, toolCalls: AgentToolCall[] = []): AssistantReply => ({ text, toolCalls, intent });
  switch (intent) {
    case "wire": {
      if (!hasBoard(design)) return reply(copy.noBoard);
      if (!design.parts.some((p) => componentOf(p.type)?.kind === "part")) return reply(copy.nothingToWire);
      return reply(copy.wiring, [call("lab_auto_wire", { part: "all" })]);
    }
    case "review": {
      const { issues } = checkDesign(design);
      if (!design.parts.length) return reply(copy.hint);
      if (!issues.length) return reply(copy.allGood);
      return reply([copy.issuesIntro(issues.length), ...issues.map((i) => `• ${copy.issue(i)}`)].join("\n"));
    }
    case "simulate": {
      if (!hasBoard(design)) return reply(copy.noBoard);
      if (checkDesign(design).level === "red") return reply(copy.simulateBlocked);
      return reply(copy.simulating, [call("lab_simulate")]);
    }
    case "enclosure":
      return hasBoard(design) ? reply(copy.enclosure, [call("lab_make_enclosure")]) : reply(copy.noBoard);
    case "sketch":
      return hasBoard(design) ? reply(copy.sketch, [call("lab_make_sketch")]) : reply(copy.noBoard);
    case "ideas": {
      const found = ideasFor(design);
      if (!found.length) {
        const lines = STARTERS.map((key) => `• ${copy.idea(key, [])}`);
        return reply([copy.ideasEmpty, ...lines].join("\n"));
      }
      const have = [...new Set(design.parts.map((p) => p.type))].map((t) => copy.partName(t));
      const lines = found.map((i) => `• ${copy.idea(i.key, i.missing.map((m) => copy.partName(m)))}`);
      return reply([copy.ideasIntro(have), ...lines].join("\n"));
    }
    default:
      return reply(copy.hint);
  }
}
