// Chat messages: who said what. No React, no I/O.

export type ChatRole = "user" | "bot" | "sys";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

let nextId = 0;

export function createMessage(role: ChatRole, text: string): ChatMessage {
  return { id: `m${++nextId}`, role, text };
}

export function canSend(draft: string, busy: boolean): boolean {
  return !busy && draft.trim().length > 0;
}
