"use client";

// The top of the chat: Qubi's avatar (it works while he works), his name with the one metal badge of the
// panel, what he is doing, and the pin, minimize and "more" buttons.

import { BotAvatar } from "bot-avatars";
import { MetalBadge } from "metal-fx";
import type { ChatViewModel } from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";
import { Icon } from "../Icon";
import { useMounted, useReducedMotion } from "./hooks";
import { ChatMenu } from "./ChatMenu";
import type { ReactNode } from "react";

// The badge is liquid metal (WebGL2, browser only). With reduced motion, or before the page is in the
// browser, it is a plain label: the shader does not read the setting by itself.
function Badge() {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  if (!mounted || reduced) return <span className="chat-badge">{chatCopy.badge}</span>;
  return (
    <span className="chat-badge metal">
      <MetalBadge>{chatCopy.badge}</MetalBadge>
    </span>
  );
}

// `actions`: extra buttons before the pin (the call button)
export function ChatHeader({ vm, agentName, status, actions }: { vm: ChatViewModel; agentName: string; status: string; actions?: ReactNode }) {
  const working = vm.activity !== null;
  return (
    <header className="chat-head">
      <div className="chat-avatar" aria-hidden>
        <BotAvatar type="square" state={working || vm.busy ? "working" : "default"} size={32} aria-hidden="true" />
      </div>
      <div className="chat-title">
        <strong>
          {agentName}
          <Badge />
        </strong>
        <span>{vm.activity ? chatCopy.activity[vm.activity] : status}</span>
      </div>
      {actions}
      <button
        type="button"
        className={`icon-button ${vm.pinned ? "on" : ""}`}
        aria-pressed={vm.pinned}
        onClick={vm.togglePinned}
        title={vm.pinned ? chatCopy.unpin : chatCopy.pin}
        aria-label={vm.pinned ? chatCopy.unpin : chatCopy.pin}
      >
        <Icon name="pin" size={16} />
      </button>
      <button type="button" className="icon-button" onClick={vm.toggleMinimized} title={chatCopy.minimize} aria-label={chatCopy.minimize}>
        <Icon name="minus" size={16} />
      </button>
      <ChatMenu onNewChat={vm.newConversation} onSave={vm.exportChat} canSave={vm.messages.some((m) => m.role === "user" || m.role === "bot")} />
    </header>
  );
}
