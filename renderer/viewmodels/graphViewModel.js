// Threat graph: where an attacker would come in and how the pieces connect.
// Built from the real models (project tree, security traffic light, Supabase). No DOM, no three.js.
import { Observable } from '../core/observable.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';

const DB_HINT = /(\.sql$|^supabase$|db|database|migrations?)/i;

export class GraphViewModel {
  #projectModel;
  #securityModel;
  #supabaseModel;

  // nodes: [{ id, kind: 'internet'|'app'|'folder'|'database'|'table', label, level, column, path? }]
  // edges: [{ from, to, kind: 'normal'|'tainted'|'attack' }]
  store = new Observable({ open: false, nodes: [], edges: [], attackSteps: 0, blocked: false, attacking: false });

  constructor({ projectModel, securityModel, supabaseModel }) {
    this.#projectModel = projectModel;
    this.#securityModel = securityModel;
    this.#supabaseModel = supabaseModel;
    for (const m of [projectModel, securityModel, supabaseModel]) m.store.subscribe(() => this.#recompute());
    this.#recompute();
  }

  toggleAttack() {
    this.store.set({ attacking: !this.store.state.attacking });
  }

  #recompute() {
    const { open, name, tree, usesSupabase } = this.#projectModel.store.state;
    if (!open) return this.store.set({ open: false, nodes: [], edges: [], attackSteps: 0 });

    const level = (path) => this.#securityModel.scoreOf(path).level;
    const nodes = [
      { id: 'internet', kind: 'internet', label: 'internet', column: 0, level: 'grey' },
      { id: 'app', kind: 'app', label: name || 'app', column: 1, level: worstLevel(allFiles(tree).map((f) => level(f.path))) },
    ];
    const edges = [{ from: 'internet', to: 'app', kind: 'normal' }];

    const folders = tree
      .filter((n) => n.type === 'dir')
      .map((dir) => {
        const files = allFiles(dir.children ?? []);
        const lv = worstLevel(files.map((f) => level(f.path)));
        return { dir, files, lv, touchesDb: DB_HINT.test(dir.path) || files.some((f) => DB_HINT.test(baseName(f.path))) };
      })
      .sort((a, b) => LEVEL_RANK[b.lv] - LEVEL_RANK[a.lv]);

    for (const f of folders) {
      nodes.push({ id: `dir:${f.dir.path}`, kind: 'folder', label: `${baseName(f.dir.path)}/`, column: 2, level: f.lv, path: f.dir.path, count: f.files.length });
      edges.push({ from: 'app', to: `dir:${f.dir.path}`, kind: 'normal' });
    }

    const hasDb = usesSupabase;
    const vulnerable = hasDb && this.#supabaseModel.vulnerable;
    if (hasDb) {
      nodes.push({ id: 'db', kind: 'database', label: 'Supabase', column: 3, level: vulnerable ? 'red' : 'green' });
      for (const f of folders.filter((x) => x.touchesDb)) {
        edges.push({ from: `dir:${f.dir.path}`, to: 'db', kind: f.lv === 'red' || f.lv === 'yellow' ? 'tainted' : 'normal' });
      }
      for (const table of this.#supabaseModel.tables.filter((t) => this.#supabaseModel.isExposed(t))) {
        nodes.push({ id: `table:${table.name}`, kind: 'table', label: table.name, column: 4, level: 'red' });
        edges.push({ from: 'db', to: `table:${table.name}`, kind: 'normal' });
      }
    }

    // Attacker's route: internet -> app -> riskiest folder (-> database -> exposed table)
    const riskiest = folders.find((f) => f.lv === 'red') ?? (vulnerable ? folders.find((f) => f.touchesDb) : null);
    const route = [];
    if (riskiest) {
      route.push('internet', 'app', `dir:${riskiest.dir.path}`);
      if (vulnerable && riskiest.touchesDb) {
        route.push('db');
        const exposed = nodes.find((n) => n.kind === 'table');
        if (exposed) route.push(exposed.id);
      }
    }
    for (let i = 0; i < route.length - 1; i++) {
      const existing = edges.find((e) => e.from === route[i] && e.to === route[i + 1]);
      if (existing) existing.kind = 'attack';
      else edges.push({ from: route[i], to: route[i + 1], kind: 'attack' });
    }
    const steps = Math.max(0, route.length - 1);
    this.store.set({ open: true, nodes, edges, attackSteps: steps, blocked: steps === 0 });
  }
}
