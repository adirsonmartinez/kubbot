"use client";

// The workspace: Qubbot's Arduino lab. The isometric bench fills the stage; the catalog and the circuit
// review open from the side dock, the lab's toolbar floats at the bottom and the chat (Qubi) can see
// and change the bench through its tools.

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { useChatViewModel } from "@/viewmodels/useChatViewModel";
import { useLabViewModel } from "@/viewmodels/useLabViewModel";
import { useMapViewModel } from "@/viewmodels/useMapViewModel";
import { useShellViewModel } from "@/viewmodels/useShellViewModel";
import { ChatLauncher, ChatPanel } from "@/views/components/ChatPanel";
import { IconBar, type IconBarItem } from "@/views/components/IconBar";
import { MapControls } from "@/views/components/MapControls";
import { SidePanel } from "@/views/components/SidePanel";
import { CatalogPanel } from "@/views/components/lab/CatalogPanel";
import { CheckPanel } from "@/views/components/lab/CheckPanel";
import { DropZone } from "@/views/components/lab/DropZone";
import { LabToolbar } from "@/views/components/lab/LabToolbar";
import { labCopy } from "@/views/copy/lab";
import type { DropAt } from "@/views/scene/lab/LabBench";

// WebGL only exists in the browser
const IsoScene = dynamic(() => import("@/views/scene/IsoScene").then((m) => m.IsoScene), { ssr: false });
const LabBench = dynamic(() => import("@/views/scene/lab/LabBench").then((m) => m.LabBench), { ssr: false });

type Side = "catalog" | "check" | "settings";

const SIDES: IconBarItem<Side>[] = [
  { id: "catalog", icon: "cube", label: labCopy.catalog.title, hint: labCopy.catalog.intro },
  { id: "check", icon: "check", label: labCopy.check.title, hint: labCopy.check.ok },
  { id: "settings", icon: "settings", label: "Ajustes", hint: "Preferencias de la vista" },
];

// The chips show a short text and send the full request
const CHIPS: Record<string, string> = {
  [labCopy.chips.ideas]: labCopy.prompts.ideas,
  [labCopy.chips.wireIt]: labCopy.prompts.wireIt,
  [labCopy.chips.review]: labCopy.prompts.review,
  [labCopy.chips.enclosure]: labCopy.prompts.enclosure,
};
const SUGGESTIONS = Object.keys(CHIPS);

// Stage geometry from ui.css, in pixels: what the floating pieces cover. The toolbar and the camera keep
// clear of it (the toolbar so nothing overlaps, the camera so the parts are centered in what is left).
const CHAT_WIDTH = 372; // the floating chat
const GAP = 16;
const DOCK_RIGHT = 84; // the side dock's right edge
const PANEL_RIGHT = 82 + 300; // the open side panel's right edge
const MAP_CONTROLS_RIGHT = 252; // the zoom / turn / center buttons at the bottom left
const TOOLBAR_HEIGHT = 96; // the toolbar and its hint above the bottom edge

export function WorkspaceScreen() {
  const shell = useShellViewModel<Side>();
  const map = useMapViewModel();
  const lab = useLabViewModel();
  const { sim, enclosure, toggleSim, toggleEnclosure, exportSketch, add } = lab;

  // What the agent asked to show: run the simulation, open the box, download the code
  const onEffect = useCallback(
    (kind: "simulate" | "enclosure" | "sketch") => {
      if (kind === "simulate" && !sim.running) toggleSim();
      if (kind === "enclosure" && !enclosure.visible) toggleEnclosure();
      if (kind === "sketch") exportSketch();
    },
    [sim.running, enclosure.visible, toggleSim, toggleEnclosure, exportSketch],
  );
  const chat = useChatViewModel({
    suggestions: SUGGESTIONS,
    lab: { design: lab.design, applyAgentTool: lab.applyAgentTool, onEffect },
  });
  const chatVm = { ...chat, send: (text?: string) => chat.send(text === undefined ? undefined : CHIPS[text] ?? text) };

  // Catalog drops: the bench turns the screen point into a spot on the ground
  const dropAt = useRef<DropAt | null>(null);
  const onReady = useCallback((fn: DropAt | null) => {
    dropAt.current = fn;
  }, []);
  const onDropPart = useCallback((type: string, x: number, y: number) => add(type, dropAt.current?.(x, y) ?? undefined), [add]);

  const openSide = SIDES.find((s) => s.id === shell.side);
  const chatPinned = chat.pinned && !chat.minimized;
  const chatFloating = !chat.minimized && !chat.pinned;
  const insets = {
    left: openSide ? PANEL_RIGHT + GAP : DOCK_RIGHT,
    right: chatFloating ? CHAT_WIDTH + GAP * 2 : GAP,
    top: GAP,
    bottom: TOOLBAR_HEIGHT,
  };

  return (
    <div className="shell">
      <div className={`workspace ${chatPinned ? "chat-pinned" : ""}`}>
        <main className="stage">
          <DropZone onDropPart={onDropPart}>
            <IsoScene rig={map.rig}>
              <LabBench vm={lab} rig={map.rig} insets={insets} onReady={onReady} />
            </IsoScene>
          </DropZone>
          <div className="vignette" aria-hidden />

          <IconBar items={SIDES} active={shell.side} onSelect={shell.toggleSide} orientation="vertical" className="side-dock" />
          {openSide && (
            <SidePanel title={openSide.label} onClose={shell.closeSidebar}>
              {openSide.id === "catalog" && <CatalogPanel vm={lab} />}
              {openSide.id === "check" && <CheckPanel vm={lab} onAsk={(prompt) => chat.send(prompt)} />}
              {openSide.id === "settings" && <p className="muted">{openSide.hint}.</p>}
            </SidePanel>
          )}
          <MapControls vm={map} />
          <LabToolbar vm={lab} insetLeft={MAP_CONTROLS_RIGHT} insetRight={insets.right} />
        </main>

        {chat.minimized ? (
          <ChatLauncher onOpen={chat.toggleMinimized} />
        ) : (
          <ChatPanel vm={chatVm} agentName="Qubi" status="Laboratorio Arduino" />
        )}
      </div>
    </div>
  );
}
