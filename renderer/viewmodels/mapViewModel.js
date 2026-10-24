// The whole project as a map. In the middle, the project's plaza with its root files; around it, every
// top-level folder. Safe things stay calm, problems glow (amber / red) and come first. Opening a folder
// lays out its direct subfolders and files beside it; opening a subfolder goes one level down, beside the
// same top-level folder. Esc goes back up. It also routes clicks and coordinates the schema.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';
import { fileTags, folderGuide } from '../models/folderTags.js';
import { folderHeight, folderSlots, levelZoom, plazaGrid, sideGrid } from './layout.js';

const WELCOME_ZOOM = 1.9; // close to the plaza of a new project, where the robot stands
const emptyCounts = () => ({ green: 0, yellow: 0, red: 0, grey: 0 });
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const topFolderOf = (path) => path.split('/')[0];
const MAX_PLAZA_FILES = 24; // root files on the plaza; the rest is counted ("+N")
const MAX_SIDE_ITEMS = 48;  // subfolders and files beside an open folder
const byRisk = (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path);

export class MapViewModel {
  #project;
  #security;
  #camera;
  #supabase;
  #bus;
  #session = 0;
  #welcomeSession = null; // session of a project just created, until it gets its first file

  // `version` changes whenever the map must be redrawn; `path` is the open folder, at any depth ('' = none);
  // `welcome`: a new, empty project, where a robot on the plaza asks what to build
  store = new Observable({
    status: 'empty', session: 0, projectName: '', path: '', crumbs: [],
    root: null, plaza: null, buildings: [], opened: null, welcome: false, version: 0,
  });

  constructor({ projectModel, securityModel, camera, supabaseViewModel, bus }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#camera = camera;
    this.#supabase = supabaseViewModel;
    this.#bus = bus;

    projectModel.store.subscribe(() => this.#recompute());
    securityModel.store.subscribe(() => this.#recompute());
  }

  openProject() {
    return this.#project.choose();
  }

  closeProject() {
    return this.#project.close();
  }

  async createProject() {
    const response = await this.#project.create();
    if (response.ok) {
      this.#welcomeSession = this.#project.store.state.session;
      this.#recompute();
      if (this.store.state.welcome) this.#camera.flyTo({ x: 0, z: 0 }, WELCOME_ZOOM);
      this.#bus.emit(EVENTS.projectCreated, { name: response.data.name });
    }
    else if (!response.cancelled) this.#bus.emit(EVENTS.projectCreateFailed, { error: response.error });
    return response;
  }

  // pick: { type: 'folder', path } | { type: 'file', path } | { type: 'supabase' } | { type: 'table', name }
  handlePick(pick) {
    switch (pick.type) {
      case 'folder': return this.enterFolder(pick.path);
      case 'file': return this.selectFile(pick.path);
      case 'supabase': return this.toggleSchema();
      case 'table': return this.#supabase.selectTable(pick.name);
      default: return undefined;
    }
  }

  // Opens a folder at any depth beside its top-level folder ('' closes it)
  enterFolder(path) {
    if (path === this.store.state.path) return;
    const node = path && findNode(this.#project.store.state.tree, path);
    if (path && node?.type !== 'dir') return;
    this.#supabase.openSchema(false);
    this.#recompute({ path, announce: true });
  }

  // One level up: a subfolder goes back to its parent, a top-level folder closes
  goUp() {
    if (this.store.state.path !== '') this.enterFolder(parentOf(this.store.state.path));
  }

  // Shows a project file or folder (links in the chat, "ver: ruta"): opens the folder it is in, and a
  // file also opens its card in the chat. Returns false when the path is not in the project.
  show(path) {
    const node = findNode(this.#project.store.state.tree, path);
    if (!node) return false;
    const isDir = node.type === 'dir' || path === '';
    this.enterFolder(isDir ? path : parentOf(path));
    if (!isDir) this.selectFile(path);
    return true;
  }

  selectFile(path) {
    const node = findNode(this.#project.store.state.tree, path);
    if (!node || node.type === 'dir') return;
    const { level, reason, reasonKey, by } = this.#describeFile(node);
    this.#bus.emit(EVENTS.fileSelected, { path, level, reason, reasonKey, by });
  }

  toggleSchema() {
    this.#supabase.openSchema(!this.#supabase.store.state.schemaOpen);
  }

  // Esc closes the schema first, then the open folder
  escape() {
    if (this.#supabase.store.state.schemaOpen) this.#supabase.openSchema(false);
    else this.goUp();
  }

  // What the hover card shows for a pick (null = nothing to show)
  //   { kind: 'folder' | 'file', path, name, friendly?, tags, level, files?, red?, yellow?, size?, reason?, reasonKey? }
  describePick(pick) {
    const { buildings, plaza, opened } = this.store.state;
    if (pick.type === 'folder') {
      const b = [...buildings, ...(opened?.folders ?? [])].find((x) => x.path === pick.path);
      return b ? { kind: 'folder', ...b } : null;
    }
    if (pick.type === 'file') {
      const file = [...(plaza?.files ?? []), ...(opened?.files ?? [])].find((f) => f.path === pick.path);
      return file ? { kind: 'file', ...file, tags: fileTags(file.path) } : null;
    }
    return null;
  }

  // Where Remi goes to repair a file: next to its icon (the folder it is in opens), or the plaza for root files
  locateFile(path) {
    const folder = path.includes('/') ? topFolderOf(path) : '';
    if (folder) this.enterFolder(parentOf(path));
    const icon = this.store.state.opened?.files.find((f) => f.path === path);
    if (icon) return { folder, x: icon.x, z: icon.z, height: 1, radius: this.store.state.opened.size / 2 }; // just off the tray
    const plaza = this.store.state.plaza;
    return { folder, x: 0, z: 0, height: 1, radius: (plaza?.size ?? 5) / 2 };
  }

  // { counts, level, red, yellow } for every file under `nodes`
  #levelsOf(nodes) {
    const counts = emptyCounts();
    allFiles(nodes).forEach((f) => { counts[this.#security.scoreOf(f.path).level]++; });
    return { counts, level: worstLevel(Object.keys(counts).filter((l) => counts[l] > 0)), red: counts.red, yellow: counts.yellow };
  }

  // Tags and friendly name of a folder (shown in Vibe mode)
  #guideOf(path, nodes) {
    const guide = folderGuide(path, allFiles(nodes));
    return { tags: guide.tags, friendly: strings.describeFolder(guide, baseName(path)).name };
  }

  #describeFile(file) {
    const score = this.#security.scoreOf(file.path);
    const reason = score.reason || strings.security.reasons[score.reasonKey] || '';
    return {
      path: file.path, name: baseName(file.path), size: file.size ?? 0,
      level: score.level, reason, reasonKey: score.reasonKey, by: score.by,
    };
  }

  #announce(path, nodes) {
    const here = this.#levelsOf(nodes);
    this.#bus.emit(EVENTS.folderOpened, {
      name: path ? `${baseName(path)}/` : this.store.state.projectName,
      files: countFiles(nodes),
      folders: nodes.filter((c) => c.type === 'dir').length,
      counts: here.counts,
    });
  }

  // A folder with the levels of everything inside it
  #describeFolder(dir) {
    const nodes = dir.children ?? [];
    return { path: dir.path, name: baseName(dir.path), files: countFiles(nodes), ...this.#levelsOf(nodes) };
  }

  // Problems first (worst first), then by name
  #sortFolders(folders) {
    return folders.sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.path.localeCompare(b.path));
  }

  // The deepest folder of `path` that still exists ('' when none)
  #existing(tree, path) {
    while (path && findNode(tree, path)?.type !== 'dir') path = parentOf(path);
    return path;
  }

  #recompute({ path = this.store.state.path, announce = false } = {}) {
    const { open, name, tree, usesSupabase, session } = this.#project.store.state;
    const newSession = session !== this.#session;
    this.#session = session;
    if (newSession) path = '';
    path = open ? this.#existing(tree, path) : '';

    if (!open) {
      this.store.set({ status: 'empty', path: '', crumbs: [], root: null, plaza: null, buildings: [], opened: null, welcome: false, version: this.store.state.version + 1 });
      return;
    }

    const projectName = name ?? strings.map.defaultProjectName;
    const project = this.#levelsOf(tree);
    const total = countFiles(tree);
    if (this.#welcomeSession !== session || total > 0) this.#welcomeSession = null;

    // Plaza: the root files, riskiest first
    const rootFiles = tree.filter((c) => c.type === 'file').map((f) => this.#describeFile(f)).sort(byRisk);
    const files = rootFiles.slice(0, MAX_PLAZA_FILES);
    const grid = plazaGrid(files.length);

    // Every top-level folder, problems first
    const dirs = this.#sortFolders(tree.filter((c) => c.type === 'dir').map((dir) => ({ ...this.#describeFolder(dir), node: dir })));
    const top = path ? topFolderOf(path) : '';
    const slots = folderSlots(dirs.length, { plazaSize: grid.size, avoidSupabase: usesSupabase });
    const buildings = dirs.map(({ node, ...folder }, i) => ({
      ...folder,
      x: slots[i].x,
      z: slots[i].z,
      height: folderHeight(folder.files),
      ...this.#guideOf(folder.path, node.children ?? []),
      open: folder.path === top,
      order: i,
    }));

    // The open folder's direct contents, beside its top-level folder: subfolders first, then files
    const openBuilding = buildings.find((b) => b.open);
    let opened = null;
    if (openBuilding) {
      const children = findNode(tree, path).children ?? [];
      const subfolders = this.#sortFolders(children.filter((c) => c.type === 'dir').map((d) => this.#describeFolder(d)));
      const inside = children.filter((c) => c.type === 'file').map((f) => this.#describeFile(f)).sort(byRisk);
      const shown = [...subfolders, ...inside].slice(0, MAX_SIDE_ITEMS);
      const side = sideGrid(shown.length, openBuilding);
      const placed = shown.map((item, i) => ({ ...item, ...side.slots[i] }));
      opened = {
        path,
        top,
        x: side.x,
        z: side.z,
        size: side.size,
        folders: placed.slice(0, Math.min(subfolders.length, shown.length)),
        files: placed.slice(subfolders.length),
        more: subfolders.length + inside.length - shown.length,
      };
    }

    // Project, then each folder down to the open one
    const crumbs = [{ name: projectName, path: '' }];
    path.split('/').filter(Boolean).forEach((name, i, parts) => crumbs.push({ name, path: parts.slice(0, i + 1).join('/') }));

    this.store.set({
      status: 'ready',
      session,
      projectName,
      path,
      crumbs,
      // Whole project (HUD)
      root: {
        total,
        dirs: countDirs(tree),
        ...project,
        // Share of evaluated files that are safe (100 when there is nothing to evaluate)
        securityScore: total ? Math.round((project.counts.green / total) * 100) : 100,
      },
      // The project's plaza; counts are the open folder's (at any depth), or the whole project's
      plaza: {
        name: projectName,
        files,
        more: rootFiles.length - files.length,
        cols: grid.cols,
        size: grid.size,
        total,
        folders: buildings.length,
        ...(opened ? this.#levelsOf(findNode(tree, path).children ?? []) : project),
      },
      buildings,
      opened,
      welcome: this.#welcomeSession !== null,
      version: this.store.state.version + 1,
    });

    this.#supabase.setOnScreen(true);
    if (opened) {
      if (announce) this.#camera.flyTo({ x: (openBuilding.x + opened.x) / 2, z: (openBuilding.z + opened.z) / 2 }, 1.1);
    } else if (newSession || announce) {
      this.#camera.flyTo({ x: 0, z: 0 }, levelZoom(grid.size, buildings.length));
    }
    if (announce && path) this.#announce(path, findNode(tree, path).children ?? []);
  }
}
