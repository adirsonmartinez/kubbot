// Which agent answers the chat: the scripted demo, or the user's own subscription (Claude, Grok, Codex)
// with a model and an effort level. Also the address of the local MCP server for external agents.
import { Observable } from '../core/observable.js';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Models per agent, verified against each CLI installed here (Claude Code 2.1.310, Grok 1.0.67, Codex):
// id = what the CLI's model flag takes ('' = the default of the person's plan); label = name + version;
// tier = key of strings.connect.modelNotes. Efforts are the values each CLI accepts, lowest first.
export const CATALOG = {
  claude: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'fable', label: 'Fable 5.1', tier: 'best' },
      { id: 'opus', label: 'Opus 5.5', tier: 'deep' },
      { id: 'sonnet', label: 'Sonnet 5.5', tier: 'balanced' },
      { id: 'haiku', label: 'Haiku 5.5', tier: 'fast' },
    ],
    efforts: EFFORTS,
    defaultEffort: 'low',
  },
  grok: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'grok-4.7', label: 'Grok 4.7', tier: 'newest' },
      { id: 'grok-4.7-build-fast', label: 'Grok 4.7 Fast', tier: 'fastPricey' },
      { id: 'grok-4.6', label: 'Grok 4.6', tier: 'previous' },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'low',
  },
  codex: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tier: 'newest' },
      { id: 'gpt-6-sol', label: 'GPT-6 Sol', tier: 'deep' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'fast' },
    ],
    efforts: EFFORTS,
    defaultEffort: 'low',
  },
};

// Display name of a model id for an agent (null = the plan's default)
export const modelLabel = (agent, id) => CATALOG[agent]?.models.find((m) => m.id === id)?.label ?? null;

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
    if (c?.models.some((m) => m.id === model)) { this.store.set({ model }); this.#saveChoice(); }
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
  ask(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session = 'chat' } = {}) {
    // The choice is taken now: a question waiting in line keeps the agent it was asked to
    const { selected: agent, model, effort } = this.store.state;
    const run = () => this.#run(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session, agent, model, effort });
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => {});
    return result;
  }

  async #run(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session, agent, model, effort }) {
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
        onEvent?.(e); // every event (tools, subagents, result) for the live run card
        if (e.type === 'text' && !e.parent) { text += e.delta; onText?.(e.delta); }
        else if (e.type === 'thinking' && !e.parent) onThinking?.(e.delta);
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
      const c = saved && CATALOG[saved.selected];
      if (!c) return {};
      return {
        selected: saved.selected,
        model: c.models.some((m) => m.id === saved.model) ? saved.model : '',
        effort: c.efforts.includes(saved.effort) ? saved.effort : c.defaultEffort,
      };
    } catch {
      return {};
    }
  }

  #saveChoice() {
    const { selected, model, effort } = this.store.state;
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ selected, model, effort })); } catch { /* private mode */ }
  }
}
