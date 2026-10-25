"use client";

// ViewModel for the workspace frame: which side panel is open.

import { useState } from "react";

export function useShellViewModel<Side extends string>() {
  const [side, setSide] = useState<Side | null>(null);

  return {
    side,
    sidebarOpen: side !== null,
    // The dock button toggles: pressing the open panel closes it
    toggleSide: (next: Side) => setSide((current) => (current === next ? null : next)),
    closeSidebar: () => setSide(null),
  };
}

export type ShellViewModel<Side extends string> = ReturnType<typeof useShellViewModel<Side>>;
