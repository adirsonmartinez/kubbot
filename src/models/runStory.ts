// The "run" of one question to Qubi: what he did between the person's message and his answer, told from
// the agent loop's events (AgentEvent). It feeds the run card in the chat: the steps with their time, what
// he is doing right now (which picks the thinking orb) and the final state. No React, no I/O.

import type { AgentEvent } from "./qubi/types.ts";

// What Qubi is busy with; the view turns it into a sentence (copy) and an orb
export type RunActivity = "thinking" | "writing" | "looking" | "building" | "wiring" | "example" | "simulating" | "enclosure" | "sketch" | "planning";

// The animation of a thinking orb (the names thinking-orbs uses); the view passes them on
export type OrbKind = "working" | "searching" | "solving" | "listening" | "connecting" | "weaving" | "composing" | "breathing" | "shaping";

export const ACTIVITY_ORB: Record<RunActivity, OrbKind> = {
  thinking: "breathing",
  writing: "composing",
  looking: "searching",
  building: "working",
  wiring: "connecting",
  example: "shaping",
  simulating: "solving",
  enclosure: "shaping",
  sketch: "composing",
  planning: "weaving",
};

const TOOL_ACTIVITY: Record<string, RunActivity> = {
  lab_catalog: "looking",
  lab_view: "looking",
  lab_add_part: "building",
  lab_remove: "building",
  lab_move: "building",
  lab_rotate: "building",
  lab_focus: "building",
  lab_clear: "building",
  lab_connect: "wiring",
  lab_auto_wire: "wiring",
  lab_load_example: "example",
  lab_simulate: "simulating",
  lab_make_enclosure: "enclosure",
  lab_make_sketch: "sketch",
  lab_plan: "planning",
};

// lab_step only marks the progress of a plan (the task card shows it): it is not a step of its own
const SILENT_TOOLS = new Set(["lab_step"]);

export const activityOfTool = (tool: string): RunActivity => TOOL_ACTIVITY[tool] ?? "building";

export type RunStepStatus = "running" | "done" | "failed";
export type RunStep = {
  id: number;
  tool: string;
  activity: RunActivity;
  status: RunStepStatus;
  startedAt: number;
  endedAt?: number;
  part?: string; // the part it worked on, when the tool says so
};

export type RunState = {
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  // Waiting for the model (no tool running right now)
  thinking: boolean;
  steps: RunStep[];
  // How many times the model has spoken in this run
  replies: number;
  // The model and effort that answered (ids; the view shows their names)
  model?: string;
  effort?: string;
};

export function newRun(now: number, who: { model?: string; effort?: string } = {}): RunState {
  return { status: "running", startedAt: now, thinking: true, steps: [], replies: 0, ...who };
}

function finish(run: RunState, status: "done" | "error", now: number): RunState {
  if (run.status !== "running") return run;
  // A step still running when the run ends did not finish
  const steps = run.steps.map((s) => (s.status === "running" ? { ...s, status: "failed" as const, endedAt: now } : s));
  return { ...run, status, steps, thinking: false, endedAt: now };
}

export function runReducer(run: RunState, event: AgentEvent, now: number): RunState {
  if (run.status !== "running") return run;
  switch (event.type) {
    case "thinking":
      return { ...run, thinking: true };
    case "toolStart": {
      if (SILENT_TOOLS.has(event.name)) return { ...run, thinking: false };
      const step: RunStep = { id: run.steps.length, tool: event.name, activity: activityOfTool(event.name), status: "running", startedAt: now };
      return { ...run, thinking: false, steps: [...run.steps, step] };
    }
    case "toolEnd": {
      if (SILENT_TOOLS.has(event.name)) return run;
      const at = run.steps.findIndex((s) => s.tool === event.name && s.status === "running");
      if (at < 0) return run;
      const steps = run.steps.slice();
      steps[at] = { ...steps[at], status: event.ok ? "done" : "failed", endedAt: now, ...(event.part ? { part: event.part } : {}) };
      // The model gets the results and thinks again
      return { ...run, steps, thinking: !steps.some((s) => s.status === "running") };
    }
    case "reply":
      return { ...run, replies: run.replies + 1, thinking: false };
    case "done":
      return finish(run, "done", now);
    case "error":
      return finish(run, "error", now);
    default:
      return run; // plan and step: the task card shows them
  }
}

// What Qubi is doing now: the tool that runs, else waiting for the model, else writing his answer
export function currentActivity(run: RunState): RunActivity {
  const running = run.steps.findLast((s) => s.status === "running");
  if (running) return running.activity;
  return run.thinking ? "thinking" : "writing";
}

export const orbOf = (activity: RunActivity): OrbKind => ACTIVITY_ORB[activity];

export function elapsedMs(run: RunState, now: number): number {
  return Math.max(0, (run.endedAt ?? now) - run.startedAt);
}

export function stepMs(step: RunStep, now: number): number {
  return Math.max(0, (step.endedAt ?? now) - step.startedAt);
}

// "3,2 s" (Spanish decimals); under a tenth of a second shows nothing worth reading
export function formatSeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 0.1) return "0,1 s";
  return `${s < 10 ? s.toFixed(1).replace(".", ",") : Math.round(s)} s`;
}

export type RunSummary = { steps: number; failed: number; ms: number };
export function summarize(run: RunState, now: number): RunSummary {
  return { steps: run.steps.length, failed: run.steps.filter((s) => s.status === "failed").length, ms: elapsedMs(run, now) };
}

// The orb of a run appears only when the wait is long enough to matter (a flash of an orb reads as a glitch)
export const ORB_AFTER_MS = 2000;
// The beam on the composer only after a longer wait
export const BEAM_AFTER_MS = 3000;
export const waitedMs = (since: number, now: number): number => Math.max(0, now - since);
