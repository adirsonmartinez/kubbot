// The whole project as a tree that unfolds down the screen. At the top, the project's plaza with its root
// files; below it, a row with every top-level folder. Opening a folder unfolds its direct subfolders and
// files in a block below it, and opening one of those unfolds one more level: one path at a time (opening
// another folder folds the rest). Safe things stay calm, problems glow (amber / red) and come first.
// Above the plaza, a darker band holds the integrations. Esc goes back up. It also routes clicks and
// coordinates the schema.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';
import { fileTags, folderGuide } from '../models/folderTags.js';
import { fitView, folderHeight, INTEGRATIONS, plazaGrid, screenOf, toWorld, TREE, treeBlock } from './layout.js';

const WELCOME_ZOOM = 1.9; // close to the plaza of a new project, where the robot stands
const emptyCounts = () => ({ green: 0, yellow: 0, red: 0, grey: 0 });
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const topFolderOf = (path) => path.split('/')[0];
const MAX_PLAZA_FILES = 24; // root files on the plaza; the rest is counted ("+N")
const MAX_BRANCH_ITEMS = 48; // subfolders and files below an open folder
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
    root: null, plaza: null, buildings: [], branches: [], opened: null, links: [], band: null, welcome: false, version: 0,
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
    const { buildings, plaza, branches } = this.store.state;
    if (pick.type === 'folder') {
      const b = [...buildings, ...branches.flatMap((x) => x.folders)].find((x) => x.path === pick.path);
      return b ? { kind: 'folder', ...b } : null;
    }
    if (pick.type === 'file') {
      const file = [...(plaza?.files ?? []), ...branches.flatMap((x) => x.files)].find((f) => f.path === pick.path);
      return file ? { kind: 'file', ...file, tags: fileTags(file.path) } : null;
    }
    return null;
  }

  // Where Remi goes to repair a file: next to its icon (the folder it is in opens), or the plaza for root files
  locateFile(path) {
    const folder = path.includes('/') ? topFolderOf(path) : '';
    if (folder) this.enterFolder(parentOf(path));
    const icon = this.store.state.opened?.files.find((f) => f.path === path);
    if (icon) return { folder, x: icon.x, z: icon.z, height: 1, radius: 1.6 }; // just off the icon
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
    const { open, name, tree, session } = this.#project.store.state;
    const newSession = session !== this.#session;
    this.#session = session;
    if (newSession) path = '';
    path = open ? this.#existing(tree, path) : '';

    if (!open) {
      this.store.set({ status: 'empty', path: '', crumbs: [], root: null, plaza: null, buildings: [], branches: [], opened: null, links: [], band: null, welcome: false, version: this.store.state.version + 1 });
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

    // Links of the tree, in world coordinates [x1, z1, x2, z2, kind]
    const links = [];
    const addLinks = (block, kind) => block.links.forEach(([u1, v1, u2, v2]) => {
      const a = toWorld(u1, v1), b = toWorld(u2, v2);
      links.push([a.x, a.z, b.x, b.z, kind]);
    });

    // Every top-level folder, problems first, in rows below the plaza
    const dirs = this.#sortFolders(tree.filter((c) => c.type === 'dir').map((dir) => ({ ...this.#describeFolder(dir), node: dir })));
    const top = path ? topFolderOf(path) : '';
    const topOptions = { parentU: 0, parentV: 0, startV: grid.size * Math.SQRT1_2 + TREE.gap + TREE.itemHalf.top, ...TREE.top };
    const topIndex = dirs.findIndex((d) => d.path === top);

    // The open path: each folder on it unfolds its direct contents (subfolders first, then files) right
    // below it. Its row of top-level folders stays put; the rows under it move down to make room.
    const firstBlock = treeBlock(dirs.length, topOptions);
    const branches = [];
    const branchLinks = [];
    let parent = topIndex >= 0 ? firstBlock.slots[topIndex] : null; // { u, v } on screen
    let endV = parent ? parent.v + TREE.itemHalf.top : 0;
    const levels = path ? path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')) : [];
    for (const dirPath of levels) {
      if (!parent) break;
      const children = findNode(tree, dirPath).children ?? [];
      const subfolders = this.#sortFolders(children.filter((c) => c.type === 'dir').map((d) => this.#describeFolder(d)));
      const inside = children.filter((c) => c.type === 'file').map((f) => this.#describeFile(f)).sort(byRisk);
      const shown = [...subfolders, ...inside].slice(0, MAX_BRANCH_ITEMS);
      // Kept right of the top-level rows' spine (when they wrap), so the branch never runs over it
      const minU = firstBlock.spine === null ? -Infinity : firstBlock.spine + 2;
      const block = treeBlock(shown.length, { parentU: parent.u, parentV: parent.v, startV: endV + TREE.gap + TREE.itemHalf.branch, minU, ...TREE.branch });
      branchLinks.push(block);
      const next = levels[branches.length + 1];
      const placed = shown.map((item, i) => ({ ...item, ...toWorld(block.slots[i].u, block.slots[i].v), open: item.path === next }));
      branches.push({
        path: dirPath,
        top,
        ...toWorld(parent.u, (endV + block.endV) / 2 + TREE.gap),
        width: block.width,
        folders: placed.slice(0, Math.min(subfolders.length, shown.length)),
        files: placed.slice(subfolders.length),
        more: subfolders.length + inside.length - shown.length,
      });
      endV = block.endV + TREE.itemHalf.branch;
      const openIndex = placed.findIndex((item) => item.open);
      parent = openIndex >= 0 ? block.slots[openIndex] : null;
    }

    // The top-level rows, with a gap under the open folder's row as tall as its branches
    const openRow = topIndex >= 0 ? Math.floor(topIndex / TREE.top.cols) : -1;
    const gap = branches.length ? endV - (firstBlock.slots[topIndex].v + TREE.itemHalf.top) + TREE.gap : 0;
    const topBlock = treeBlock(dirs.length, { ...topOptions, insert: gap ? { row: openRow, height: gap } : null });
    addLinks(topBlock, 'top');
    branchLinks.forEach((block) => addLinks(block, 'branch'));
    const buildings = dirs.map(({ node, ...folder }, i) => ({
      ...folder,
      ...toWorld(topBlock.slots[i].u, topBlock.slots[i].v),
      height: folderHeight(folder.files),
      ...this.#guideOf(folder.path, node.children ?? []),
      open: folder.path === top,
      order: i,
    }));
    const opened = branches.at(-1) ?? null;

    // The integrations band, across the top, as wide as the tree
    const treeU = [0, ...links.flatMap(([x1, z1, x2, z2]) => [screenOf(x1, z1).u, screenOf(x2, z2).u])];
    const halfWidth = Math.max(INTEGRATIONS.minWidth / 2, ...treeU.map(Math.abs)) + INTEGRATIONS.margin;
    const bandCenter = toWorld(0, (INTEGRATIONS.bandTop + INTEGRATIONS.bandBottom) / 2);
    const band = { ...bandCenter, width: halfWidth * 2, depth: INTEGRATIONS.bandBottom - INTEGRATIONS.bandTop };

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
        ...(path ? this.#levelsOf(findNode(tree, path).children ?? []) : project),
      },
      buildings,
      branches,
      opened,
      links,
      band,
      welcome: this.#welcomeSession !== null,
      version: this.store.state.version + 1,
    });

    this.#supabase.setOnScreen(true);
    if (opened) {
      // The newest level, with its parent folder above it
      if (announce) {
        const items = [...opened.folders, ...opened.files];
        const view = fitView([...items, branches.length > 1 ? branches.at(-2).folders.find((f) => f.open) : buildings.find((b) => b.open)]);
        this.#camera.flyTo(view, Math.min(view.zoom, 1.1));
      }
    } else if (newSession || announce) {
      // From the integrations (their nodes, not the empty ends of the band) down to the top-level folders
      const bottom = topBlock.endV + TREE.itemHalf.top;
      const width = Math.max(topBlock.width / 2, 6) + 3;
      const nodes = (INTEGRATIONS.bandTop + INTEGRATIONS.bandBottom) / 2;
      const view = fitView([toWorld(-6, nodes), toWorld(6, nodes), toWorld(-width, bottom), toWorld(width, bottom)]);
      this.#camera.flyTo(view, view.zoom);
    }
    if (announce && path) this.#announce(path, findNode(tree, path).children ?? []);
  }
}
