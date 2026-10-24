// The open project: its name, file tree and the integrations it uses (Supabase, Vercel, GitHub…).
import { Observable } from '../core/observable.js';
import { DEMO_INTEGRATIONS } from './demoIntegrations.js';

// Every integration the map knows, in the order it shows them
export const INTEGRATIONS = ['supabase', 'vercel', 'github', 'clerk', 'posthog'];
// package.json dependencies that give an integration away
const DEPENDENCY = { supabase: '@supabase/', vercel: '@vercel/', clerk: '@clerk/', posthog: 'posthog' };

const RELOAD_DEBOUNCE_MS = 250;

export class ProjectModel {
  #workspace;
  #setup;
  #reloadTimer = null;

  // `session` increases each time a project is opened (to reset per-project state);
  // `version` increases each time the tree is reloaded.
  // integrations: keys in INTEGRATIONS order; integrationStatus: key -> 'connected' | 'incident' | 'disconnected'
  // | 'pending' (set up by the welcome robot, waiting for the person's account); usesSupabase: a live Supabase
  // the map draws with its schema (not a pending one); root: the folder's full path
  store = new Observable({ open: false, name: null, root: null, tree: [], usesSupabase: false, integrations: [], integrationStatus: {}, session: 0, version: 0 });

  // `setup` (SetupModel): what the welcome robot set up and is still waiting for an account
  constructor(workspace, setup = null) {
    this.#workspace = workspace;
    this.#setup = setup;
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
  async open({ name, root = null }) {
    const loaded = await this.#load(name, root);
    if (!loaded) return;
    const { session, version } = this.store.state;
    this.store.set({ open: true, name: name || null, root, ...loaded, session: session + 1, version: version + 1 });
  }

  // Back to the start screen: the main process stops watching the folder and the agent loses access
  async close() {
    if (!this.store.state.open) return;
    clearTimeout(this.#reloadTimer);
    await this.#workspace.close();
    const { session, version } = this.store.state;
    this.store.set({ open: false, name: null, root: null, tree: [], usesSupabase: false, integrations: [], integrationStatus: {}, session: session + 1, version: version + 1 });
  }

  async reload() {
    if (!this.store.state.open) return;
    const loaded = await this.#load(this.store.state.name, this.store.state.root);
    if (loaded) this.store.set({ ...loaded, version: this.store.state.version + 1 });
  }

  async #load(name, root) {
    const response = await this.#workspace.tree();
    if (!response.ok) return null;
    const integrationStatus = await this.#detectIntegrations(response.data, name);
    // Found in the files but still waiting for the person's account (set up by the welcome robot)
    this.#setup?.pendingOf(root).forEach((key) => { if (integrationStatus[key] === 'connected') integrationStatus[key] = 'pending'; });
    const integrations = INTEGRATIONS.filter((key) => key in integrationStatus);
    const usesSupabase = integrations.includes('supabase') && integrationStatus.supabase !== 'pending';
    return { tree: response.data, integrations, integrationStatus, usesSupabase };
  }

  // Groups bursts of disk changes into a single reload
  scheduleReload() {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => this.reload(), RELOAD_DEBOUNCE_MS);
  }

  // key -> state. From the files (supabase/, vercel.json or .vercel/, .github/, package.json dependencies),
  // all connected; a demo project (DEMO_INTEGRATIONS) shows its own list and states instead.
  async #detectIntegrations(tree, name) {
    const demo = DEMO_INTEGRATIONS[(name ?? '').toLowerCase()];
    if (demo) return { ...demo };
    const has = (type, path) => tree.some((n) => n.type === type && n.path === path);
    const found = new Set();
    if (has('dir', 'supabase')) found.add('supabase');
    if (has('file', 'vercel.json') || has('dir', '.vercel')) found.add('vercel');
    if (has('dir', '.github')) found.add('github');
    if (has('file', 'package.json')) {
      const response = await this.#workspace.read('package.json');
      if (response.ok) Object.entries(DEPENDENCY).forEach(([key, prefix]) => { if (response.data.includes(`"${prefix}`)) found.add(key); });
    }
    return Object.fromEntries([...found].map((key) => [key, 'connected']));
  }
}
