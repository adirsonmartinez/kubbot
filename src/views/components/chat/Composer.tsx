"use client";

// The box where the person writes: text, help while typing (hints and part names to complete), the model
// picker and the send button. While Qubi works for more than 3 seconds a border beam rides the box (the
// wait is long enough to deserve it; reduced motion turns it off). The picker's menu is drawn in the
// wrapper, outside the beam, because the beam clips what spills over its edge.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BorderBeam } from "border-beam";
import { BEAM_AFTER_MS, type ChatViewModel } from "@/viewmodels/useChatViewModel";
import { chatCopy } from "@/views/copy/chat";
import { Icon } from "../Icon";
import { useAfter, useReducedMotion } from "./hooks";
import { ModelPicker } from "./ModelPicker";

const copy = chatCopy.composer;
const MAX_HEIGHT = 160;

export function Composer({ vm }: { vm: ChatViewModel }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();
  const beam = useAfter(vm.busy, BEAM_AFTER_MS) && !reduced;
  const listOpen = vm.completions.length > 0;
  const setHostRef = useCallback((node: HTMLDivElement | null) => setHost(node), []);

  // The box grows with the text, up to a limit
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [vm.draft]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    // Enter sends the text as typed, unless the person picked a suggestion with the arrows
    const enterAccepts = e.key === "Enter" && vm.completionPicked;
    if (listOpen && !e.shiftKey) {
      const handled: Record<string, () => void> = {
        ArrowDown: () => vm.moveCompletion(1),
        ArrowUp: () => vm.moveCompletion(-1),
        Tab: () => vm.acceptCompletion(),
        Escape: () => vm.dismissCompletions(),
      };
      const act = enterAccepts ? () => vm.acceptCompletion() : handled[e.key];
      if (act) {
        e.preventDefault();
        act();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      vm.send();
    }
  }

  return (
    <div className="composer-wrap" ref={setHostRef}>
      <BorderBeam size="md" colorVariant="ocean" theme="dark" strength={0.85} active={beam} className="composer-beam">
        <form
          className="composer"
          aria-busy={vm.busy}
          onSubmit={(e) => {
            e.preventDefault();
            vm.send();
          }}
        >
          {(vm.hints.length > 0 || listOpen) && (
            <div className="composer-assist">
              {listOpen && (
                <ul id="chat-complete" className="composer-complete" role="listbox" aria-label={chatCopy.assist.completions}>
                  {vm.completions.map((c, i) => (
                    <li
                      key={c.id}
                      id={`chat-complete-${i}`}
                      role="option"
                      aria-selected={i === vm.activeCompletion}
                      className={i === vm.activeCompletion ? "active" : ""}
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep the cursor in the box
                        vm.acceptCompletion(i);
                      }}
                    >
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
              {vm.hints.map((h) => (
                <p key={h.kind} className={`assist-row ${h.kind}`}>
                  <Icon name={h.kind === "secret" ? "alert" : "info"} size={13} />
                  <span>{chatCopy.assist[h.kind]}</span>
                </p>
              ))}
            </div>
          )}
          <textarea
            ref={area}
            rows={2}
            value={vm.draft}
            onChange={(e) => vm.setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            aria-label={copy.label}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? "chat-complete" : undefined}
            aria-activedescendant={listOpen ? `chat-complete-${vm.activeCompletion}` : undefined}
          />
          <div className="composer-bar">
            <ModelPicker vm={vm} menuHost={host} />
            <button type="submit" className="send" disabled={!vm.canSend} aria-label={vm.busy ? copy.sendWorking : copy.send} title={vm.busy ? copy.sendWorking : copy.send}>
              <Icon name="arrowUp" size={16} />
            </button>
          </div>
        </form>
      </BorderBeam>
    </div>
  );
}
