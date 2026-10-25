"use client";

// ViewModel for the agent chat: messages, the draft, and whether the panel is minimized or pinned.

import { useRef, useState } from "react";
import { canSend, createMessage, type ChatMessage } from "@/models/chat";
import { replyTo } from "@/services/agentService";

const WELCOME = createMessage("sys", "Nueva conversación");

export function useChatViewModel({ suggestions = [] as string[] } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Replies from a conversation that was cleared are dropped
  const conversation = useRef(0);

  async function send(text = draft) {
    if (!canSend(text, busy)) return;
    const id = conversation.current;
    const history = [...messages, createMessage("user", text.trim())];
    setMessages(history);
    setDraft("");
    setBusy(true);
    try {
      const reply = await replyTo(history);
      if (id === conversation.current) {
        setMessages((current) => [...current, createMessage("bot", reply)]);
      }
    } catch {
      if (id === conversation.current) {
        setMessages((current) => [
          ...current,
          createMessage("sys", "No pude responder. Intenta de nuevo."),
        ]);
      }
    } finally {
      if (id === conversation.current) setBusy(false);
    }
  }

  return {
    messages,
    draft,
    busy,
    canSend: canSend(draft, busy),
    // Suggestions only until the person writes something
    suggestions: messages.some((m) => m.role === "user") ? [] : suggestions,
    minimized,
    pinned,
    setDraft,
    send,
    newConversation: () => {
      conversation.current++;
      setMessages([createMessage("sys", "Nueva conversación")]);
      setDraft("");
      setBusy(false);
    },
    toggleMinimized: () => setMinimized((m) => !m),
    togglePinned: () => setPinned((p) => !p),
  };
}

export type ChatViewModel = ReturnType<typeof useChatViewModel>;
