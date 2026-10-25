// One line of the conversation: what the person wrote, Qubi's answer (formatted), a short card of what he
// did on the bench, a system note, the task card or the run card of an answer.

import type { ChatEntry } from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";
import { qubiCopy } from "@/views/copy/qubi";
import { TaskCard } from "../qubi/TaskCard";
import { Markdown } from "./Markdown";
import { RunCard } from "./RunCard";

// A small microphone that marks what was said in a call
function MicMark() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function Message({ m }: { m: ChatEntry }) {
  if (m.run) return <RunCard run={m.run} />;
  if (m.task) return <TaskCard task={m.task} />;
  const voice = m.voice && m.role !== "sys" && (
    <span className="msg-voice" title={qubiCopy.tasks.voiceLine} role="img" aria-label={qubiCopy.tasks.voiceLine}>
      <MicMark />
    </span>
  );
  if (m.role === "bot") {
    return (
      <div className={`msg bot${m.voice ? " voice" : ""}`}>
        {voice}
        <Markdown text={m.text} />
        {m.tag && <span className="msg-tag">{m.tag}</span>}
      </div>
    );
  }
  return (
    <div className={`msg ${m.role}${m.card ? " card" : ""}${m.voice ? " voice" : ""}`}>
      {voice}
      {m.text}
      {m.tag && <span className="msg-tag">{m.tag}</span>}
    </div>
  );
}

// Qubi is thinking and no run card shows it yet (his question is waiting its turn)
export function WaitingRow() {
  return (
    <div className="msg sys waiting" role="status">
      {chatCopy.run.waiting}
    </div>
  );
}
