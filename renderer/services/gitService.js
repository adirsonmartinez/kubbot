// Git service: bridges the renderer to the git IPC channels exposed by the preload.
// In a plain browser (no Electron) every write call returns desktop-only so the UI still works.
// Reads use the existing gitHistory IPC. Writes use the new channels added in this feature branch.

const DESKTOP_ONLY = { ok: false, error: 'desktop-only' };

export function createGitService(bridge = window.platanus) {
  if (!bridge?.gitCommit) {
    // Browser demo mode: all writes are stubs; reads delegate to workspaceService via gitModel.
    return {
      isDesktop: false,
      commit: async () => DESKTOP_ONLY,
      revert: async () => DESKTOP_ONLY,
      reset: async () => DESKTOP_ONLY,
      createBranch: async () => DESKTOP_ONLY,
      checkout: async () => DESKTOP_ONLY,
      onChanged: () => () => {},
    };
  }

  return {
    isDesktop: true,
    commit: (message) => bridge.gitCommit(message),
    revert: (sha) => bridge.gitRevert(sha),
    reset: (sha) => bridge.gitReset(sha),
    createBranch: (name) => bridge.gitCreateBranch(name),
    checkout: (target) => bridge.gitCheckout(target),
    // Returns an unsubscribe fn. Fires ({ op, sha?, name?, target?, data }) on any git write.
    onChanged: (callback) => bridge.onGitChanged ? bridge.onGitChanged(callback) : () => {},
  };
}
