"use client";

// Qubi's speech bubble: an HTML glass card over the canvas that follows his head. Each frame the head and
// the feet are projected to the screen and layoutBubble keeps the card inside the viewport (under his feet
// when his head is at the top edge), with the tail still pointing at him. It fades in and out. Clicking it
// does what clicking him does. (drei is not installed, so this is our own, like ../WorldLabel.)

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { qubiCopy } from "@/views/copy/qubi";
import { layoutBubble } from "./bubble";
import { damp } from "./walk";

const GLASS = "rgba(18, 18, 18, 0.66)";

const CARD: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "0",
  top: "0",
  boxSizing: "border-box",
  width: "max-content",
  maxWidth: "240px",
  padding: "8px 12px 9px",
  borderRadius: "16px",
  color: "#ffffff",
  font: "500 13px/1.4 var(--lg-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
  background: GLASS,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  boxShadow: "var(--lg-rim, inset 0 1px 0 rgba(255,255,255,0.16)), 0 12px 32px rgba(0, 0, 0, 0.4)",
  backdropFilter: "blur(18px) saturate(175%)",
  zIndex: "6",
  opacity: "0",
  visibility: "hidden",
  willChange: "transform, opacity",
  userSelect: "none",
};

const NAME: Partial<CSSStyleDeclaration> = {
  display: "block",
  marginBottom: "1px",
  font: "600 10px/1.2 var(--lg-font, sans-serif)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--accent, #8b83ff)",
};

const TAIL: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "11px",
  height: "11px",
  background: GLASS,
  transform: "rotate(45deg)",
};

type Props = {
  text: string | null; // null: it fades away (the last words stay while it does)
  anchors: () => { head: [number, number, number]; foot: [number, number, number] };
  onClick?: () => void;
};

export function QubiBubble({ text, anchors, onClick }: Props) {
  const host = useThree((s) => s.gl.domElement.parentElement);
  const parts = useRef<{ card: HTMLDivElement; label: HTMLSpanElement; tail: HTMLDivElement } | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const alpha = useRef(0);
  const shown = useRef<string | null>(null);
  const anchorsRef = useRef(anchors);
  const clickRef = useRef(onClick);
  const point = useRef(new THREE.Vector3());

  useEffect(() => {
    anchorsRef.current = anchors;
    clickRef.current = onClick;
  });

  useEffect(() => {
    if (!host) return;
    const card = document.createElement("div");
    Object.assign(card.style, CARD);
    card.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    Object.assign(name.style, NAME);
    name.textContent = qubiCopy.name;
    const label = document.createElement("span");
    const tail = document.createElement("div");
    Object.assign(tail.style, TAIL);
    card.append(name, label, tail);
    card.addEventListener("click", () => clickRef.current?.());
    host.appendChild(card);
    parts.current = { card, label, tail };
    shown.current = null;
    return () => {
      card.remove();
      parts.current = null;
    };
  }, [host]);

  useFrame(({ camera, size: view }, dt) => {
    const p = parts.current;
    if (!p) return;
    // New words: write them and measure the card once
    if (text !== null && text !== shown.current) {
      shown.current = text;
      p.label.textContent = text;
      p.card.style.visibility = "visible";
      size.current = { width: p.card.offsetWidth, height: p.card.offsetHeight };
    }
    alpha.current = damp(alpha.current, text !== null ? 1 : 0, dt, 12);
    const visible = alpha.current > 0.02;
    p.card.style.visibility = visible ? "visible" : "hidden";
    if (!visible) return;
    p.card.style.opacity = alpha.current.toFixed(3);
    p.card.style.pointerEvents = clickRef.current && text !== null ? "auto" : "none";
    p.card.style.cursor = clickRef.current ? "pointer" : "default";

    const toScreen = (at: [number, number, number]) => {
      point.current.set(at[0], at[1], at[2]).project(camera);
      return { x: (point.current.x * 0.5 + 0.5) * view.width, y: (-point.current.y * 0.5 + 0.5) * view.height };
    };
    const { head, foot } = anchorsRef.current();
    const lay = layoutBubble({
      head: toScreen(head),
      foot: toScreen(foot),
      width: size.current.width,
      height: size.current.height,
      viewport: { width: view.width, height: view.height },
    });
    // A little float, so it feels alive but never leaves the clamp
    p.card.style.transform = `translate(${lay.left.toFixed(1)}px, ${lay.top.toFixed(1)}px) translateY(${((1 - alpha.current) * 6).toFixed(1)}px)`;
    p.tail.style.left = `${(lay.tailX - 5.5).toFixed(1)}px`;
    p.tail.style.top = lay.below ? "-6px" : "";
    p.tail.style.bottom = lay.below ? "" : "-6px";
    p.tail.style.borderStyle = "solid";
    p.tail.style.borderColor = "rgba(255, 255, 255, 0.14)";
    p.tail.style.borderWidth = lay.below ? "1px 0 0 1px" : "0 1px 1px 0";
  });

  return null;
}
