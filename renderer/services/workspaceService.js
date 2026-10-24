// Access to the project on disk. Inside Electron everything goes through window.platanus
// (the preload bridge). In a plain browser it serves a demo project so the UI can be built without Electron.
import { DEMO_TREE } from '../models/demoProject.js';
import { DEMO_GIT } from '../models/demoGit.js';

const DESKTOP_ONLY = { ok: false, error: 'desktop-only' };

export function createWorkspaceService(bridge = window.platanus) {
  if (!bridge) {
    // A new project in the browser is an empty folder without git; opening one brings the demo back
    let demo = { tree: DEMO_TREE, git: DEMO_GIT };
    return {
      isDesktop: false,
      choose: async () => {
        demo = { tree: DEMO_TREE, git: DEMO_GIT };
        return { ok: true, data: { name: 'demo', root: null } };
      },
      create: async () => {
        demo = { tree: [], git: { isRepo: false } };
        return { ok: true, data: { name: 'nuevo-proyecto', root: null } };
      },
      current: async () => ({ ok: true, data: null }),
      recent: async () => ({ ok: true, data: [] }),
      openRecent: async () => DESKTOP_ONLY,
      tree: async () => ({ ok: true, data: demo.tree }),
      read: async () => DESKTOP_ONLY,
      mkdir: async () => DESKTOP_ONLY,
      write: async () => DESKTOP_ONLY,
      remove: async () => DESKTOP_ONLY,
      gitHistory: async () => ({ ok: true, data: demo.git }),
      onChanged: () => () => {},
    };
  }

  return {
    isDesktop: true,
    choose: () => bridge.chooseWorkspace(),
    create: () => bridge.createWorkspace(),
    current: () => bridge.currentWorkspace(),
    recent: () => bridge.recentWorkspaces(),
    openRecent: (root) => bridge.openRecentWorkspace(root),
    tree: (path = '.') => bridge.tree(path),
    read: (path) => bridge.read(path),
    mkdir: (path) => bridge.mkdir(path),
    write: (path, content) => bridge.write(path, content),
    remove: (path) => bridge.remove(path),
    gitHistory: () => bridge.gitHistory(),
    onChanged: (callback) => bridge.onChanged(callback),
  };
}
