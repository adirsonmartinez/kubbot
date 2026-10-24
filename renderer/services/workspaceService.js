// Access to the project on disk. Inside Electron everything goes through window.platanus
// (the preload bridge). In a plain browser it serves a demo project so the UI can be built without Electron.
import { DEMO_TREE } from '../models/demoProject.js';

const DESKTOP_ONLY = { ok: false, error: 'desktop-only' };

export function createWorkspaceService(bridge = window.platanus) {
  if (!bridge) {
    return {
      isDesktop: false,
      choose: async () => ({ ok: true, data: { name: 'demo', root: null } }),
      current: async () => ({ ok: true, data: null }),
      tree: async () => ({ ok: true, data: DEMO_TREE }),
      read: async () => DESKTOP_ONLY,
      mkdir: async () => DESKTOP_ONLY,
      write: async () => DESKTOP_ONLY,
      remove: async () => DESKTOP_ONLY,
      onChanged: () => () => {},
    };
  }

  return {
    isDesktop: true,
    choose: () => bridge.chooseWorkspace(),
    current: () => bridge.currentWorkspace(),
    tree: (path = '.') => bridge.tree(path),
    read: (path) => bridge.read(path),
    mkdir: (path) => bridge.mkdir(path),
    write: (path, content) => bridge.write(path, content),
    remove: (path) => bridge.remove(path),
    onChanged: (callback) => bridge.onChanged(callback),
  };
}
