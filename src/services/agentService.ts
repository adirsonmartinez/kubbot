// Agent replies. Demo for now: swap this for a call to a route handler with a real model.

import type { ChatMessage } from "@/models/chat";

const DEMO_DELAY_MS = 700;

export async function replyTo(history: ChatMessage[]): Promise<string> {
  const last = history.findLast((m) => m.role === "user");
  await new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));
  return `Recibí: "${last?.text ?? ""}". Todavía no hay un modelo conectado; esta es una respuesta de ejemplo.`;
}
