"use client";

// The "more" menu of the chat header: start over or save the conversation.

import { useEffect, useId, useRef, useState } from "react";
import { chatCopy } from "@/views/copy/chat";
import { Icon } from "../Icon";

const copy = chatCopy.menu;

export function ChatMenu({ onNewChat, onSave, canSave }: { onNewChat: () => void; onSave: () => void; canSave: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!list.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    list.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    button.current?.focus();
    action();
  };

  return (
    <div className="chat-menu-wrap">
      <button
        ref={button}
        type="button"
        className={`icon-button${open ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={copy.label}
        title={copy.label}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div ref={list} id={id} className="chat-menu glass-pop" role="menu" aria-label={copy.label}>
          <button type="button" role="menuitem" onClick={choose(onNewChat)}>
            <Icon name="plus" size={15} />
            {copy.newChat}
          </button>
          <button type="button" role="menuitem" disabled={!canSave} onClick={choose(onSave)}>
            <Icon name="download" size={15} />
            {copy.save}
          </button>
        </div>
      )}
    </div>
  );
}
