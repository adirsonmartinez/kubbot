// The project map, one folder level at a time. In the middle, a plaza with the folder's own files
// (cubes with their traffic light); around it, its subfolders as blocks. Clicking a block enters
// that folder; the breadcrumb or Esc go back up. It also routes clicks and coordinates the schema.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';
import { fileTags, folderGuide } from '../models/folderTags.js';
import { folderHeight, folderSlots, levelZoom, plazaGrid } from './layout.js';

const emptyCounts = () => ({ green: 0, yellow: 0, red: 0, grey: 0 });
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export class MapViewModel {
  #project;
  #security;
  #camera;
  #supabase;
  #bus;
  #session = 0;

  // `version` changes whenever the level must be redrawn; `path` is the folder on screen ('' = root)
  store = new Observable({
    status: 'empty', session: 0, projectName: '', path: '', crumbs: [],
    root: null, plaza: null, buildings: [], version: 0,
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
    if (response.ok) this.#bus.emit(EVENTS.projectCreated, { name: response.data.name });
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

  enterFolder(path) {
    if (path === this.store.state.path) return;
    if (!findNode(this.#project.store.state.tree, path)) return;
    this.#supabase.openSchema(false);
    this.#recompute({ path, announce: true });
  }

  goUp() {
    const { path } = this.store.state;
    if (path !== '') this.enterFolder(parentOf(path));
  }

  selectFile(path) {
    const file = this.store.state.plaza?.files.find((f) => f.path === path);
    if (!file) return;
    const { level, reason, reasonKey, by } = file;
    this.#bus.emit(EVENTS.fileSelected, { path, level, reason, reasonKey, by });
  }

  toggleSchema() {
    this.#supabase.openSchema(!this.#supabase.store.state.schemaOpen);
  }

  // Esc closes the schema first, then goes up one folder
  escape() {
    if (this.#supabase.store.state.schemaOpen) this.#supabase.openSchema(false);
    else this.goUp();
  }

  // What the hover card shows for a pick (null = nothing to show)
  //   { kind: 'folder' | 'file', path, name, friendly?, tags, level, files?, red?, yellow?, size?, reason?, reasonKey? }
  describePick(pick) {
    const { buildings, plaza } = this.store.state;
    if (pick.type === 'folder') {
      const b = buildings.find((x) => x.path === pick.path);
      return b ? { kind: 'folder', ...b } : null;
    }
    if (pick.type === 'file') {
      const file = plaza?.files.find((f) => f.path === pick.path);
      return file ? { kind: 'file', ...file, tags: fileTags(file.path) } : null;
    }
    return null;
  }

  // Where Remi goes to repair a file: the map moves to the file's folder and he walks to its plaza
  locateFile(path) {
    const folder = parentOf(path);
    if (folder !== this.store.state.path) this.enterFolder(folder);
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

  #recompute({ path = this.store.state.path, announce = false } = {}) {
    const { open, name, tree, usesSupabase, session } = this.#project.store.state;
    const newSession = session !== this.#session;
    this.#session = session;
    if (newSession) path = '';

    if (!open) {
      this.store.set({ status: 'empty', path: '', crumbs: [], root: null, plaza: null, buildings: [], version: this.store.state.version + 1 });
      return;
    }

    // The folder may have disappeared after a disk change: fall back to its closest existing parent
    let node = findNode(tree, path);
    while (!node && path) {
      path = parentOf(path);
      node = findNode(tree, path);
    }

    const projectName = name ?? strings.map.defaultProjectName;
    const children = node.children ?? [];
    const project = this.#levelsOf(tree);
    const total = countFiles(tree);
    const atRoot = path === '';

    // Plaza: the folder's own files, riskiest first
    const files = children
      .filter((c) => c.type === 'file')
      .map((f) => this.#describeFile(f))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.name.localeCompare(b.name));
    const grid = plazaGrid(files.length);
    const here = this.#levelsOf(children);

    // Subfolders around it, biggest closest
    const dirs = children
      .filter((c) => c.type === 'dir')
      .sort((a, b) => countFiles(b.children ?? []) - countFiles(a.children ?? []));
    const slots = folderSlots(dirs.length, { plazaSize: grid.size, avoidSupabase: atRoot && usesSupabase });

    const crumbs = [{ name: projectName, path: '' }];
    if (!atRoot) path.split('/').forEach((part, i, parts) => crumbs.push({ name: part, path: parts.slice(0, i + 1).join('/') }));

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
      // Current folder
      plaza: {
        name: atRoot ? projectName : baseName(path),
        files,
        cols: grid.cols,
        size: grid.size,
        total: countFiles(children),
        folders: dirs.length,
        ...here,
      },
      buildings: dirs.map((dir, i) => ({
        path: dir.path,
        name: baseName(dir.path),
        x: slots[i].x,
        z: slots[i].z,
        files: countFiles(dir.children ?? []),
        height: folderHeight(countFiles(dir.children ?? [])),
        ...this.#levelsOf(dir.children ?? []),
        ...this.#guideOf(dir.path, dir.children ?? []),
        order: i,
      })),
      version: this.store.state.version + 1,
    });

    this.#supabase.setOnScreen(atRoot);
    if (newSession || announce) this.#camera.flyTo({ x: 0, z: 0 }, levelZoom(grid.size, dirs.length));
    if (announce) {
      this.#bus.emit(EVENTS.folderOpened, {
        name: atRoot ? projectName : `${baseName(path)}/`,
        files: countFiles(children),
        folders: dirs.length,
        counts: here.counts,
      });
    }
  }
}
