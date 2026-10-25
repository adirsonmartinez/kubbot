"use client";

// The agent chat: clear glass panel with messages, suggestions and the composer.

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ChatViewModel } from "@/viewmodels/useChatViewModel";
import { Icon } from "./Icon";

export function ChatPanel({
  vm,
  agentName,
  status,
}: {
  vm: ChatViewModel;
  agentName: string;
  status: string;
}) {
  const body = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [vm.messages.length, vm.busy]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      vm.send();
    }
  }

  return (
    <aside className={`chat glass-panel ${vm.pinned ? "pinned" : ""}`} aria-label="Chat con el agente">
      <header className="chat-head">
        <div className="chat-avatar">
          <Icon name="bot" size={18} />
        </div>
        <div className="chat-title">
          <strong>{agentName}</strong>
          <span>{status}</span>
        </div>
        <button
          type="button"
          className={`icon-button ${vm.pinned ? "on" : ""}`}
          aria-pressed={vm.pinned}
          onClick={vm.togglePinned}
          title={vm.pinned ? "Soltar el chat" : "Fijar el chat al costado"}
          aria-label={vm.pinned ? "Soltar el chat" : "Fijar el chat al costado"}
        >
          <Icon name="pin" size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={vm.toggleMinimized}
          title="Minimizar"
          aria-label="Minimizar"
        >
          <Icon name="minus" size={16} />
        </button>
      </header>

      <div className="chat-body" ref={body} aria-live="polite">
        {vm.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {vm.busy && (
          <div className="msg bot typing" aria-label="Pensando">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      {vm.suggestions.length > 0 && (
        <div className="chat-suggest" role="list">
          {vm.suggestions.map((s) => (
            <button key={s} type="button" role="listitem" onClick={() => vm.send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          vm.send();
        }}
      >
        <textarea
          rows={2}
          value={vm.draft}
          onChange={(e) => vm.setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Cuéntame qué necesitas…"
          aria-label="Mensaje para el agente"
        />
        <div className="composer-bar">
          <button
            type="button"
            className="icon-button"
            onClick={vm.newConversation}
            title="Nueva conversación"
            aria-label="Nueva conversación"
          >
            <Icon name="plus" size={16} />
          </button>
          <button type="submit" className="send" disabled={!vm.canSend} aria-label="Enviar">
            <Icon name="arrowUp" size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}

export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="chat-launcher" onClick={onOpen} aria-label="Abrir el chat" title="Abrir el chat">
      <Icon name="bot" size={22} />
    </button>
  );
}
