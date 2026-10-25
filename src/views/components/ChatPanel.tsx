"use client";

// The agent chat: clear glass panel with the conversation, suggestions and the composer. The pieces
// (header, run card, markdown answers, model picker, composer) live in ./chat; this file only lays them out
// and keeps the conversation scrolled to its end unless the person is reading above.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatViewModel } from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";
import "@/views/styles/chat.css";
import { Icon } from "./Icon";
import { ChatHeader } from "./chat/ChatHeader";
import { Composer } from "./chat/Composer";
import { Message, WaitingRow } from "./chat/Message";

const NEAR_END_PX = 48;

export function ChatPanel({
  vm,
  agentName,
  status,
  headerActions,
}: {
  vm: ChatViewModel;
  agentName: string;
  status: string;
  headerActions?: ReactNode; // e.g. the call button
}) {
  const body = useRef<HTMLDivElement>(null);
  // Whether the person is at the end of the conversation (then new lines scroll into view)
  const atEnd = useRef(true);
  const [more, setMore] = useState(false);

  const toEnd = useCallback((smooth: boolean) => {
    const el = body.current;
    if (!el) return;
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !calm ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = body.current;
    if (!el) return;
    atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END_PX;
    setMore(!atEnd.current);
  }, []);

  // Follow the conversation as it grows, unless the person scrolled up to read. What they just wrote always
  // brings the end into view. (An instant jump: a smooth one would be cut by the next update and read as
  // "the person scrolled up".)
  const lastAsked = useRef<string | null>(null);
  useEffect(() => {
    const asked = vm.messages.findLast((m) => m.role === "user")?.id ?? null;
    if (asked !== lastAsked.current) {
      lastAsked.current = asked;
      atEnd.current = true;
    }
    if (atEnd.current) toEnd(false);
    else setMore(true);
  }, [vm.messages, vm.busy, toEnd]);

  const last = vm.messages.findLast((m) => m.role === "bot" && !m.run);
  // The run card already shows that Qubi works; the waiting row is for a question still in line
  const runWorking = vm.messages.some((m) => m.run?.status === "running");

  return (
    <aside className={`chat glass-panel ${vm.pinned ? "pinned" : ""}`} aria-label={chatCopy.panel} data-tour="chat">
      <ChatHeader vm={vm} agentName={agentName} status={status} actions={headerActions} />

      <div className="chat-body-wrap">
        <div className="chat-body" ref={body} onScroll={onScroll}>
          {vm.messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {vm.busy && !runWorking && <WaitingRow />}
        </div>
        {more && (
          <button type="button" className="chat-more-below" onClick={() => toEnd(true)}>
            <Icon name="chevronDown" size={14} />
            {chatCopy.moreBelow}
          </button>
        )}
      </div>
      {/* What a screen reader hears: that Qubi works, and then his answer (not the ticking clock) */}
      <div className="sr-only" role="status" aria-live="polite">
        {vm.busy ? chatCopy.working : (last?.text ?? "")}
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

      <Composer vm={vm} />
    </aside>
  );
}

export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="chat-launcher" onClick={onOpen} aria-label={chatCopy.open} title={chatCopy.open}>
      <Icon name="bot" size={22} />
    </button>
  );
}
