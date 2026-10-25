"use client";

// "Revisión del circuito": the checker's findings in plain words, red first. A click on a finding
// selects its part on the bench; "Arreglar con Qubi" asks the chat agent to fix them.

import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";
import { reviewCounts, reviewRows } from "./labText";

export type CheckSlice = Pick<LabViewModel, "design" | "check" | "issuesText" | "partLabel" | "select">;

export function CheckPanel({ vm, onAsk }: { vm: CheckSlice; onAsk: (prompt: string) => void }) {
  const rows = reviewRows(vm.issuesText, new Set(vm.design.parts.map((p) => p.id)));
  const counts = reviewCounts(rows);
  const empty = vm.design.parts.length === 0;
  const level = counts.red ? "red" : counts.yellow ? "yellow" : "green";

  return (
    <div className="lab-review" data-level={level}>
      <header className="lab-review-head">
        <h3 className="lab-review-title">{labCopy.check.title}</h3>
        {rows.length > 0 && <span className={`lab-review-count ${level}`}>{counts.text}</span>}
      </header>

      {empty ? (
        <p className="lab-review-ok">{labCopy.bench.empty}</p>
      ) : rows.length === 0 ? (
        <p className="lab-review-ok">
          <span className="lab-ok-mark">
            <Icon name="check" size={16} />
          </span>
          {labCopy.check.ok}
        </p>
      ) : (
        <>
          <ul className="lab-issues">
            {rows.map((row) => (
              <li key={row.id}>
                {row.part ? (
                  <button
                    type="button"
                    className="lab-issue"
                    onClick={() => vm.select(row.part)}
                    aria-label={`${row.text} ${labCopy.panel.showPart(vm.partLabel(row.part))}`}
                  >
                    <span className={`lab-dot ${row.level}`} aria-hidden />
                    <span>{row.text}</span>
                  </button>
                ) : (
                  <div className="lab-issue static">
                    <span className={`lab-dot ${row.level}`} aria-hidden />
                    <span>{row.text}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="lab-fix" onClick={() => onAsk(labCopy.prompts.review)}>
            <Icon name="sparkles" size={15} />
            {labCopy.check.fix}
          </button>
        </>
      )}

      {vm.check.budget.length > 0 && (
        <div className="lab-budgets">
          {vm.check.budget.map((b) => {
            const ratio = b.budgetMa > 0 ? b.usedMa / b.budgetMa : 0;
            return (
              <div key={b.board} className={`lab-budget${ratio > 1 ? " over" : ""}`}>
                <span className="lab-budget-label">
                  {labCopy.labUi.budget(vm.partLabel(b.board))}
                  <b>{labCopy.labUi.budgetValue(b.usedMa, b.budgetMa)}</b>
                </span>
                <span
                  className="lab-budget-bar"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={b.budgetMa}
                  aria-valuenow={Math.min(b.usedMa, b.budgetMa)}
                  aria-label={labCopy.labUi.budget(vm.partLabel(b.board))}
                >
                  <i style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
