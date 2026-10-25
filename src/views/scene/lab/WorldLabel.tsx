"use client";

// A small HTML label pinned to a point in the scene (drei is not installed, so this is our own). The div
// is created while the label is shown and sits over the canvas; every frame it is moved to where the
// 3D point projects on screen.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "0",
  top: "0",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  padding: "5px 10px",
  borderRadius: "9px",
  fontSize: "12px",
  fontWeight: "500",
  lineHeight: "1.3",
  color: "#eceef2",
  background: "rgba(18, 18, 18, 0.74)",
  border: "1px solid rgba(255, 255, 255, 0.13)",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
  backdropFilter: "blur(10px)",
  zIndex: "5",
  willChange: "transform",
};

type Props = {
  text: string | null; // null hides it
  position: () => [number, number, number] | null; // read every frame
  wrap?: boolean; // a long text wraps and is centered
};

export function WorldLabel({ text, position, wrap = false }: Props) {
  const host = useThree((s) => s.gl.domElement.parentElement);
  const element = useRef<HTMLDivElement | null>(null);
  const point = useRef(new THREE.Vector3());
  const positionRef = useRef(position);
  const shown = text !== null;

  useEffect(() => {
    positionRef.current = position;
  });

  useEffect(() => {
    if (!host || !shown) return;
    const div = document.createElement("div");
    Object.assign(div.style, STYLE);
    div.style.opacity = "0";
    div.setAttribute("aria-hidden", "true");
    host.appendChild(div);
    element.current = div;
    return () => {
      div.remove();
      element.current = null;
    };
  }, [host, shown]);

  useEffect(() => {
    const div = element.current;
    if (!div || text === null) return;
    // A text with line breaks is a small card: the first line is the title, the rest is smaller and softer
    const lines = text.split("\n");
    const card = lines.length > 1;
    div.replaceChildren(
      ...lines.map((line, i) => {
        const row = document.createElement("div");
        row.textContent = line;
        if (card) {
          row.style.fontWeight = i === 0 ? "650" : "400";
          row.style.fontSize = i === 0 ? "12px" : "11.5px";
          row.style.color = i === 0 ? "#fff" : "rgba(236, 238, 242, 0.82)";
          row.style.marginTop = i === 0 ? "0" : "3px";
        }
        return row;
      }),
    );
    const flow = wrap || card;
    div.style.whiteSpace = flow ? "normal" : "nowrap";
    div.style.textAlign = wrap && !card ? "center" : "left";
    div.style.width = flow ? "max-content" : "";
    div.style.maxWidth = card ? "250px" : wrap ? "260px" : "";
  }, [text, wrap, shown]);

  useFrame(({ camera, size }) => {
    const div = element.current;
    if (!div) return;
    const at = positionRef.current();
    if (!at) {
      div.style.opacity = "0";
      return;
    }
    point.current.set(at[0], at[1], at[2]).project(camera);
    const x = (point.current.x * 0.5 + 0.5) * size.width;
    const y = (-point.current.y * 0.5 + 0.5) * size.height;
    div.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 8px))`;
    div.style.opacity = "1";
  });

  return null;
}
