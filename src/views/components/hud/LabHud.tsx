"use client";

import { useEffect, useRef, useState } from "react";
import { hudCopy } from "@/views/copy/hud";
import "@/views/styles/hud.css";

// ── Props ─────────────────────────────────────────────────────────────────

export type LabHudProps = {
  health: {
    score: number;
    level: "green" | "yellow" | "red";
    red: number;
    yellow: number;
    parts: number;
    wires: number;
    budget: { board: string; usedMa: number; budgetMa: number; ratio: number }[];
  };
  onShowIssues(): void;
};

// ── Ring constant ─────────────────────────────────────────────────────────

const RING_RADIUS = 12; // in user units of the 64×64 viewBox
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ── Animated score component ──────────────────────────────────────────────

function AnimatedScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    if (prev.current === target) return;
    const from = prev.current;
    const to = target;
    const duration = 500;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out quad
      const ease = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(from + (to - from) * ease));
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    prev.current = target;
  }, [target]);

  return (
    <>
      {display}
      <span>%</span>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function LabHud({ health, onShowIssues }: LabHudProps) {
  const { score, level, red, yellow, parts, wires, budget } = health;

  return (
    <div
      className="lab-hud"
      data-level={level}
      role="button"
      tabIndex={0}
      aria-label={hudCopy.ringAria(score)}
      title={hudCopy.showIssues}
      onClick={onShowIssues}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShowIssues();
        }
      }}
    >
      {/* Score ring + number */}
      <div className="lab-hud-ring">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="lab-hud-track" cx="32" cy="32" r={RING_RADIUS} />
          <circle
            className="lab-hud-value"
            cx="32"
            cy="32"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - score / 100)}
          />
        </svg>
        <strong className="lab-hud-score">
          <AnimatedScore target={score} />
        </strong>
      </div>

      {/* Counters */}
      <div className="lab-hud-counters">
        <span className="lab-hud-parts">
          {hudCopy.partsAndWires(parts, wires)}
        </span>
        <div className="lab-hud-issues">
          {red > 0 && (
            <span className="lab-hud-issue">
              <span className="lab-hud-dot red" />
              <b>{red}</b>
              <span> {red === 1 ? "peligro" : "peligros"}</span>
            </span>
          )}
          {yellow > 0 && (
            <span className="lab-hud-issue">
              <span className="lab-hud-dot yellow" />
              <b>{yellow}</b>
              <span> por revisar</span>
            </span>
          )}
        </div>
      </div>

      {/* Budget bar (first board only) */}
      {budget.length > 0 && budget[0].budgetMa > 0 && (
        <div className={`lab-hud-budget ${budget[0].ratio > 1 ? "over" : ""}`}>
          <div className="lab-hud-budget-label">
            <b>{hudCopy.boardName(budget[0].board)}</b>
            <span className="lab-hud-budget-value">{hudCopy.budgetValue(budget[0].usedMa, budget[0].budgetMa)}</span>
          </div>
          <div className="lab-hud-budget-bar">
            <i
              style={{
                width: `${Math.min(budget[0].ratio, 1) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}