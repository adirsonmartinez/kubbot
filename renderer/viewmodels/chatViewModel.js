// Chat with the agent: visible messages, "typing…" state, suggestion chips and minimize.
// Messages coming from the map (alerts, a folder was opened…) are queued while the agent is typing.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';

const CHAT = strings.chat;
const typingDelay = (reply) => 600 + Math.min((reply.text ?? reply.html ?? '').length * 10, 1600);

export class ChatViewModel {
  #agent;
  #queue = [];
  #nextId = 1;

  #actions;

  // message: { id, role: 'bot' | 'user' | 'sys' | 'tool', text?, html?, tone? }
  // chip: a label (sent as a message) or { label, run } (runs an app action, e.g. Remi repairs a file)
  // welcome: the empty conversation shows a welcome screen with suggestions (as in Obra) instead of bubbles
  store = new Observable({ messages: [], typing: false, chips: null, minimized: false, welcome: true, projectName: '' });

  constructor({ agentModel, bus, actions = {} }) {
    this.#agent = agentModel;
    this.#actions = actions;

    bus.on(EVENTS.projectOpened, ({ name }) => {
      this.store.set({ chips: null, projectName: name });
      this.#push({ role: 'sys', text: CHAT.projectOpened(name) });
      this.store.set({ chips: this.suggestions() });
    });

    // Repairs: the agent's explanation streams into its own bubble, then a summary closes the task
    const RC = strings.repair.chat;
    let repairBubble = null;
    bus.on(EVENTS.repairStarted, ({ path, agent }) => {
      repairBubble = null;
      this.store.set({ minimized: false });
      this.#push({ role: 'sys', text: RC.started(path, agent) });
    });
    bus.on(EVENTS.repairText, ({ delta }) => {
      if (repairBubble === null) repairBubble = this.#push({ role: 'bot', tone: 'repair', text: '' });
      this.#append(repairBubble, delta);
    });
    bus.on(EVENTS.repairTool, ({ name }) => { repairBubble = null; this.#push({ role: 'tool', text: CHAT.toolUsed(name) }); });
    bus.on(EVENTS.repairChanged, ({ change }) => this.#push({ role: 'sys', text: RC.changed(change.path, change.reason) }));
    bus.on(EVENTS.repairFinished, ({ entry }) => {
      repairBubble = null;
      const done = RC.finished;
      const text = {
        fixed: () => done.fixed(entry.path, entry.changes.length),
        planned: () => `${done.planned(entry.path)}${entry.summary ? '' : `\n${RC.planTitle}\n${entry.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`}`,
        failed: () => done.failed(entry.path, entry.error),
        verified: () => done.verified(entry.path),
      }[entry.status]?.();
      if (!text) return;
      const chips = this.#actions.showRepairs ? [{ label: strings.repair.history.title, run: this.#actions.showRepairs }] : undefined;
      this.sayFromMap({ text, tone: entry.status === 'failed' ? 'alert' : entry.status === 'verified' ? '' : 'repair', chips });
    });

    // Editors and tools write temporary files (x.tmp.123, x~, .swp…): they are not changes worth a message
    bus.on(EVENTS.diskChanged, ({ paths }) => {
      const real = paths.filter((p) => !/(\.tmp(\.|$)|~$|\.sw[op]$|(^|\/)\.![0-9]+!|\.DS_Store$|(^|\/)\.atl\/)/.test(p));
      if (real.length) this.#push({ role: 'sys', text: CHAT.diskChanged(real) });
    });

    bus.on(EVENTS.supabaseVulnerable, () =>
      this.sayFromMap({ html: strings.agent.vulnerability.alert, tone: 'alert', chips: CHAT.chips.vulnerability }));

    bus.on(EVENTS.tableSelected, ({ name, columns, rlsEnabled }) => {
      if (rlsEnabled) {
        const keys = columns.filter((c) => c.key).map((c) => `${c.name} (${c.key})`).join(', ');
        this.sayFromMap({ text: CHAT.tableOk(name, columns.length, keys) });
      } else {
        const exposed = columns.filter((c) => c.sensitive).map((c) => c.name).join(', ');
        this.sayFromMap({ html: CHAT.tableExposed(name, exposed), tone: 'alert', chips: [CHAT.chips.fixNow] });
      }
    });

    bus.on(EVENTS.folderOpened, (detail) =>
      this.sayFromMap({ text: CHAT.folderOpened(detail), tone: detail.counts.red ? 'alert' : '' }));

    bus.on(EVENTS.fileSelected, ({ path, level, reason, by }) => {
      const source = { agent: strings.security.byAgent, remi: strings.security.byRemi }[by] ?? strings.security.byDemo;
      const levelText = strings.security.levelWithEmoji[level] ?? level;
      const repair = (level === 'red' || level === 'yellow') && this.#actions.repair
        ? [{ label: strings.repair.chip, run: (source) => this.#actions.repair(path, source) }] : undefined;
      this.sayFromMap({ text: CHAT.fileSelected({ path, levelText, reason, source }), tone: level === 'red' ? 'alert' : '', chips: repair });
    });

    bus.on(EVENTS.commitSelected, (commit) => {
      const lane = strings.git.laneNames[commit.lane] ?? commit.lane;
      const laneText = commit.laneLive ? lane : `${lane} (${strings.git.deleted})`;
      const text = strings.git.commitSelected({ ...commit, lane: laneText }) + (commit.risk ? strings.git.riskWarning(commit.risk.files) : '');
      this.sayFromMap({ text, tone: commit.risk ? 'alert' : '' });
    });

    this.store.set({ chips: [CHAT.chips.openFolder] });
  }

  // Back to the welcome screen with a fresh conversation
  newChat() {
    if (this.store.state.typing) return;
    this.#queue = [];
    this.store.set({ messages: [], welcome: true, chips: this.store.state.projectName ? this.suggestions() : [CHAT.chips.openFolder], minimized: false });
  }

  async send(text) {
    text = text.trim();
    if (!text || this.store.state.typing) return;
    this.store.set({ chips: null, welcome: false });
    this.#push({ role: 'user', text });
    // A real agent can take a while: show "typing…" and a short note for each tool it uses
    // A connected agent streams its answer into a bubble that grows; a tool use starts a new one.
    this.store.set({ typing: true });
    let streamId = null;
    let streamed = false;
    const reply = await this.#agent.reply(text, {
      onTool: (name) => { streamId = null; this.#push({ role: 'tool', text: CHAT.toolUsed(name) }); },
      onText: (delta) => {
        if (streamId === null) { streamId = this.#push({ role: 'bot', text: '' }); this.store.set({ typing: false }); }
        streamed = true;
        this.#append(streamId, delta);
      },
      // The agent's reasoning goes in the same bubble, folded above the answer
      onThinking: (delta) => {
        if (streamId === null) { streamId = this.#push({ role: 'bot', text: '', thinking: '' }); this.store.set({ typing: false }); }
        this.#appendThinking(streamId, delta);
      },
    });
    this.store.set({ typing: false });
    if (!streamed || reply.tone === 'alert') this.#enqueue(reply);
    else {
      this.store.set({ chips: reply.chips ?? null });
      this.#next(); // map messages that arrived while the answer was streaming
    }
  }

  // A chip with an action runs it; a plain chip is sent as a message
  // `source`: the clicked button (Remi jumps from there to the map)
  choose(chip, source = null) {
    if (typeof chip === 'string') return this.send(chip);
    chip.run(source); // first, while the button is still on screen
    this.store.set({ chips: null, welcome: false });
    this.#push({ role: 'user', text: chip.label });
  }

  suggestions() {
    const a = this.#actions;
    return [
      a.repairWorst && { label: strings.repair.chipWorst, run: a.repairWorst },
      a.showRisks && { label: strings.shell.rail.risks, run: a.showRisks },
      a.showGraph && { label: strings.shell.actions.showGraph, run: a.showGraph },
      ...CHAT.chips.suggestions.slice(2),
    ].filter(Boolean);
  }

  // Map messages open the chat if it was minimized
  sayFromMap(reply) {
    this.store.set({ chips: null, minimized: false, welcome: false });
    this.#enqueue(reply);
  }

  toggleMinimized() {
    this.store.set({ minimized: !this.store.state.minimized });
  }

  #push(message) {
    const id = this.#nextId++;
    this.store.set({ messages: [...this.store.state.messages, { id, ...message }] });
    return id;
  }

  #appendThinking(id, delta) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? { ...m, thinking: (m.thinking ?? '') + delta } : m)) });
  }

  #append(id, delta) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)) });
  }

  #enqueue(reply) {
    this.#queue.push(reply);
    if (!this.store.state.typing) this.#next();
  }

  // Shows "typing…", then the reply after a delay that depends on its length
  #next() {
    const reply = this.#queue.shift();
    if (!reply) return;
    this.store.set({ typing: true });
    setTimeout(() => {
      this.#push({ role: 'bot', text: reply.text, html: reply.html, tone: reply.tone });
      this.store.set({ typing: false, chips: reply.chips ?? this.store.state.chips });
      reply.then?.();
      this.#next();
    }, typingDelay(reply));
  }
}
