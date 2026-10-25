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

// The conversation as text to save (Markdown): who said what, the cards of what Qubi did and the tasks.
// The labels come from the caller so this file holds no copy.
export type TranscriptEntry = {
  role: ChatRole;
  text: string;
  card?: boolean;
  voice?: boolean;
  task?: { goal: string; steps: { text: string; state: string }[] };
  run?: unknown;
};
export type TranscriptLabels = { title: string; you: string; qubi: string; task: string; voice: string; date?: string };

export function transcript(entries: TranscriptEntry[], labels: TranscriptLabels): string {
  const out: string[] = [`# ${labels.title}`];
  if (labels.date) out.push(`_${labels.date}_`);
  for (const e of entries) {
    if (e.run) continue; // the progress card is not part of what was said
    if (e.task) {
      const steps = e.task.steps.map((s) => `- [${s.state === "done" ? "x" : " "}] ${s.text}`);
      out.push(`**${labels.task}:** ${e.task.goal}\n${steps.join("\n")}`);
    } else if (e.card) {
      out.push(`- ${e.text}`);
    } else if (e.role === "user" || e.role === "bot") {
      const who = e.role === "user" ? labels.you : labels.qubi;
      out.push(`**${who}${e.voice ? ` (${labels.voice})` : ""}:** ${e.text}`);
    } else if (e.text.trim()) {
      out.push(`_${e.text}_`);
    }
  }
  return `${out.join("\n\n")}\n`;
}
