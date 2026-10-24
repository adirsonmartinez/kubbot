// The open project: its name, file tree and whether it uses Supabase.
import { Observable } from '../core/observable.js';

const RELOAD_DEBOUNCE_MS = 250;

export class ProjectModel {
  #workspace;
  #reloadTimer = null;

  // `session` increases each time a project is opened (to reset per-project state);
  // `version` increases each time the tree is reloaded.
  store = new Observable({ open: false, name: null, tree: [], usesSupabase: false, session: 0, version: 0 });

  constructor(workspace) {
    this.#workspace = workspace;
  }

  // Shows the folder picker; resolves to the bridge response ({ ok, data }).
  async choose() {
    const response = await this.#workspace.choose();
    if (response.ok) await this.open(response.data);
    return response;
  }

  // New project: the person picks a name and a place, an empty folder is created and opened
  async create() {
    const response = await this.#workspace.create();
    if (response.ok) await this.open(response.data);
    return response;
  }

  // [{ root, name, at }] most recent first
  async recent() {
    return (await this.#workspace.recent()).data ?? [];
  }

  async openRecent(root) {
    const response = await this.#workspace.openRecent(root);
    if (response.ok) await this.open(response.data);
    return response;
  }

  // Reopens the folder the app already had (e.g. after reloading the window)
  async restore() {
    const response = await this.#workspace.current();
    if (response.data) await this.open(response.data);
  }

  // The tree is loaded before publishing, so the map never draws a half-loaded project
  async open({ name }) {
    const loaded = await this.#load();
    if (!loaded) return;
    const { session, version } = this.store.state;
    this.store.set({ open: true, name: name || null, ...loaded, session: session + 1, version: version + 1 });
  }

  async reload() {
    if (!this.store.state.open) return;
    const loaded = await this.#load();
    if (loaded) this.store.set({ ...loaded, version: this.store.state.version + 1 });
  }

  async #load() {
    const response = await this.#workspace.tree();
    if (!response.ok) return null;
    return { tree: response.data, usesSupabase: await this.#detectSupabase(response.data) };
  }

  // Groups bursts of disk changes into a single reload
  scheduleReload() {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => this.reload(), RELOAD_DEBOUNCE_MS);
  }

  // A supabase/ folder or an @supabase/ dependency in package.json
  async #detectSupabase(tree) {
    if (tree.some((n) => n.type === 'dir' && n.path === 'supabase')) return true;
    if (!tree.some((n) => n.type === 'file' && n.path === 'package.json')) return false;
    const response = await this.#workspace.read('package.json');
    return response.ok && response.data.includes('@supabase/');
  }
}
