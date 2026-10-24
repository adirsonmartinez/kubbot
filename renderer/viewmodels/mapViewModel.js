// The project map: the main building (root folder) and one building per first-level folder.
// It also coordinates what is "open" (a building or the Supabase schema) and routes clicks.
import { Observable } from '../core/observable.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { worstLevel } from '../models/securityModel.js';
import { folderSlots, hqHeight } from './layout.js';

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

    // { green, yellow, red, grey } file counts and the worst level among them
    const levelsOf = (nodes) => {
      const counts = { green: 0, yellow: 0, red: 0, grey: 0 };
      allFiles(nodes).forEach((f) => { counts[this.#security.scoreOf(f.path).level]++; });
      return { counts, level: worstLevel(Object.keys(counts).filter((l) => counts[l] > 0)) };
    };
    const project = levelsOf(tree);
    const total = countFiles(tree);
    const dirs = tree
      .filter((n) => n.type === 'dir')
      .sort((a, b) => countFiles(b.children ?? []) - countFiles(a.children ?? []));
    const slots = folderSlots(dirs.length, usesSupabase);

    this.store.set({
      status: 'ready',
      session,
      projectName: name ?? strings.map.defaultProjectName,
      root: {
        total,
        dirs: countDirs(tree),
        height: hqHeight(total),
        counts: project.counts,
        // Share of evaluated files that are safe (100 when there is nothing to evaluate)
        securityScore: total ? Math.round((project.counts.green / total) * 100) : 100,
      },
      buildings: dirs.map((node, i) => ({
        path: node.path,
        name: baseName(node.path),
        x: slots[i].x,
        z: slots[i].z,
        files: countFiles(node.children ?? []),
        ...levelsOf(node.children ?? []),
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
