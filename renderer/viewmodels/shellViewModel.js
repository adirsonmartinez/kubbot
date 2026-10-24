// IDE shell state: which side view is active, which panels are visible, and the data the sidebar
// shows (folders and files with their security level). No DOM, no three.js.
import { Observable } from '../core/observable.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK } from '../models/securityModel.js';

export const SIDE_VIEWS = ['explorer', 'risks'];

export class ShellViewModel {
  #projectModel;
  #securityModel;
  #mapViewModel;

  store = new Observable({
    side: 'explorer',
    stage: 'map', // 'map' | 'graph'
    sidebarOpen: true,
    chatOpen: true,
    projectName: '',
    open: false,
    folders: [], // [{ path, name, files: [{ path, name, level }] }]
    risks: [], // files in red or yellow, worst first
    counts: { green: 0, yellow: 0, red: 0, grey: 0 },
  });

  // `compact`: small screens start with the map alone; panels open on demand
  constructor({ projectModel, securityModel, mapViewModel, compact = false }) {
    if (compact) this.store.set({ sidebarOpen: false, chatOpen: false });
    this.#projectModel = projectModel;
    this.#securityModel = securityModel;
    this.#mapViewModel = mapViewModel;
    projectModel.store.subscribe(() => this.#recompute());
    securityModel.store.subscribe(() => this.#recompute());
    this.#recompute();
  }

  setSide(side) {
    if (!SIDE_VIEWS.includes(side)) return;
    const { side: current, sidebarOpen } = this.store.state;
    // Clicking the active view again collapses the sidebar, like VS Code
    this.store.set(current === side && sidebarOpen ? { sidebarOpen: false } : { side, sidebarOpen: true });
  }

  setStage(stage) {
    if (stage === 'map' || stage === 'graph') this.store.set({ stage });
  }

  toggleSidebar() {
    this.store.set({ sidebarOpen: !this.store.state.sidebarOpen });
  }

  toggleChat() {
    this.store.set({ chatOpen: !this.store.state.chatOpen });
  }

  openProject() {
    this.#mapViewModel.openProject();
  }

  // Opens the building of a folder on the map ('' = back to the whole map)
  showFolder(path) {
    this.store.set({ stage: 'map' }); // the building is on the map, so show it
    if (path) this.#mapViewModel.openFolder(path);
    else this.#mapViewModel.closeFolder();
  }

  // A file lives in the building of its folder
  showFile(path) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    this.showFolder(folder);
  }

  #recompute() {
    const { open, name, tree } = this.#projectModel.store.state;
    const counts = { green: 0, yellow: 0, red: 0, grey: 0 };
    const withLevel = (node) => {
      const { level, reason, reasonKey } = this.#securityModel.scoreOf(node.path);
      counts[level] += 1;
      return { path: node.path, name: baseName(node.path), level, reason, reasonKey };
    };
    const rootFiles = tree.filter((n) => n.type === 'file').map(withLevel);
    const folders = tree
      .filter((n) => n.type === 'dir')
      .map((dir) => ({ path: dir.path, name: baseName(dir.path), files: allFiles(dir.children ?? []).map(withLevel) }));
    if (rootFiles.length) folders.unshift({ path: '', name: '', files: rootFiles });
    const risks = folders
      .flatMap((f) => f.files)
      .filter((f) => f.level === 'red' || f.level === 'yellow')
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    this.store.set({ open, projectName: name ?? '', folders, risks, counts });
  }
}
