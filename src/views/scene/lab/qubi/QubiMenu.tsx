"use client";

// Qubi's action menu: a glass card that hangs over his head like his speech bubble (same placement rules,
// layoutBubble) but holds real buttons. The card is a DOM element on the canvas's parent; its content is a
// small React tree in its own root, because the canvas renders with R3F's renderer (a react-dom portal
// does not work inside it). Keyboard: Up, Down, Home and End move between the items, Enter or Space
// choose, Escape closes. Focus goes to the first item on opening, comes back to where it was on closing, and
// leaving the card (a click elsewhere, Tab) closes it. Colors and layout are in styles/qubiMenu.css.

import { useEffect, useRef, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { qubiCopy } from "@/views/copy/qubi";
import "@/views/styles/qubiMenu.css";
import { layoutBubble } from "./bubble";
import { damp } from "./walk";

export type MenuItem = { key: string; label: string; part?: string; danger?: boolean };
export type MenuSpec = { id: string; title: string; items: MenuItem[] };

type Props = {
  spec: MenuSpec | null; // null: closed (it fades away, keeping its last content while it does)
  anchors: () => { head: [number, number, number]; foot: [number, number, number] };
  onChoose: (item: MenuItem) => void;
  onClose: () => void;
};

function MenuContent({ spec, onChoose, onClose }: { spec: MenuSpec; onChoose: (item: MenuItem) => void; onClose: () => void }) {
  const list = useRef<HTMLUListElement>(null);

  const move = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    // The keys the menu uses are not for the map (MapInput pans with the arrows, the bench clears on Esc)
    const go = (i: number) => {
      e.preventDefault();
      e.stopPropagation();
      buttons[(i + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
  };

  return (
    <div onKeyDown={move}>
      <span className="qm-name">{qubiCopy.name}</span>
      <p className="qm-title" id={`qm-title-${spec.id}`}>
        {spec.title}
      </p>
      <ul className="qm-list" role="menu" aria-labelledby={`qm-title-${spec.id}`} ref={list}>
        {spec.items.map((item) => (
          <li key={`${item.key}:${item.part ?? ""}`} role="none">
            <button type="button" role="menuitem" className={item.danger ? "qm-item danger" : "qm-item"} onClick={() => onChoose(item)}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QubiMenu({ spec, anchors, onChoose, onClose }: Props) {
  const host = useThree((s) => s.gl.domElement.parentElement);
  const parts = useRef<{ card: HTMLDivElement; tail: HTMLDivElement; root: Root; body: HTMLDivElement } | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const alpha = useRef(0);
  const point = useRef(new THREE.Vector3());
  const latest = useRef({ spec, anchors, onChoose, onClose });
  const lastSpec = useRef<MenuSpec | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latest.current = { spec, anchors, onChoose, onClose };
  });

  useEffect(() => {
    if (!host) return;
    const card = document.createElement("div");
    card.className = "qm-card";
    const body = document.createElement("div");
    const tail = document.createElement("div");
    tail.className = "qm-tail";
    card.append(body, tail);
    host.appendChild(card);
    const root = createRoot(body);
    parts.current = { card, tail, root, body };
    const watch = new ResizeObserver(() => {
      size.current = { width: card.offsetWidth, height: card.offsetHeight };
    });
    watch.observe(card);
    // Leaving the card (a click elsewhere, Tab) closes the menu
    const leave = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && card.contains(e.relatedTarget)) return;
      latest.current.onClose();
    };
    card.addEventListener("focusout", leave);
    return () => {
      watch.disconnect();
      card.removeEventListener("focusout", leave);
      parts.current = null;
      // Unmounting while React renders (a strict-mode remount) is not allowed: do it right after
      queueMicrotask(() => root.unmount());
      card.remove();
    };
  }, [host]);

  // The content: what is open, or the last thing that was while it fades away
  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    const shown = spec ?? lastSpec.current;
    if (spec) lastSpec.current = spec;
    if (!shown) return;
    flushSync(() => p.root.render(<MenuContent spec={shown} onChoose={(item) => latest.current.onChoose(item)} onClose={() => latest.current.onClose()} />));
    if (spec) size.current = { width: p.card.offsetWidth, height: p.card.offsetHeight };
  }, [spec]);

  // Opening: keyboard users land on the first item; closing gives the focus back. Only a different menu
  // (not a new copy of the same one) counts.
  const openId = spec?.id ?? null;
  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    p.card.setAttribute("aria-hidden", openId ? "false" : "true");
    p.card.inert = !openId;
    if (!openId) return;
    p.card.style.visibility = "visible"; // a hidden element cannot take the focus yet
    const before = document.activeElement instanceof HTMLElement && !p.card.contains(document.activeElement) ? document.activeElement : null;
    if (before) returnTo.current = before;
    p.card.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [openId]);

  // Closed: the focus goes back to where it was
  useEffect(() => {
    if (openId) return;
    const back = returnTo.current;
    returnTo.current = null;
    // Not when the person already moved on (clicked another field): only from nowhere or from the card
    const now = document.activeElement;
    const adrift = !now || now === document.body || !!parts.current?.card.contains(now);
    if (back && back !== document.body && back.isConnected && adrift) back.focus({ preventScroll: true });
  }, [openId]);

  useFrame(({ camera, size: view }, dt) => {
    const p = parts.current;
    if (!p) return;
    alpha.current = damp(alpha.current, latest.current.spec ? 1 : 0, dt, 14);
    const visible = alpha.current > 0.02;
    p.card.style.visibility = visible ? "visible" : "hidden";
    if (!visible) return;
    p.card.style.opacity = alpha.current.toFixed(3);
    const toScreen = (at: [number, number, number]) => {
      point.current.set(at[0], at[1], at[2]).project(camera);
      return { x: (point.current.x * 0.5 + 0.5) * view.width, y: (-point.current.y * 0.5 + 0.5) * view.height };
    };
    const { head, foot } = latest.current.anchors();
    const lay = layoutBubble({
      head: toScreen(head),
      foot: toScreen(foot),
      width: size.current.width,
      height: size.current.height,
      viewport: { width: view.width, height: view.height },
    });
    p.card.style.transform = `translate(${lay.left.toFixed(1)}px, ${lay.top.toFixed(1)}px) translateY(${((1 - alpha.current) * 6).toFixed(1)}px)`;
    p.tail.style.left = `${(lay.tailX - 5.5).toFixed(1)}px`;
    p.tail.style.top = lay.below ? "-6px" : "";
    p.tail.style.bottom = lay.below ? "" : "-6px";
    p.tail.style.borderWidth = lay.below ? "1px 0 0 1px" : "0 1px 1px 0";
  });

  return null;
}
