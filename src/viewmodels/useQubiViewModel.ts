"use client";

// ViewModel of Qubi, the lab's agent: joins the director (what the robot does and says), the tasks he was
// given and the call. The chat feeds it with `onAgentEvent`, the call with `onCallEvent`; views read `state`
// (hand it to <QubiRobot>) and `tasks`. A timer wakes the director only when a bubble or the idle return
// is due, so nothing runs while he is at rest.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Design } from "@/models/lab/circuit";
import {
  directorReducer,
  fillTemplate,
  initialDirector,
  nextDeadline,
  pickLine,
  type CallEvent,
  type DirectorEvent,
  type DirectorState,
} from "@/models/qubi/director";
import { activeTask, summarizeTasks, tasksReducer } from "@/models/qubi/tasks";
import type { AgentEvent, QubiState, QubiTask } from "@/models/qubi/types";
import { qubiCopy } from "@/views/copy/qubi";

// Types and helpers a view may need (a view never imports models directly)
export type { AgentEvent, CallState, QubiState, QubiTask, QubiStepState } from "@/models/qubi/types";
export type { CallEvent } from "@/models/qubi/director";
export { taskProgress, type TaskProgress, type TasksSummary } from "@/models/qubi/tasks";

export type QubiOptions = {
  design: Design; // the bench now, to find the part a tool touches
  project?: string; // the name a greeting uses; defaults to "tu laboratorio"
  onCancelTask?: (id: string) => void; // so the chat can stop the agent when the person cancels
};

type Vm = { director: DirectorState; tasks: QubiTask[] };
type Action =
  | { kind: "event"; event: DirectorEvent; design: Design; now: number }
  | { kind: "cancel"; id: string; design: Design; now: number };

const initial = (): Vm => ({ director: initialDirector(), tasks: [] });

function reducer(vm: Vm, action: Action): Vm {
  const ctx = { design: action.design, now: action.now, copy: qubiCopy.director };
  if (action.kind === "cancel") {
    const tasks = tasksReducer(vm.tasks, { type: "cancel", id: action.id });
    if (tasks === vm.tasks) return vm;
    return { tasks, director: directorReducer(vm.director, { type: "cancel" }, { ...ctx, task: activeTask(tasks) }) };
  }
  const event = action.event;
  // Tasks follow the agent's events; the director gets the task they leave running, for the step lines
  const tasks =
    event.type === "plan" || event.type === "step" || event.type === "done" || event.type === "error"
      ? tasksReducer(vm.tasks, event)
      : vm.tasks;
  const director = directorReducer(vm.director, event, { ...ctx, task: activeTask(tasks) });
  return tasks === vm.tasks && director === vm.director ? vm : { tasks, director };
}

export function useQubiViewModel({ design, project, onCancelTask }: QubiOptions) {
  const [vm, dispatch] = useReducer(reducer, undefined, initial);
  // Events come from async code, so they read the bench through a ref instead of a stale closure
  const designRef = useRef(design);
  const tasksRef = useRef(vm.tasks);
  useEffect(() => {
    tasksRef.current = vm.tasks;
  }, [vm.tasks]);

  const send = useCallback((event: DirectorEvent) => {
    dispatch({ kind: "event", event, design: designRef.current, now: Date.now() });
  }, []);

  // A part a tool just added reaches the design a moment after the tool's result: let the director look again
  useEffect(() => {
    designRef.current = design;
    dispatch({ kind: "event", event: { type: "design" }, design, now: Date.now() });
  }, [design]);

  // Wake the director when a bubble or the idle return is due
  const deadline = nextDeadline(vm.director);
  useEffect(() => {
    if (deadline === null) return;
    const wait = Math.max(0, deadline - Date.now()) + 15;
    const timer = setTimeout(() => send({ type: "tick", now: Date.now() }), wait);
    return () => clearTimeout(timer);
  }, [deadline, send]);

  const onAgentEvent = useCallback((event: AgentEvent) => send(event), [send]);
  const onCallEvent = useCallback((event: Omit<CallEvent, "type"> & { type?: "call" }) => send({ ...event, type: "call" }), [send]);

  const greet = useCallback(() => {
    const line = pickLine(qubiCopy.greetings.chat, Math.random());
    if (line) send({ type: "greet", text: fillTemplate(line, { project: project ?? qubiCopy.greetings.project }) });
  }, [project, send]);

  // The first line of a call, for the voice agent to say when it picks up
  const callGreeting = useCallback(
    () => fillTemplate(pickLine(qubiCopy.greetings.call, Math.random()) ?? "", { project: project ?? qubiCopy.greetings.project }),
    [project],
  );

  const cancelTask = useCallback(
    (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      dispatch({ kind: "cancel", id, design: designRef.current, now: Date.now() });
      if (task && (task.state === "planning" || task.state === "working")) onCancelTask?.(id);
    },
    [onCancelTask],
  );

  const state: QubiState = vm.director;
  const summary = useMemo(() => summarizeTasks(vm.tasks), [vm.tasks]);
  return {
    state,
    tasks: vm.tasks,
    summary,
    onAgentEvent,
    onCallEvent,
    greet,
    callGreeting,
    cancelTask,
  };
}

export type QubiViewModel = ReturnType<typeof useQubiViewModel>;
