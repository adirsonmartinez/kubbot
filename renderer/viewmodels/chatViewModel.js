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
  #greeted = false;

  // message: { id, role: 'bot' | 'user' | 'sys', text?, html?, tone? }
  store = new Observable({ messages: [], typing: false, chips: null, minimized: false });

  constructor({ agentModel, bus }) {
    this.#agent = agentModel;

    bus.on(EVENTS.projectOpened, ({ name }) => {
      this.store.set({ chips: null });
      this.#push({ role: 'sys', text: CHAT.projectOpened(name) });
      if (!this.#greeted) {
        this.#greeted = true;
        this.#push({ role: 'bot', text: CHAT.projectReady });
      }
      this.store.set({ chips: CHAT.chips.suggestions });
    });

    bus.on(EVENTS.diskChanged, ({ paths }) => this.#push({ role: 'sys', text: CHAT.diskChanged(paths) }));

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
      const source = by === 'agent' ? strings.security.byAgent : strings.security.byDemo;
      const levelText = strings.security.levelWithEmoji[level] ?? level;
      this.sayFromMap({ text: CHAT.fileSelected({ path, levelText, reason, source }), tone: level === 'red' ? 'alert' : '' });
    });

    bus.on(EVENTS.commitSelected, (commit) => {
      const lane = strings.git.laneNames[commit.lane] ?? commit.lane;
      const laneText = commit.laneLive ? lane : `${lane} (${strings.git.deleted})`;
      const text = strings.git.commitSelected({ ...commit, lane: laneText }) + (commit.risk ? strings.git.riskWarning(commit.risk.files) : '');
      this.sayFromMap({ text, tone: commit.risk ? 'alert' : '' });
    });

    this.#push({ role: 'bot', text: CHAT.greeting });
    this.store.set({ chips: [CHAT.chips.openFolder] });
  }

  async send(text) {
    text = text.trim();
    if (!text || this.store.state.typing) return;
    this.store.set({ chips: null });
    this.#push({ role: 'user', text });
    this.#enqueue(await this.#agent.reply(text));
  }

  // Map messages open the chat if it was minimized
  sayFromMap(reply) {
    this.store.set({ chips: null, minimized: false });
    this.#enqueue(reply);
  }

  toggleMinimized() {
    this.store.set({ minimized: !this.store.state.minimized });
  }

  #push(message) {
    this.store.set({ messages: [...this.store.state.messages, { id: this.#nextId++, ...message }] });
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
