"use client";

// The card of one answer: who works, which model and effort, how long it takes and each step Qubi took.
// While he works it shows what he is doing in a pill with a thinking orb (the orb only after 2 seconds:
// a shorter wait gets nothing). Once done, the steps fold into a one-line recap. Real events only: the
// run comes from the agent loop (see models/runStory).

import { useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  ORB_AFTER_MS,
  currentActivity,
  formatSeconds,
  orbOf,
  stepMs,
  summarize,
  type RunState,
  type RunStep,
} from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";
import { Icon } from "../Icon";
import { useNow } from "./hooks";

const copy = chatCopy.run;

function StepRow({ step, now }: { step: RunStep; now: number }) {
  const label = copy.tools[step.tool] ?? copy.toolDefault;
  const text = step.status === "running" ? label.now : label.done;
  const ms = stepMs(step, now);
  return (
    <li className={`run-step ${step.status}`} aria-label={`${text}: ${copy.stepState[step.status]}`}>
      <span className="run-step-icon" aria-hidden>
        {step.status === "running" ? <span className="run-spin" /> : <Icon name={step.status === "failed" ? "alert" : "check"} size={13} />}
      </span>
      <span className="run-step-name">{text}</span>
      {step.status !== "running" && ms >= 100 && <span className="run-step-time">{formatSeconds(ms)}</span>}
    </li>
  );
}

export function RunCard({ run }: { run: RunState }) {
  const running = run.status === "running";
  const now = useNow(running);
  // The person's own choice to open or fold the steps; until then they are open while it works
  const [fold, setFold] = useState<boolean | null>(null);
  const open = fold ?? running;
  const { steps, failed, ms } = summarize(run, now);
  const activity = currentActivity(run);
  const label = chatCopy.activity[activity];
  const orbOn = running && now - run.startedAt >= ORB_AFTER_MS;
  const model = run.model ? chatCopy.picker.models[run.model]?.name : undefined;
  const effort = run.effort ? chatCopy.picker.efforts[run.effort]?.name : undefined;
  // A step the checker stopped is part of the work (Qubi then fixes it): the run itself is done unless it broke off
  const state = running ? null : run.status === "error" ? copy.stopped : copy.done;
  const listId = `run-steps-${steps}-${run.startedAt}`;

  return (
    <section className={`run-card ${run.status}`} aria-label={copy.label} aria-busy={running}>
      <header className="run-head">
        <span className="run-badge" aria-hidden>
          <Icon name={run.status === "error" ? "alert" : running ? "bot" : "check"} size={16} />
        </span>
        <div className="run-who">
          <strong>{copy.title}</strong>
          {(model || effort) && <span className="run-model">{[model, effort].filter(Boolean).join(" · ")}</span>}
        </div>
        {state && <span className="run-state">{state}</span>}
        <span className="run-time" aria-hidden={running}>
          {formatSeconds(ms)}
        </span>
      </header>

      {running && (
        <div className="run-pill" data-activity={activity}>
          <span className="run-orb" aria-hidden>
            {orbOn && <ThinkingOrb state={orbOf(activity)} size={20} theme="dark" aria-hidden="true" />}
          </span>
          <span>{label}</span>
        </div>
      )}

      {steps > 0 && (
        <>
          <button type="button" className="run-fold" aria-expanded={open} aria-controls={listId} onClick={() => setFold(!open)}>
            <span className="run-chevron" aria-hidden />
            <span>
              {copy.steps(steps)}
              {failed > 0 && !running ? ` · ${copy.pending(failed)}` : ""}
            </span>
            <span className="run-sr">{open ? copy.hide : copy.show}</span>
          </button>
          {open && (
            <ol id={listId} className="run-steps">
              {run.steps.map((s) => (
                <StepRow key={s.id} step={s} now={now} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
