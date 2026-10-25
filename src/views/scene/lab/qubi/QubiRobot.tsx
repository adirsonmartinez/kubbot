"use client";

// Qubi on the bench. Put <QubiRobot state={…} /> inside IsoScene (next to LabBench): he walks to
// `state.target` and stops beside the part, plays `state.gesture` whenever its `at` changes, wears
// `state.expression`, shows `state.activity` in his pose and says `state.bubble` in a glass card that follows
// his head. Clicking him (or the card) calls `onClick`, unless `onAction` is given (see below).
//
// Hands-on (all optional; without `onAction` he is only clicked):
// - Tap him (or his bubble): a menu opens in his bubble with Llamar, ¿Qué puedo construir?, Revisar
//   conexiones, Conectar todo, Simular, Hacer la caja and, when `selectedPart` is set, Explicar <pieza>.
// - Grab him and drag: he rises and follows the pointer (wobbling, arms up); let go and he comes down, or
//   flies on if thrown. Over a part he walks to it and asks «¿Qué hago con <pieza>?» (Explicar, Conectar,
//   Girar, Quitar). On the empty bench he just stays. Dragging him does not pan the map (benchInput.claim).
// - Every choice calls `onAction(key, partId?)`; the page maps it to a chat prompt or tool (the keys are
//   QubiActionKey in models/qubi/actions; qubiCopy.actions.prompts has ready-made messages).
// - `parts`: the bench's parts, to know what is under him when dropped (and, if `avoid` is not given, what
//   he does not stand on). `partName(id)`: the name shown for a part (default: its id).
//
// - `home`: where he stands before he has anywhere to go (default: the front corner of the bench).
// - `avoid`: footprints (the parts' partBox) he must not stop on; with them, a target in the middle of a
//   big board makes him stop at its edge instead of on top of it.
// - `scale`: world units per model unit; the default makes him ~3.4 units tall next to parts of 2 to 7.
// The logic is in walk.ts, gestures.ts and poses.ts (tested); animator.ts applies it to qubiModel.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { dropBoxes, menuActions, partActions, type QubiAction, type QubiActionKey, type QubiPart } from "@/models/qubi/actions";
import type { QubiState } from "@/models/qubi/types";
import { qubiCopy } from "@/views/copy/qubi";
import { useDeferredDispose } from "../useDeferredDispose";
import { QubiAnimator, type FrameInput } from "./animator";
import { shortText } from "./bubble";
import { QubiBubble } from "./QubiBubble";
import { QubiMenu, type MenuItem, type MenuSpec } from "./QubiMenu";
import { buildQubiModel } from "./qubiModel";
import { useQubiGrab, type GrabCallbacks, type GrabInput } from "./useQubiGrab";
import type { Box2, Vec2 } from "./walk";

export const QUBI_HOME: Vec2 = { x: 5, z: 5 };
export const QUBI_SCALE = 1.3;
const NO_BOXES: readonly Box2[] = [];
const CLICK_SLOP_PX = 4; // a press that traveled further was a map drag, not a click

// Hovering him: a pointer cursor and a tooltip that says what a click does
function pointOver(canvas: HTMLElement, on: boolean, hands: boolean) {
  canvas.style.cursor = on ? (hands ? "grab" : "pointer") : "";
  canvas.title = on ? (hands ? qubiCopy.actions.hint : qubiCopy.robot.clickHint) : "";
}

// What is open over his head: the tap menu, or the question about the part he was dropped on
type MenuState = { kind: "main" } | { kind: "part"; part: string };

export type QubiRobotProps = {
  state: QubiState;
  onClick?: () => void;
  home?: Vec2;
  avoid?: readonly Box2[];
  scale?: number;
  parts?: readonly QubiPart[];
  selectedPart?: string | null;
  partName?: (id: string) => string;
  onAction?: (key: QubiActionKey, part?: string) => void;
};

const NO_PARTS: readonly QubiPart[] = [];
const idName = (id: string) => id;

export function QubiRobot({
  state, onClick, home = QUBI_HOME, avoid, scale = QUBI_SCALE, parts = NO_PARTS, selectedPart = null, partName = idName, onAction,
}: QubiRobotProps) {
  const [animator] = useState(() => new QubiAnimator(buildQubiModel(), home, state));
  useDeferredDispose(animator);

  const [still, setStill] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // What is under him when dropped, and what he does not stand on
  const boxes = useMemo(() => dropBoxes(parts), [parts]);
  const footprints = useMemo<readonly Box2[]>(() => avoid ?? (parts.length ? boxes : NO_BOXES), [avoid, parts.length, boxes]);

  // The newest props, read every frame
  const input = useRef<FrameInput>({ state, avoid: footprints, scale, still });
  useEffect(() => {
    input.current = { state, avoid: footprints, scale, still };
  });

  useFrame((_, dt) => animator.update(dt, input.current));

  // --- The menu and the grab ---
  const [asked, setMenu] = useState<MenuState | null>(null);
  const hands = !!onAction;
  // A part that is gone closes the question about it
  const menu = asked?.kind === "part" && !parts.some((p) => p.id === asked.part) ? null : asked;
  const grabInput = useRef<GrabInput>({ boxes, menuOpen: false, enabled: true });
  const actionRef = useRef(onAction);
  const clickRef = useRef(onClick);
  useEffect(() => {
    grabInput.current = { boxes, menuOpen: menu !== null, enabled: !!onAction };
    actionRef.current = onAction;
    clickRef.current = onClick;
  });


  // Tapping him: with hands-on, the menu (a second tap closes it); without, the page's click
  const tap = useCallback(() => {
    if (actionRef.current) setMenu((open) => (open ? null : { kind: "main" }));
    else clickRef.current?.();
  }, []);

  const callbacks = useRef<GrabCallbacks>({ onTap: () => {}, onGrab: () => {}, onArrive: () => {} });
  useEffect(() => {
    callbacks.current = {
      onTap: (wasOpen) => (actionRef.current ? setMenu(wasOpen ? null : { kind: "main" }) : clickRef.current?.()),
      onGrab: () => setMenu(null),
      onArrive: (part) => {
        if (actionRef.current) setMenu({ kind: "part", part });
      },
    };
  }, []);
  const grab = useQubiGrab(animator, grabInput, callbacks);

  const spec = useMemo<MenuSpec | null>(() => {
    if (!menu) return null;
    const copy = qubiCopy.actions;
    const label = (a: QubiAction) => (a.key === "explain" && menu.kind === "main" && a.part ? copy.explainPart(partName(a.part)) : copy.labels[a.key]);
    const list = menu.kind === "main" ? menuActions({ selectedPart: parts.some((p) => p.id === selectedPart) ? selectedPart : null }) : partActions(menu.part);
    const items: MenuItem[] = list.map((a) => ({ key: a.key, part: a.part, label: label(a), danger: a.key === "remove" }));
    return menu.kind === "main"
      ? { id: "main", title: copy.menuTitle, items }
      : { id: `part:${menu.part}`, title: copy.partTitle(partName(menu.part)), items };
  }, [menu, parts, selectedPart, partName]);

  const choose = useCallback((item: MenuItem) => {
    setMenu(null);
    actionRef.current?.(item.key as QubiActionKey, item.part);
  }, []);
  const close = useCallback(() => setMenu(null), []);
  const anchors = useCallback(() => animator.anchors, [animator]);

  const words = state.bubble && !menu ? shortText(state.bubble) : null;

  const hover = (e: ThreeEvent<PointerEvent>, on: boolean) => {
    if ((onClick || hands) && e.nativeEvent.target instanceof HTMLElement && !animator.byHand) pointOver(e.nativeEvent.target, on, hands);
  };

  return (
    <>
      <primitive
        object={animator.model.group}
        onPointerDown={hands ? grab.onPointerDown : undefined}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // With hands-on the tap is handled by the grab (it tells a tap from a drag); stop the bench's click too
          if (hands) {
            e.stopPropagation();
            return;
          }
          if (!onClick || e.delta > CLICK_SLOP_PX) return;
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => hover(e, true)}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => hover(e, false)}
      />
      <QubiBubble text={words} anchors={anchors} onClick={onClick || hands ? tap : undefined} />
      {hands ? <QubiMenu spec={spec} anchors={anchors} onChoose={choose} onClose={close} /> : null}
    </>
  );
}
