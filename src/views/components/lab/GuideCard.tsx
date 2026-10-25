"use client";

// The wiring help card, a floating glass panel in the stage's free column (below the health pill). With a part selected it says what
// the part does, what each of its pins does and whether it is wired, and offers two ways to wire it:
// «Muéstrame cómo conectarlo» (step by step, each step with its why) and «Conéctalo por mí». With the
// guide running it shows the current step: Anterior / Siguiente, and a button that does the step itself.
// Presentational: a slice of the lab view model in, clicks out. Mount it inside the stage column.

import { useState } from "react";
import type { LabViewModel } from "@/viewmodels/useLabViewModel";
import { pinsCopy } from "@/views/copy/pins";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";

export type GuideSlice = Pick<
  LabViewModel,
  "help" | "guide" | "startGuide" | "nextGuide" | "prevGuide" | "goGuide" | "endGuide" | "guideDo" | "acceptSuggestions" | "select"
>;

const t = pinsCopy;

function StepView({ vm, guide }: { vm: GuideSlice; guide: NonNullable<GuideSlice["guide"]> }) {
  const { step } = guide;
  return (
    <>
      <div className="lab-guide-steps" role="group" aria-label={t.guide.stepsLabel}>
        <span className="lab-guide-count">{t.guide.step(guide.number, guide.total)}</span>
        <span className="lab-guide-dots">
          {guide.steps.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`lab-guide-dot${s.done ? " done" : ""}${s.current ? " current" : ""}`}
              aria-label={t.guide.goTo(i + 1)}
              aria-current={s.current ? "step" : undefined}
              onClick={() => vm.goGuide(i)}
            />
          ))}
        </span>
      </div>

      <p className="lab-guide-do" aria-live="polite">
        {step.title}
      </p>
      <div className="lab-guide-pin">
        <b>
          {step.pin} · {step.pinName}
        </b>
        <span>{step.pinDoes}</span>
      </div>
      <p className="lab-guide-why">{step.reason}</p>
      {step.note && <p className="lab-guide-note">{step.note}</p>}
      {!step.done && <p className="lab-guide-how">{t.guide.how}</p>}

      <div className="lab-guide-actions stack">
        {!step.done && (
          <button type="button" className="lab-guide-btn strong" onClick={() => vm.guideDo()}>
            <Icon name="plug" size={15} />
            {t.guide.doStep}
          </button>
        )}
        <div className="lab-guide-nav">
          <button type="button" className="lab-guide-btn" onClick={() => vm.prevGuide()} disabled={guide.isFirst}>
            {t.guide.prev}
          </button>
          <button type="button" className="lab-guide-btn" onClick={() => vm.nextGuide()}>
            {guide.isLast ? t.guide.finish : t.guide.next}
          </button>
        </div>
      </div>
    </>
  );
}

function PartView({ vm, help }: { vm: GuideSlice; help: NonNullable<GuideSlice["help"]> }) {
  if (help.isBoard) {
    return (
      <>
        <p className="lab-guide-does">{help.does}</p>
        <p className="lab-guide-sub">{t.card.wiredParts(help.wiredParts)}</p>
        <h4 className="lab-guide-h">{t.card.boardIntro}</h4>
        <ul className="lab-guide-pins">
          {help.legend.map((row) => (
            <li key={row.role} className="lab-guide-pinrow">
              <b>
                {row.title} <em>{row.pins.length > 6 ? t.card.boardPins(row.pins.length) : row.pins.join(" ")}</em>
              </b>
              <span>{row.does}</span>
            </li>
          ))}
        </ul>
        {help.pending > 0 && (
          <div className="lab-guide-actions">
            <button type="button" className="lab-guide-btn strong" onClick={() => vm.acceptSuggestions(help.part)}>
              <Icon name="plug" size={15} />
              {t.card.connectAll}
            </button>
          </div>
        )}
      </>
    );
  }
  const complete = help.pins.every((p) => p.connected);
  return (
    <>
      <p className="lab-guide-does">{help.does}</p>
      <h4 className="lab-guide-h">{t.card.pinsTitle}</h4>
      <ul className="lab-guide-pins">
        {help.pins.map((pin) => (
          <li key={pin.pin} className="lab-guide-pinrow" data-state={pin.connected ? "ok" : "todo"}>
            <b>
              <span className="lab-guide-state" aria-hidden />
              {pin.pin} · {pin.name}
            </b>
            <span>{pin.does}</span>
            <small>{pin.connected ? pin.connectedTo : [pin.required ? t.card.missing : t.card.optionalMissing, pin.hint].filter(Boolean).join(" · ")}</small>
          </li>
        ))}
      </ul>
      {!help.hasBoard ? (
        <p className="lab-guide-sub">{t.card.noBoard}</p>
      ) : complete ? (
        <p className="lab-guide-done">
          <Icon name="check" size={16} />
          {t.card.allDone}
        </p>
      ) : (
        <div className="lab-guide-actions stack">
          <button type="button" className="lab-guide-btn strong" onClick={() => vm.startGuide(help.part)}>
            <Icon name="locate" size={15} />
            {t.card.showMe}
          </button>
          <button type="button" className="lab-guide-btn" onClick={() => vm.acceptSuggestions(help.part)} disabled={help.pending === 0}>
            <Icon name="plug" size={15} />
            {t.card.doItForMe}
          </button>
        </div>
      )}
    </>
  );
}

// Under this window width the card opens folded (just its title), so it leaves the bench in view
const NARROW = 1400;

export function GuideCard({ vm }: { vm: GuideSlice }) {
  const { help, guide } = vm;
  const [folded, setFolded] = useState(() => typeof window !== "undefined" && window.innerWidth < NARROW); // it only mounts once a part is picked, in the browser
  if (!guide && !help) return null;

  const name = guide ? guide.partName : (help?.name ?? "");
  return (
    <aside className="lab-guide glass-panel" aria-label={t.card.region} data-mode={guide ? "guide" : "help"}>
      <header className="lab-guide-head">
        <span className="lab-guide-icon" aria-hidden>
          <Icon name={guide ? "locate" : "info"} size={16} />
        </span>
        <h3 className="lab-guide-title">{guide ? t.guide.title(name) : name}</h3>
        <button
          type="button"
          className="lab-guide-x"
          aria-label={guide ? t.guide.exit : folded ? t.card.show : t.card.hide}
          title={guide ? t.guide.exit : folded ? t.card.show : t.card.hide}
          aria-expanded={guide ? undefined : !folded}
          onClick={() => (guide ? vm.endGuide() : setFolded((f) => !f))}
        >
          <Icon name={guide ? "close" : "chevronDown"} size={14} />
        </button>
      </header>
      {(guide || !folded) && <div className="lab-guide-body">{guide ? <StepView vm={vm} guide={guide} /> : help && <PartView vm={vm} help={help} />}</div>}
    </aside>
  );
}
