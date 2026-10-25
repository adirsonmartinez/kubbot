"use client";

// ViewModel for the workspace frame: which side panel is open.

import { useState } from "react";

// `initial`: the panel open when the workspace starts (null: none)
export function useShellViewModel<Side extends string>(initial: Side | null = null) {
  const [side, setSide] = useState<Side | null>(initial);

  return {
    side,
    sidebarOpen: side !== null,
    // The dock button toggles: pressing the open panel closes it
    toggleSide: (next: Side) => setSide((current) => (current === next ? null : next)),
    closeSidebar: () => setSide(null),
  };
}

export type ShellViewModel<Side extends string> = ReturnType<typeof useShellViewModel<Side>>;
