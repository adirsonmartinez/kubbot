// Supabase node on the map: whether it is shown, its live status and the schema view.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { integrationToWorld, SCHEMA_CENTER } from './layout.js';

const VULNERABILITY_DELAY_MS = 5000; // demo: the vulnerability shows up a few seconds after opening
const LATENCY_INTERVAL_MS = 1200;
const SCHEMA_ZOOM = 1.1;

export class SupabaseViewModel {
  #model;
  #camera;
  #bus;
  #vulnerabilityTimer = null;
  #returnView = null;
  #session = 0;
  #inProject = false; // the open project uses Supabase
  #onScreen = true;   // the map is showing the root level (the node lives there)

  store = new Observable({ visible: false, vulnerable: false, latencyMs: 12, schemaOpen: false, tables: [] });

  constructor({ supabaseModel, projectModel, camera, bus }) {
    this.#model = supabaseModel;
    this.#camera = camera;
    this.#bus = bus;

    projectModel.store.subscribe((project) => this.#onProject(project), { immediate: true });
    supabaseModel.store.subscribe((state, previous) => {
      this.store.set({ vulnerable: state.vulnerable, tables: this.#tables() });
      if (state.vulnerable && !previous.vulnerable) this.#bus.emit(EVENTS.supabaseVulnerable);
    });
    this.store.set({ tables: this.#tables() });

    setInterval(() => {
      if (!this.store.state.vulnerable) this.store.set({ latencyMs: 8 + Math.round(Math.random() * 14) });
    }, LATENCY_INTERVAL_MS);
  }

  openSchema(on) {
    if (on === this.store.state.schemaOpen) return;
    if (on) {
      this.#returnView = this.#camera.saveView();
      this.#camera.flyTo(integrationToWorld(SCHEMA_CENTER), SCHEMA_ZOOM);
    } else {
      this.#camera.flyTo(this.#returnView?.target ?? { x: 0, z: 0 }, 1);
      this.#returnView = null;
    }
    this.store.set({ schemaOpen: on });
  }

  selectTable(name) {
    const table = this.#model.tables.find((t) => t.name === name);
    if (!table) return;
    this.#bus.emit(EVENTS.tableSelected, { name, columns: table.columns, rlsEnabled: !this.#model.isExposed(table) });
  }

  #tables() {
    return this.#model.tables.map((t) => ({ ...t, exposed: this.#model.isExposed(t) }));
  }

  // The map tells whether the root level is on screen
  setOnScreen(on) {
    this.#onScreen = on;
    this.#updateVisibility();
  }

  #updateVisibility() {
    const visible = this.#inProject && this.#onScreen;
    if (!visible && this.store.state.schemaOpen) this.openSchema(false);
    if (visible !== this.store.state.visible) this.store.set({ visible });
  }

  #onProject({ open, usesSupabase, session }) {
    if (session !== this.#session) {
      // New project: start clean and arm the demo vulnerability again
      this.#session = session;
      clearTimeout(this.#vulnerabilityTimer);
      this.#vulnerabilityTimer = null;
      this.#model.setVulnerable(false);
    }
    this.#inProject = open && usesSupabase;
    this.#updateVisibility();
    if (this.#inProject && !this.#vulnerabilityTimer) {
      this.#vulnerabilityTimer = setTimeout(() => this.#model.setVulnerable(true), VULNERABILITY_DELAY_MS);
    }
  }
}
