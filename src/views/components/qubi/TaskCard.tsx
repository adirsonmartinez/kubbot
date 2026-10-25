// A task Qubi was given, as a card in the chat: the goal and its steps, each with the icon of its state.
// Presentational only. Quiet like the rest of the glass UI: only the step in progress and a failure stand out.

import type { CSSProperties } from "react";
import type { QubiStepState, QubiTask } from "@/viewmodels/useChatViewModel";
import { qubiCopy } from "@/views/copy/qubi";
import { Icon } from "../Icon";

const copy = qubiCopy.tasks;
const RED = "#ff6b6b";

const CARD: CSSProperties = {
  alignSelf: "stretch",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 14px",
  borderRadius: "var(--lg-r-block)",
  background: "var(--lg-card)",
  boxShadow: "var(--lg-rim)",
  color: "var(--lg-text-2)",
  font: "13px/1.4 var(--lg-font)",
  animation: "rise 0.25s var(--lg-ease)",
};
const TOP: CSSProperties = { display: "flex", alignItems: "center", gap: 8, font: "600 11px/1 var(--lg-font)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--lg-muted)" };
const LIST: CSSProperties = { display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0, listStyle: "none" };
const ROW: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9 };
const ICON: CSSProperties = { flex: "none", width: 16, height: 16, marginTop: 1, display: "grid", placeItems: "center" };
const RING: CSSProperties = { boxSizing: "border-box", width: 12, height: 12, borderRadius: "50%" };

function StepIcon({ state }: { state: QubiStepState }) {
  switch (state) {
    case "done":
      return <span style={{ ...ICON, color: "var(--lg-text)" }}><Icon name="check" size={16} /></span>;
    case "failed":
      return <span style={{ ...ICON, color: RED }}><Icon name="alert" size={16} /></span>;
    case "doing":
      return (
        <span style={ICON}>
          <span style={{ ...RING, border: "2px solid var(--lg-line)", borderTopColor: "var(--lg-text)", animation: "lab-spin 0.8s linear infinite" }} />
        </span>
      );
    default:
      return (
        <span style={ICON}>
          <span style={{ ...RING, border: "1.5px solid var(--lg-faint)", opacity: 0.6 }} />
        </span>
      );
  }
}

const stepColor = (state: QubiStepState): string => (state === "doing" ? "var(--lg-text)" : state === "failed" ? RED : state === "done" ? "var(--lg-muted)" : "var(--lg-text-2)");

export function TaskCard({ task }: { task: QubiTask }) {
  const done = task.steps.filter((s) => s.state === "done").length;
  const ratio = task.steps.length ? done / task.steps.length : 0;
  return (
    <section style={CARD} aria-label={`${copy.label}: ${task.goal}`}>
      <div style={TOP}>
        <Icon name="sparkles" size={13} />
        <span>{copy.label}</span>
        <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, font: "500 11px/1 var(--lg-font)", color: task.state === "failed" ? RED : "var(--lg-muted)" }}>
          {copy.state[task.state]} · {copy.progress(done, task.steps.length)}
        </span>
      </div>
      <strong style={{ color: "var(--lg-text)", font: "600 14px/1.35 var(--lg-font)" }}>{task.goal}</strong>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={task.steps.length}
        aria-valuenow={done}
        style={{ height: 3, borderRadius: 99, background: "var(--lg-line)", overflow: "hidden" }}
      >
        <div style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", borderRadius: 99, background: task.state === "failed" ? RED : "var(--lg-text)", transition: "width 0.4s var(--lg-ease)" }} />
      </div>
      <ol style={LIST}>
        {task.steps.map((step, i) => (
          <li key={i} style={ROW} aria-label={`${step.text}: ${copy.step[step.state]}`}>
            <StepIcon state={step.state} />
            <span style={{ color: stepColor(step.state), textDecoration: step.state === "done" ? "none" : undefined }}>{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
