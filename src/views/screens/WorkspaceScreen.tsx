"use client";

// The workspace: Qubbot's Arduino lab. The isometric bench fills the stage; the catalog and the circuit
// review open from the side dock, the lab's toolbar floats at the bottom and the chat (Qubi) can see
// and change the bench through its tools.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useHistoryKeys } from "@/viewmodels/useHistoryKeys";
import { useOnboardingViewModel } from "@/viewmodels/useOnboardingViewModel";
import { useChatViewModel } from "@/viewmodels/useChatViewModel";
import { useCallViewModel } from "@/viewmodels/useCallViewModel";
import { useImportViewModel } from "@/viewmodels/useImportViewModel";
import { useLabViewModel } from "@/viewmodels/useLabViewModel";
import { useQubiViewModel } from "@/viewmodels/useQubiViewModel";
import { useMapViewModel } from "@/viewmodels/useMapViewModel";
import { useShellViewModel } from "@/viewmodels/useShellViewModel";
import { ChatLauncher, ChatPanel } from "@/views/components/ChatPanel";
import { Icon } from "@/views/components/Icon";
import { IconBar, type IconBarItem } from "@/views/components/IconBar";
import { MapControls } from "@/views/components/MapControls";
import { SettingsPanel } from "@/views/components/SettingsPanel";
import { SidePanel } from "@/views/components/SidePanel";
import { CatalogPanel } from "@/views/components/lab/CatalogPanel";
import { CheckPanel } from "@/views/components/lab/CheckPanel";
import { DropZone } from "@/views/components/lab/DropZone";
import { GuideCard } from "@/views/components/lab/GuideCard";
import { ImportComponent } from "@/views/components/lab/ImportComponent";
import { LabHud } from "@/views/components/hud/LabHud";
import { UndoRedo } from "@/views/components/hud/UndoRedo";
import { PrintBar } from "@/views/components/lab/PrintBar";
import { WelcomeCard } from "@/views/components/qubi/WelcomeCard";
import { TourOffer } from "@/views/components/tour/TourOffer";
import { TourOverlay } from "@/views/components/tour/TourOverlay";
import { CallBar } from "@/views/components/qubi/CallBar";
import { CallButton } from "@/views/components/qubi/CallButton";
import { LabToolbar } from "@/views/components/lab/LabToolbar";
import { labCopy } from "@/views/copy/lab";
import { qubiCopy } from "@/views/copy/qubi";
import { settingsCopy } from "@/views/copy/settings";
import type { DropAt } from "@/views/scene/lab/LabBench";

// WebGL only exists in the browser
const IsoScene = dynamic(() => import("@/views/scene/IsoScene").then((m) => m.IsoScene), { ssr: false });
const LabBench = dynamic(() => import("@/views/scene/lab/LabBench").then((m) => m.LabBench), { ssr: false });
const QubiRobot = dynamic(() => import("@/views/scene/lab/qubi/QubiRobot").then((m) => m.QubiRobot), { ssr: false });

type Side = "catalog" | "check" | "settings";

const SIDES: IconBarItem<Side>[] = [
  { id: "catalog", icon: "cube", label: labCopy.catalog.title, hint: labCopy.catalog.intro },
  { id: "check", icon: "check", label: labCopy.check.title, hint: labCopy.check.ok },
  { id: "settings", icon: "settings", label: settingsCopy.title, hint: settingsCopy.hint },
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
  const shell = useShellViewModel<Side>("catalog"); // the catalog starts open: it is where everything begins
  const map = useMapViewModel();
  const lab = useLabViewModel();
  const imp = useImportViewModel(); // "Nuevo componente": from a photo or a datasheet
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
  // Qubi: the robot on the bench follows what the agent does, and keeps the tasks given to him
  const qubi = useQubiViewModel({ design: lab.design });
  const chat = useChatViewModel({
    suggestions: SUGGESTIONS,
    lab: { design: lab.design, applyAgentTool: lab.applyAgentTool, onEffect },
    onEvent: qubi.onAgentEvent,
  });
  // The call: Qubi listens and speaks (ElevenLabs when the server has a key, else the browser's voice)
  const { onCallEvent, greet } = qubi;
  const call = useCallViewModel({
    ask: chat.ask,
    applyAgentTool: lab.applyAgentTool,
    onAgentEvent: qubi.onAgentEvent,
    onCallEvent: (e) => {
      const status = e.phase === "start" ? "connecting" : e.phase === "end" ? "off" : "on";
      onCallEvent({ type: "call", status, speaking: e.phase === "speaking", listening: e.phase === "listening" });
    },
    onTranscript: (who, text) => chat.appendTranscript(who === "person" ? "user" : "bot", text),
  });
  useEffect(() => {
    greet();
  }, [greet]);

  // Cmd/Ctrl+Z undoes the last change on the bench; Shift+Cmd/Ctrl+Z or Ctrl+Y redoes it
  useHistoryKeys(lab.undo, lab.redo);

  // First visit: Qubi's interview (its answer loads an example and goes to Qubi), then the tour is offered
  const onboarding = useOnboardingViewModel({
    loadExampleNamed: lab.loadExampleNamed,
    send: (prompt) => void chat.send(prompt),
  });
  const tour = onboarding.tour;

  // The tour's panel steps need their panel open
  const tourTarget = tour.step?.target ?? null;
  const side = shell.side;
  const toggleSide = shell.toggleSide;
  useEffect(() => {
    if ((tourTarget === "catalog" || tourTarget === "check") && side !== tourTarget) toggleSide(tourTarget);
    // only a change of step opens a panel; the person can still close it afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourTarget]);

  // Qubi's own menu on the bench: each action becomes a request to him (the call starts the call)
  const ACTIONS = qubiCopy.actions.prompts;
  const onQubiAction = useCallback(
    (key: string, part?: string) => {
      if (key === "call") return void (call.state.status === "off" ? call.start() : call.stop());
      const name = part ? lab.partLabel(part) : "";
      const prompt = {
        ideas: ACTIONS.ideas,
        check: ACTIONS.check,
        wireAll: ACTIONS.wireAll,
        simulate: ACTIONS.simulate,
        enclosure: ACTIONS.enclosure,
        explain: ACTIONS.explain(name),
        connect: ACTIONS.connect(name),
        rotate: ACTIONS.rotate(name),
        remove: ACTIONS.remove(name),
      }[key];
      if (prompt) void chat.send(prompt);
    },
    [ACTIONS, call, chat, lab],
  );
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
              <QubiRobot
                state={qubi.state}
                parts={lab.design.parts}
                selectedPart={lab.selected}
                partName={lab.partLabel}
                onAction={onQubiAction}
              />
            </IsoScene>
          </DropZone>
          <div className="vignette" aria-hidden />
          <div className="tour-bench-anchor" data-tour="bench" aria-hidden />
          <div className="tour-qubi-anchor" data-tour="qubi" aria-hidden />
          {(shell.side === "catalog" || shell.side === "check") && <div className="tour-panel-anchor" data-tour={shell.side} aria-hidden />}

          <IconBar items={SIDES} active={shell.side} onSelect={shell.toggleSide} orientation="vertical" className="side-dock" />
          {openSide && (
            <SidePanel title={openSide.label} onClose={shell.closeSidebar}>
              {openSide.id === "catalog" && <CatalogPanel vm={lab} mine={imp} />}
              {openSide.id === "check" && <CheckPanel vm={lab} onAsk={(prompt) => chat.send(prompt)} />}
              {openSide.id === "settings" && (
                <SettingsPanel
                  parts={lab.design.parts.length}
                  onStartTour={onboarding.startTour}
                  onReplayWelcome={onboarding.replayWelcome}
                  onClearBench={() => void lab.applyAgentTool("lab_clear", {})}
                />
              )}
            </SidePanel>
          )}
          <MapControls vm={map} />
          <UndoRedo disabledUndo={!lab.canUndo} disabledRedo={!lab.canRedo} onUndo={lab.undo} onRedo={lab.redo} />
          {lab.design.parts.length === 0 && (
            <button type="button" className="lab-example glass-panel" onClick={lab.loadExample} title={labCopy.bench.exampleHint}>
              <Icon name="sparkles" size={16} />
              {labCopy.bench.example}
            </button>
          )}
          <LabToolbar vm={lab} insetLeft={MAP_CONTROLS_RIGHT} insetRight={insets.right} />
          <PrintBar vm={lab} insetLeft={insets.left} insetRight={insets.right} />
          {lab.design.parts.length > 0 && <LabHud health={lab.health} onShowIssues={() => shell.toggleSide("check")} />}
          <div className="stage-column" style={{ "--col-left": `${insets.left}px`, "--col-right": `${insets.right}px` } as CSSProperties}>
            <CallBar call={call} />
            <GuideCard vm={lab} />
          </div>
          <ImportComponent vm={imp} />
          {onboarding.welcomeOpen && <WelcomeCard vm={onboarding} />}
          {onboarding.offerOpen && <TourOffer onYes={onboarding.startTour} onNo={onboarding.declineTour} />}
        </main>

        {chat.minimized ? (
          <ChatLauncher onOpen={chat.toggleMinimized} />
        ) : (
          <ChatPanel vm={chatVm} agentName="Qubi" status="Laboratorio Arduino" headerActions={<CallButton call={call} />} />
        )}
      </div>
      <TourOverlay tour={tour} />
    </div>
  );
}
