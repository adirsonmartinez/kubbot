"use client";

// ViewModel for the workspace frame: which side panel is open and which view (tab) is active.

import { useState } from "react";

export function useShellViewModel<Side extends string, Tab extends string>({
  initialTab,
}: {
  initialTab: Tab;
}) {
  const [side, setSide] = useState<Side | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  return {
    side,
    sidebarOpen: side !== null,
    tab,
    // The dock button toggles: pressing the open panel closes it
    toggleSide: (next: Side) => setSide((current) => (current === next ? null : next)),
    closeSidebar: () => setSide(null),
    setTab,
  };
}

export type ShellViewModel<Side extends string, Tab extends string> = ReturnType<
  typeof useShellViewModel<Side, Tab>
>;
