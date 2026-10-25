"use client";

// WelcomeCard: the glass card where Qubi interviews the person on the first visit. One question at a time
// (what to build, then how much Arduino they know), progress dots and a skip. When the answers are in it
// offers to start; the view model turns that into the example on the bench and the request to Qubi.

import { useState } from "react";
import type { OnboardingViewModel, BuildIntent, ExperienceLevel } from "@/viewmodels/useOnboardingViewModel";
import { welcomeCopy } from "@/views/copy/welcome";
import "@/views/styles/welcome.css";

export type WelcomeSlice = Pick<OnboardingViewModel, "welcome" | "answerBuild" | "answerExperience" | "back" | "skipWelcome" | "finishWelcome">;

const BUILD_OPTIONS: { value: BuildIntent; label: string }[] = [
  { value: "medir distancia", label: welcomeCopy.options.medirDistancia },
  { value: "cuidar plantas", label: welcomeCopy.options.cuidarPlantas },
  { value: "clima de mi cuarto", label: welcomeCopy.options.climaCuarto },
  { value: "alarma de movimiento", label: welcomeCopy.options.alarmaMovimiento },
  { value: "un robot que se mueve", label: welcomeCopy.options.robotQueSeMueve },
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: "nunca", label: welcomeCopy.experienceOptions.nunca },
  { value: "un poco", label: welcomeCopy.experienceOptions.unPoco },
  { value: "sí", label: welcomeCopy.experienceOptions.si },
];

export function WelcomeCard({ vm }: { vm: WelcomeSlice }) {
  const { welcome } = vm;
  const [other, setOther] = useState(false); // "Otra cosa" asks for a sentence first
  const [freeText, setFreeText] = useState("");

  // 0 = what to build, 1 = experience, 2 = done
  const question = welcome.step === 0 ? 0 : welcome.step === 1 ? 1 : 2;
  const dot = (n: number) => (question === n ? "now" : "done");

  return (
    <div className="welcome-layer">
      <div className="welcome-card" role="dialog" aria-label={welcomeCopy.aria}>
        <div className="welcome-head">
          <h2 className="welcome-title">{welcomeCopy.title}</h2>
          <div className="welcome-progress" aria-label={welcomeCopy.progressAria(Math.min(question + 1, 2), 2)}>
            <span className={`welcome-dot ${dot(0)}`} />
            <span className={`welcome-dot ${dot(1)}`} />
          </div>
        </div>

        {question === 0 && (
          <>
            <p className="welcome-intro">{welcomeCopy.intro}</p>
            <p className="welcome-question">{welcomeCopy.askBuild}</p>
            <div className="welcome-options">
              {BUILD_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" className="welcome-option-btn" onClick={() => vm.answerBuild(opt.value)}>
                  {opt.label}
                </button>
              ))}
              <button type="button" className={`welcome-option-btn${other ? " on" : ""}`} onClick={() => setOther(true)}>
                {welcomeCopy.options.otraCosa}
              </button>
            </div>
            {other && (
              <>
                <textarea
                  className="welcome-textarea"
                  placeholder={welcomeCopy.otherPlaceholder}
                  value={freeText}
                  autoFocus
                  onChange={(e) => setFreeText(e.target.value)}
                />
                <button type="button" className="welcome-next-btn" disabled={!freeText.trim()} onClick={() => vm.answerBuild("otra cosa", freeText.trim())}>
                  {welcomeCopy.buttons.next}
                </button>
              </>
            )}
          </>
        )}

        {question === 1 && (
          <>
            <p className="welcome-question">{welcomeCopy.askExperience}</p>
            <div className="welcome-options">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" className="welcome-option-btn" onClick={() => vm.answerExperience(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {question === 2 && (
          <div className="welcome-done">
            <p className="welcome-done-title">{welcomeCopy.doneTitle}</p>
            <p className="welcome-done-text">{welcomeCopy.doneText}</p>
            <button type="button" className="welcome-next-btn" autoFocus onClick={vm.finishWelcome}>
              {welcomeCopy.buttons.start}
            </button>
          </div>
        )}

        <div className="welcome-actions">
          {question > 0 && (
            <button type="button" className="welcome-back-btn" onClick={vm.back}>
              {welcomeCopy.buttons.back}
            </button>
          )}
          <button type="button" className="welcome-skip-btn" onClick={vm.skipWelcome}>
            {welcomeCopy.buttons.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
