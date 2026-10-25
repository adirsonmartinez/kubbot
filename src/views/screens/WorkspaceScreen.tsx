"use client";

// The workspace: the isometric map fills the stage; the side dock and panel, map controls
// and chat float over it.

import dynamic from "next/dynamic";
import { useChatViewModel } from "@/viewmodels/useChatViewModel";
import { useMapViewModel } from "@/viewmodels/useMapViewModel";
import { useShellViewModel } from "@/viewmodels/useShellViewModel";
import { ChatLauncher, ChatPanel } from "@/views/components/ChatPanel";
import { IconBar, type IconBarItem } from "@/views/components/IconBar";
import { MapControls } from "@/views/components/MapControls";
import { SidePanel } from "@/views/components/SidePanel";

// WebGL only exists in the browser
const IsoScene = dynamic(() => import("@/views/scene/IsoScene").then((m) => m.IsoScene), {
  ssr: false,
});

type Side = "layers" | "info" | "settings";

const SIDES: IconBarItem<Side>[] = [
  { id: "layers", icon: "layers", label: "Capas", hint: "Qué se muestra en el mapa" },
  { id: "info", icon: "info", label: "Detalles", hint: "Lo que está seleccionado" },
  { id: "settings", icon: "settings", label: "Ajustes", hint: "Preferencias de la vista" },
];

const SUGGESTIONS = ["¿Qué puedo hacer aquí?", "Muéstrame un ejemplo"];

export function WorkspaceScreen() {
  const shell = useShellViewModel<Side>();
  const map = useMapViewModel();
  const chat = useChatViewModel({ suggestions: SUGGESTIONS });
  const openSide = SIDES.find((s) => s.id === shell.side);
  const chatPinned = chat.pinned && !chat.minimized;

  return (
    <div className="shell">
      <div className={`workspace ${chatPinned ? "chat-pinned" : ""}`}>
        <main className="stage">
          <IsoScene rig={map.rig} />
          <div className="vignette" aria-hidden />

          <IconBar
            items={SIDES}
            active={shell.side}
            onSelect={shell.toggleSide}
            orientation="vertical"
            className="side-dock"
          />
          {openSide && (
            <SidePanel title={openSide.label} onClose={shell.closeSidebar}>
              <p className="muted">{openSide.hint}.</p>
            </SidePanel>
          )}
          <MapControls vm={map} />
        </main>

        {chat.minimized ? (
          <ChatLauncher onOpen={chat.toggleMinimized} />
        ) : (
          <ChatPanel vm={chat} agentName="Agente" status="En línea" />
        )}
      </div>
    </div>
  );
}
