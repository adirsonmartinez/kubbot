// The project map: the main building (root folder) and one building per first-level folder.
// It also coordinates what is "open" (a building or the Supabase schema) and routes clicks.
import { Observable } from '../core/observable.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { worstLevel } from '../models/securityModel.js';
import { folderHeight as folderHeightOf, folderSlots, hqHeight } from './layout.js';
import { fileTags, folderGuide, folderTags } from '../models/folderTags.js';

export class MapViewModel {
  #project;
  #security;
  #camera;
  #tower;
  #supabase;
  #session = 0;

  // `version` changes whenever the buildings must be redrawn
  store = new Observable({ status: 'empty', session: 0, projectName: '', root: null, buildings: [], version: 0 });

  constructor({ projectModel, securityModel, camera, towerViewModel, supabaseViewModel }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#camera = camera;
    this.#tower = towerViewModel;
    this.#supabase = supabaseViewModel;

    projectModel.store.subscribe(() => this.#recompute());
    securityModel.store.subscribe(() => this.#recompute());
  }

  openProject() {
    return this.#project.choose();
  }

  // pick: { type: 'folder', path } | { type: 'floor', index } | { type: 'file', path }
  //     | { type: 'supabase' } | { type: 'table', name }
  handlePick(pick) {
    switch (pick.type) {
      case 'folder': return this.openFolder(pick.path);
      case 'floor': return this.#tower.focusFloor(pick.index);
      case 'file': return this.#tower.selectFile(pick.path);
      case 'supabase': return this.toggleSchema();
      case 'table': return this.#supabase.selectTable(pick.name);
      default: return undefined;
    }
  }

  openFolder(path) {
    if (this.#tower.store.state.path === path) return;
    const target = this.#locate(path);
    if (!target) return;
    this.#supabase.openSchema(false); // a building and the schema are never open at the same time
    if (this.#tower.isOpen) this.#tower.close({ restoreCamera: false });
    this.#tower.open(target);
  }

  closeFolder() {
    this.#tower.close();
  }

  toggleSchema() {
    const open = !this.#supabase.store.state.schemaOpen;
    if (open) this.#tower.close();
    this.#supabase.openSchema(open);
  }

  // Esc closes the building first, then the schema
  escape() {
    if (this.#tower.isOpen) this.#tower.close();
    else this.#supabase.openSchema(false);
  }

  // What the hover card shows for a pick (null = nothing to show)
  //   { kind: 'folder' | 'floor' | 'file', path, name, friendly?, tags, level, files?, red?, yellow?, size?, reason? }
  describePick(pick) {
    const { root, buildings, projectName } = this.store.state;
    if (pick.type === 'crack') {
      const folder = this.describePick({ type: 'folder', path: pick.path });
      return folder && { ...folder, kind: 'crack' };
    }
    if (pick.type === 'folder') {
      const b = pick.path === '' ? { ...root, path: '', name: projectName, files: root?.total ?? 0 } : buildings.find((x) => x.path === pick.path);
      return b ? { kind: 'folder', ...b } : null;
    }
    const tower = this.#tower.store.state;
    if (pick.type === 'floor') {
      const floor = tower.floors[pick.index];
      if (!floor) return null;
      const levels = floor.files.map((f) => f.level);
      return {
        kind: 'floor', path: floor.path, name: floor.label, level: floor.worst, files: floor.files.length,
        red: levels.filter((l) => l === 'red').length, yellow: levels.filter((l) => l === 'yellow').length,
        tags: folderTags(floor.path, floor.files),
      };
    }
    if (pick.type === 'file') {
      const file = tower.floors.flatMap((f) => f.files).find((f) => f.path === pick.path);
      return file ? { kind: 'file', path: file.path, name: baseName(file.path), level: file.level, size: file.size, reason: file.reason, reasonKey: file.reasonKey, tags: fileTags(file.path) } : null;
    }
    return null;
  }

  // Where a file's building stands on the map: its first-level folder, or the main building
  locateFile(path) {
    const top = path.includes('/') ? path.slice(0, path.indexOf('/')) : '';
    const b = this.store.state.buildings.find((x) => x.path === top);
    if (b) return { folder: b.path, x: b.x, z: b.z, height: folderHeightOf(b.files) };
    return { folder: '', x: -1, z: -1, height: this.store.state.root?.height ?? 8 };
  }

  // Node + position + display name of a folder ('' = root), or null if it is not on the map
  #locate(path) {
    const { tree } = this.#project.store.state;
    const node = findNode(tree, path);
    if (!node) return null;
    if (path === '') return { node, x: 0, z: 0, name: `${this.store.state.projectName}/` };
    const building = this.store.state.buildings.find((b) => b.path === path);
    return building ? { node, x: building.x, z: building.z, name: `${building.name}/` } : null;
  }

  #recompute() {
    const { open, name, tree, usesSupabase, session } = this.#project.store.state;
    const newSession = session !== this.#session;
    this.#session = session;

    if (newSession) {
      this.#tower.close({ restoreCamera: false });
      this.#camera.flyTo({ x: 0, z: 0 });
    }
    if (!open) {
      this.store.set({ status: 'empty', root: null, buildings: [], version: this.store.state.version + 1 });
      return;
    }

    // Worst level, red/yellow counts and tags of a set of nodes
    const describe = (path, nodes) => {
      const files = allFiles(nodes);
      const levels = files.map((f) => this.#security.scoreOf(f.path).level);
      const guide = folderGuide(path, files);
      const tags = guide.tags;
      return {
        level: worstLevel(levels),
        red: levels.filter((l) => l === 'red').length,
        yellow: levels.filter((l) => l === 'yellow').length,
        tags,
        friendly: strings.describeFolder(guide, baseName(path)).name,
      };
    };
    const total = countFiles(tree);
    const dirs = tree
      .filter((n) => n.type === 'dir')
      .sort((a, b) => countFiles(b.children ?? []) - countFiles(a.children ?? []));
    const slots = folderSlots(dirs.length, usesSupabase);

    this.store.set({
      status: 'ready',
      session,
      projectName: name ?? strings.map.defaultProjectName,
      // The main building only cracks for files at the root (folders crack their own buildings)
      root: { total, dirs: countDirs(tree), height: hqHeight(total), ...describe('', tree.filter((n) => n.type === 'file')) },
      buildings: dirs.map((node, i) => ({
        path: node.path,
        name: baseName(node.path),
        x: slots[i].x,
        z: slots[i].z,
        files: countFiles(node.children ?? []),
        ...describe(node.path, node.children ?? []),
        order: i,
      })),
      version: this.store.state.version + 1,
    });

    // An open building is rebuilt in place with the new content (or closed if its folder is gone)
    const openPath = this.#tower.store.state.path;
    if (openPath !== null && !newSession) {
      const target = this.#locate(openPath);
      if (target) this.#tower.open({ ...target, instant: true });
      else this.#tower.close();
    }
  }
}
