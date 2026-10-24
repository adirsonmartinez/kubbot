// What the welcome robot set up in a new project and is still waiting for the person's account: the map
// shows those integrations as 'pending' ("Por conectar") instead of connected. Remembered per project
// folder (its full path, so two folders with the same name never share it) in this computer (localStorage).
// Connecting an account (project B) calls markConnected.
const KEY = (root) => `platanus.setup.v1:${root}`;

export class SetupModel {
  prepare(root, integrations) {
    if (!root) return;
    this.#save(root, [...integrations]);
  }

  pendingOf(root) {
    if (!root) return [];
    try {
      const list = JSON.parse(localStorage.getItem(KEY(root)) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  markConnected(root, key) {
    if (!root) return;
    this.#save(root, this.pendingOf(root).filter((k) => k !== key));
  }

  #save(root, list) {
    try { localStorage.setItem(KEY(root), JSON.stringify(list)); } catch { /* private mode */ }
  }
}
