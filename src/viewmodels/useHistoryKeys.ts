"use client";

// Undo / redo from the keyboard: Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z and Ctrl+Y redo. Ignored while the
// person is typing (a field keeps its own undo). The commands decide whether there is anything to do.

import { useEffect, useRef } from "react";

const TYPING = "input, textarea, select, [contenteditable]";

export function useHistoryKeys(onUndo: () => void, onRedo: () => void) {
  const commands = useRef({ onUndo, onRedo });
  useEffect(() => {
    commands.current = { onUndo, onRedo };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || !(e.ctrlKey || e.metaKey)) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) commands.current.onRedo();
        else commands.current.onUndo();
      } else if (key === "y" && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        commands.current.onRedo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
