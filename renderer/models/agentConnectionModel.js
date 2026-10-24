// Which agent answers the chat: the scripted demo, or the user's own subscription (Claude, Grok, Codex)
// with a model and an effort level. Also the address of the local MCP server for external agents.
import { Observable } from '../core/observable.js';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Models per agent ('' = the default of the user's plan). Kept small on purpose.
export const CATALOG = {
  claude: { models: ['', 'opus', 'sonnet', 'haiku'], efforts: EFFORTS, defaultEffort: 'low' },
  grok: { models: ['', 'grok-4.7'], efforts: ['low', 'medium', 'high'], defaultEffort: 'low' },
  codex: { models: [''], efforts: ['low', 'medium', 'high'], defaultEffort: 'low' },
};

const CHOICE_KEY = 'platanus.agent.choice.v1';

export class AgentConnectionModel {
  #service;
  #turns = new Map(); // "agent:session" -> messages sent (to continue the conversation)
  #queue = Promise.resolve(); // one run at a time: the chat and Remi never talk over each other

  // agents: [{ id, label, installed, loggedIn: true | false | null }]
  store = new Observable({ agents: [], selected: null, model: '', effort: 'low', mcp: { url: null, running: false }, isDesktop: false });

  constructor(service) {
    this.#service = service;
    this.store.set({ isDesktop: service.isDesktop, ...this.#loadChoice() });
    service.onMcpStatus((mcp) => this.store.set({ mcp }));
  }

  async refresh() {
    const [agents, mcp] = await Promise.all([this.#service.detect(), this.#service.mcpInfo()]);
    const list = (agents.data ?? []).filter((a) => a.installed);
    const { selected } = this.store.state;
    // Keep the saved choice only if that agent is still installed
    this.store.set({ agents: list, mcp: mcp.data ?? this.store.state.mcp, selected: list.some((a) => a.id === selected) ? selected : null });
  }

  select(id) {
    const catalog = CATALOG[id];
    if (id && !catalog) return;
    const keep = id === this.store.state.selected;
    this.store.set({
      selected: id,
      model: keep ? this.store.state.model : '',
      effort: keep ? this.store.state.effort : catalog?.defaultEffort ?? 'low',
    });
    this.#saveChoice();
  }

  setModel(model) {
    const c = CATALOG[this.store.state.selected];
    if (c?.models.includes(model)) { this.store.set({ model }); this.#saveChoice(); }
  }

  setEffort(effort) {
    const c = CATALOG[this.store.state.selected];
    if (c?.efforts.includes(effort)) { this.store.set({ effort }); this.#saveChoice(); }
  }

  login(id) {
    return this.#service.login(id);
  }

  get live() {
    return Boolean(this.store.state.selected);
  }

  get agentLabel() {
    return this.store.state.agents.find((a) => a.id === this.store.state.selected)?.label ?? '';
  }

  // Runs one message with the selected agent. Resolves with { text, error } (never rejects).
  // onTool(name) is called each time the agent uses a Platanus tool; onText(delta) as the answer streams.
  // session: 'chat' (continues the conversation) or 'repair' (Remi's jobs, a separate conversation).
  // signal (AbortSignal): a waiting question never starts; a running one stops its CLI.
  // onStart(runId): called when the CLI actually starts (after waiting in line).
  ask(prompt, systemPrompt, { onTool, onText, onStart, signal, session = 'chat' } = {}) {
    // The choice is taken now: a question waiting in line keeps the agent it was asked to
    const { selected: agent, model, effort } = this.store.state;
    const run = () => this.#run(prompt, systemPrompt, { onTool, onText, onStart, signal, session, agent, model, effort });
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => {});
    return result;
  }

  async #run(prompt, systemPrompt, { onTool, onText, onStart, signal, session, agent, model, effort }) {
    if (signal?.aborted) return { text: '', error: 'cancelled' };
    const key = `${agent}:${session}`;
    const turns = this.#turns.get(key) ?? 0;
    this.#turns.set(key, turns + 1);
    let text = '';
    let error = null;
    let runId = null;
    const early = [];
    return new Promise((resolve) => {
      const handle = (e) => {
        if (e.type === 'text') { text += e.delta; onText?.(e.delta); }
        else if (e.type === 'tool') onTool?.(e.name);
        else if (e.type === 'error') error = e.message;
        else if (e.type === 'done') { off(); resolve({ text: text.trim(), error }); }
      };
      const off = this.#service.onEvent((e) => {
        if (!runId) return void early.push(e);
        if (e.runId === runId) handle(e);
      });
      this.#service.run({ agent, prompt, systemPrompt, model, effort, session, continued: session === 'chat' && turns > 0 }).then((r) => {
        if (!r.ok) { off(); return resolve({ text: '', error: r.error }); }
        runId = r.data;
        onStart?.(runId);
        if (signal?.aborted) this.#service.cancel?.(runId);
        else signal?.addEventListener('abort', () => this.#service.cancel?.(runId), { once: true });
        early.filter((e) => e.runId === runId).forEach(handle);
      }, (err) => { off(); resolve({ text: '', error: err?.message ?? String(err) }); });
    });
  }

  #loadChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
      return saved && CATALOG[saved.selected] ? saved : {};
    } catch {
      return {};
    }
  }

  #saveChoice() {
    const { selected, model, effort } = this.store.state;
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ selected, model, effort })); } catch { /* private mode */ }
  }
}
