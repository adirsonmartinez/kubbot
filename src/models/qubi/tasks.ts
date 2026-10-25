// Qubi's tasks: a goal he turns into a plan with visible steps. The reducer follows the agent loop's
// `plan` and `step` events, ends the task when the turn ends, and lets the person cancel it. Pure: no React,
// no clock (ids come from a counter), so it is tested alone.

import type { AgentEvent, QubiStepState, QubiTask } from "./types.ts";

export const TASK_LIMITS = { tasks: 20, steps: 12, text: 140 };

// Everything the tasks reducer understands: the agent's events plus the person's cancel
export type TaskEvent = AgentEvent | { type: "cancel"; id: string };

const ACTIVE: ReadonlySet<QubiTask["state"]> = new Set(["planning", "working"]);
export const isActive = (task: QubiTask): boolean => ACTIVE.has(task.state);

const clean = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TASK_LIMITS.text);

// The task a `step` event is about: the newest one still running
export function activeTask(tasks: readonly QubiTask[]): QubiTask | null {
  for (let i = tasks.length - 1; i >= 0; i--) if (isActive(tasks[i])) return tasks[i];
  return null;
}

function nextId(tasks: readonly QubiTask[]): string {
  const top = tasks.reduce((max, t) => Math.max(max, Number(/^task-(\d+)$/.exec(t.id)?.[1] ?? 0)), 0);
  return `task-${top + 1}`;
}

// Replaces one task, leaving the rest untouched
const mapTask = (tasks: QubiTask[], id: string, fn: (t: QubiTask) => QubiTask): QubiTask[] =>
  tasks.map((t) => (t.id === id ? fn(t) : t));

// The state a task settles in when the agent stops: all steps done, a failed step, or left half-way
function settled(task: QubiTask): QubiTask["state"] {
  if (task.steps.some((s) => s.state === "failed")) return "failed";
  return task.steps.every((s) => s.state === "done") ? "done" : "failed";
}

export function tasksReducer(tasks: QubiTask[], event: TaskEvent): QubiTask[] {
  switch (event.type) {
    case "plan": {
      const steps = event.steps.map(clean).filter(Boolean).slice(0, TASK_LIMITS.steps);
      const goal = clean(event.goal);
      if (!steps.length || !goal) return tasks;
      // A new plan replaces any plan that was still running
      const older = tasks.map((t): QubiTask => (isActive(t) ? { ...t, state: "cancelled" } : t));
      const task: QubiTask = {
        id: nextId(tasks),
        goal,
        steps: steps.map((text) => ({ text, state: "pending" })),
        state: "planning",
      };
      return [...older, task].slice(-TASK_LIMITS.tasks);
    }
    case "step": {
      const task = activeTask(tasks);
      if (!task || !Number.isInteger(event.index) || !task.steps[event.index]) return tasks;
      return mapTask(tasks, task.id, (t) => {
        const steps = t.steps.map((s, i) => (i === event.index ? { ...s, state: event.state } : s));
        const finished = steps.every((s) => s.state === "done");
        return { ...t, steps, state: finished ? "done" : "working" };
      });
    }
    case "done":
    case "error": {
      const task = activeTask(tasks);
      if (!task) return tasks;
      return mapTask(tasks, task.id, (t) => ({ ...t, state: event.type === "error" ? "failed" : settled(t) }));
    }
    case "cancel": {
      const task = tasks.find((t) => t.id === event.id);
      if (!task || !isActive(task)) return tasks;
      return mapTask(tasks, task.id, (t) => ({ ...t, state: "cancelled" }));
    }
    default:
      return tasks;
  }
}

export type TaskProgress = {
  done: number;
  failed: number;
  total: number;
  percent: number; // 0..100
  current: number | null; // index of the step being done, else the first pending one
  currentText: string | null;
};

export function taskProgress(task: QubiTask): TaskProgress {
  const count = (state: QubiStepState) => task.steps.filter((s) => s.state === state).length;
  const total = task.steps.length;
  const done = count("done");
  const doing = task.steps.findIndex((s) => s.state === "doing");
  const pending = task.steps.findIndex((s) => s.state === "pending");
  const current = isActive(task) ? (doing >= 0 ? doing : pending >= 0 ? pending : null) : null;
  return {
    done,
    failed: count("failed"),
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    current,
    currentText: current === null ? null : task.steps[current].text,
  };
}

export type TasksSummary = { total: number; active: number; done: number; failed: number; cancelled: number; current: QubiTask | null };

export function summarizeTasks(tasks: readonly QubiTask[]): TasksSummary {
  const count = (state: QubiTask["state"]) => tasks.filter((t) => t.state === state).length;
  return {
    total: tasks.length,
    active: tasks.filter(isActive).length,
    done: count("done"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    current: activeTask(tasks),
  };
}
