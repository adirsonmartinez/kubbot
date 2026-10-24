// Chat with the agent: visible messages, "typing…" state, suggestion chips and minimize.
// Messages coming from the map (alerts, a folder was opened…) are queued while the agent is typing.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { splitAnswer } from '../models/answerFormat.js';
import { escapeHtml } from '../core/format.js';

const CHAT = strings.chat;
const CARDS = CHAT.cards;
const RECENT_MESSAGES = 6;
const nameOf = (path) => path.split('/').filter(Boolean).at(-1) ?? path;
const typingDelay = (reply) => 600 + Math.min((reply.text ?? reply.html ?? '').length * 10, 1600);

export class ChatViewModel {
  #agent;
  #queue = [];
  #nextId = 1;

  #actions;

  // message: { id, role: 'bot' | 'user' | 'sys' | 'tool', text?, html?, tone?, card? }
  // card: { kind: 'folder' | 'file', ...data, actions: [chip] } (a map event shown as an interactive card)
  // chip: a label (sent as a message) or { label, kind, prompt?, run? }: `run` does an app action (Remi
  //   repairs a file…), otherwise `prompt ?? label` is sent. kind picks its icon (ask, repair, audit, locate…)
  // welcome: the empty conversation shows a welcome screen with suggestions (as in Obra) instead of bubbles
  // gitPrefill: string set momentarily when a git chip is clicked; the view reads it and fills the textarea
  store = new Observable({ messages: [], typing: false, chips: null, minimized: false, welcome: true, projectName: '', gitPrefill: '' });

  #connection;

  constructor({ agentModel, bus, actions = {}, connection = null }) {
    this.#agent = agentModel;
    this.#connection = connection;
    this.#actions = actions;

    bus.on(EVENTS.projectCreated, ({ name }) => this.sayFromMap({ text: CHAT.projectCreated(name) }));
    bus.on(EVENTS.projectCreateFailed, ({ error }) => this.sayFromMap({ text: CHAT.projectCreateFailed(error), tone: 'alert' }));

    bus.on(EVENTS.projectOpened, ({ name }) => {
      this.store.set({ chips: null, projectName: name });
      this.#push({ role: 'sys', text: CHAT.projectOpened(name) });
      this.store.set({ chips: this.suggestions() });
    });

    bus.on(EVENTS.projectClosed, ({ name }) => {
      this.store.set({ chips: null, projectName: '' });
      this.#push({ role: 'sys', text: CHAT.projectClosed(name) });
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

    bus.on(EVENTS.folderOpened, (detail) => this.sayFromMap({ card: this.#folderCard(detail), tone: detail.counts.red ? 'alert' : '' }));

    bus.on(EVENTS.fileSelected, (file) => this.sayFromMap({ card: this.#fileCard(file), tone: file.level === 'red' ? 'alert' : '' }));

    bus.on(EVENTS.commitSelected, (commit) => {
      const lane = strings.git.laneNames[commit.lane] ?? commit.lane;
      const laneText = commit.laneLive ? lane : `${lane} (${strings.git.deleted})`;
      const text = strings.git.commitSelected({ ...commit, lane: laneText }) + (commit.risk ? strings.git.riskWarning(commit.risk.files) : '');
      const GIT_STR = strings.agent.git;
      // Actionable chips: clicking them runs the git command directly in one click
      const chips = GIT_STR ? [
        { label: GIT_STR.chipRevert(commit.short), directCommand: `rollback al commit ${commit.short}` },
        { label: GIT_STR.chipReset(commit.short),  directCommand: `reset al commit ${commit.short}` },
      ] : undefined;
      this.sayFromMap({ text, tone: commit.risk ? 'alert' : '', chips });
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
    const recent = this.#recentUserTexts();
    this.store.set({ chips: null, welcome: false });
    this.#push({ role: 'user', text });
    if (this.#connection?.live) {
      // With "Comparar respuestas", the same question goes to a second agent at the same time
      const second = this.#connection.store.state.compareWith;
      this.store.set({ typing: true });
      await Promise.all([this.#sendLive(text, null, recent), second && this.#sendLive(text, second, recent)].filter(Boolean));
      this.store.set({ typing: false });
      this.#next(); // map messages that arrived while the answers were streaming
      return;
    }
    // Scripted demo (or no agent): show "typing…" and the reply
    // A connected agent streams its answer into a bubble that grows; a tool use starts a new one.
    this.store.set({ typing: true });
    let streamId = null;
    let streamed = false;
    let reply;
    try {
      reply = await this.#agent.reply(text, {
        recent,
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
    } catch (error) {
      // Never leave the chat stuck on "typing…" if the agent throws
      reply = { html: strings.agent.git.failed(escapeHtml(String(error?.message ?? error))), tone: 'alert' };
    }
    this.store.set({ typing: false });
    if (!streamed || reply.tone === 'alert') this.#enqueue(reply);
    else {
      this.store.set({ chips: this.#suggestionChips(reply.text) ?? reply.chips ?? null });
      this.#next(); // map messages that arrived while the answer was streaming
    }
  }

  // The user's own agent answers as one "run": a live card with its steps (reasoning, Platanus tools,
  // subagents and their tools), the answer as it streams, and time/turns/tokens at the end.
  // run: { agent, model, effort, startedAt, endedAt, status: 'running'|'done'|'error', steps, result }
  // step: { id, kind: 'tool'|'subagent', name?, target?, description?, agentKind?, parent, status, startedAt, endedAt, output? }
  async #sendLive(text, otherAgent = null, recent = []) {
    const state = this.#connection.store.state;
    const agentId = otherAgent ?? state.selected;
    const label = state.agents?.find((a) => a.id === agentId)?.label ?? (otherAgent ? agentId : this.#connection.agentLabel);
    const model = otherAgent ? '' : state.model;
    const effort = otherAgent ? null : state.effort;
    const id = this.#push({
      role: 'bot', text: '', thinking: '',
      run: { agent: label, agentId, model, effort: effort ?? state.effort, compare: Boolean(state.compareWith), startedAt: Date.now(), endedAt: null, status: 'running', steps: [], result: null },
    });
    const run = (fn) => this.#update(id, (m) => ({ ...m, run: fn(m.run) }));
    const step = (stepId, fn) => run((r) => ({ ...r, steps: r.steps.map((x) => (x.id === stepId ? fn(x) : x)) }));
    const onEvent = (e) => {
      switch (e.type) {
        case 'thinking':
          if (e.parent) step(e.parent, (x) => ({ ...x, thinking: (x.thinking ?? '') + e.delta }));
          else this.#update(id, (m) => ({ ...m, thinking: m.thinking + e.delta }));
          break;
        case 'text': // a subagent's text belongs to its step; the main text arrives through onText
          if (e.parent) step(e.parent, (x) => ({ ...x, output: (x.output ?? '') + e.delta }));
          break;
        case 'tool':
          run((r) => ({ ...r, steps: [...r.steps, { id: e.id, kind: 'tool', name: e.name, target: e.target ?? '', parent: e.parent ?? null, status: 'running', startedAt: Date.now(), endedAt: null }] }));
          break;
        case 'subagent':
          run((r) => ({ ...r, steps: [...r.steps, { id: e.id, kind: 'subagent', description: e.description, agentKind: e.kind ?? '', parent: e.parent ?? null, status: 'running', startedAt: Date.now(), endedAt: null, output: '' }] }));
          break;
        case 'tool_done':
          step(e.id, (x) => ({ ...x, status: e.error ? 'error' : 'done', endedAt: Date.now() }));
          break;
        case 'result':
          run((r) => ({ ...r, result: { durationMs: e.durationMs, turns: e.turns, inputTokens: e.inputTokens, outputTokens: e.outputTokens } }));
          break;
        default:
      }
    };
    const reply = await this.#agent.reply(text, {
      recent,
      onEvent,
      onText: (delta) => this.#append(id, delta),
      ...(otherAgent ? { agent: otherAgent } : {}),
    });
    const failed = reply.tone === 'alert';
    run((r) => ({
      ...r,
      status: failed ? 'error' : 'done',
      endedAt: Date.now(),
      steps: r.steps.map((x) => (x.status === 'running' ? { ...x, status: failed ? 'error' : 'done', endedAt: Date.now() } : x)),
    }));
    if (failed) this.#update(id, (m) => ({ ...m, run: { ...m.run, error: reply.html ?? '' } }));
    else if (!this.store.state.messages.find((m) => m.id === id)?.text && reply.text) this.#update(id, (m) => ({ ...m, text: reply.text }));
    const answer = this.store.state.messages.find((m) => m.id === id)?.text ?? '';
    const chips = failed ? null : this.#suggestionChips(answer);
    if (chips ?? reply.chips) this.store.set({ chips: chips ?? reply.chips });
  }

  // The person's last messages, oldest first (the agent adapts to how they write)
  #recentUserTexts() {
    return this.store.state.messages.filter((m) => m.role === 'user' && m.text).slice(-RECENT_MESSAGES).map((m) => m.text);
  }

  // The answer's ```sugerencias block -> chips (only actions the app can do here)
  #suggestionChips(text) {
    const a = this.#actions;
    const chips = splitAnswer(text).suggestions.map((s) => {
      const name = s.path ? nameOf(s.path) : '';
      switch (s.kind) {
        case 'repair': return a.repair && { kind: 'repair', label: CHAT.suggest.repair(name), run: (from) => a.repair(s.path, from) };
        case 'audit': return { kind: 'audit', label: CHAT.suggest.audit(name), prompt: CHAT.auditPrompt(s.path, '') };
        case 'locate': return a.locate && { kind: 'locate', label: CHAT.suggest.locate(name), run: () => a.locate(s.path) };
        default: return { kind: 'ask', label: s.text };
      }
    }).filter(Boolean);
    return chips.length ? chips : null;
  }

  #folderCard({ name, files, folders, counts }) {
    const a = this.#actions;
    const risky = counts.red + counts.yellow > 0;
    return {
      kind: 'folder', name, files, folders, counts,
      hint: !files ? CARDS.folderEmpty : risky ? CARDS.folderHintRisk : CARDS.folderHint,
      actions: [
        risky && a.showRisks && { kind: 'risks', label: CARDS.seeRisks, run: () => a.showRisks() },
        risky && a.repairWorst && { kind: 'repair', label: strings.repair.chipWorst, run: (from) => a.repairWorst(from) },
        files > 0 && { kind: 'ask', label: CARDS.explainFolder, prompt: CARDS.explainFolderPrompt(name) },
      ].filter(Boolean),
    };
  }

  #fileCard({ path, level, reason, by }) {
    const a = this.#actions;
    const risky = level === 'red' || level === 'yellow';
    return {
      kind: 'file', path, name: nameOf(path), level, reason,
      source: { agent: strings.security.byAgent, remi: strings.security.byRemi }[by] ?? strings.security.byDemo,
      actions: [
        { kind: 'ask', label: CARDS.whatIsIt, prompt: CARDS.whatIsItPrompt(path) },
        risky && a.repair && { kind: 'repair', label: strings.repair.chip, run: (from) => a.repair(path, from) },
        risky && { kind: 'audit', label: CARDS.audit, prompt: CHAT.auditPrompt(path, reason) },
      ].filter(Boolean),
    };
  }

  #update(id, fn) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? fn(m) : m)) });
  }

  // A chip with an action runs it; a plain chip is sent as a message
  // `source`: the clicked button (Remi jumps from there to the map)
  choose(chip, source = null) {
    if (typeof chip === 'string') return this.send(chip);
    if (chip.directCommand) return this.send(chip.directCommand);
    if (!chip.run) return this.send(chip.prompt ?? chip.label);
    chip.run(source); // first, while the button is still on screen
    this.store.set({ chips: null, welcome: false });
    this.#push({ role: 'user', text: chip.label });
  }

  suggestions() {
    const a = this.#actions;
    return [
      a.repairWorst && { kind: 'repair', label: strings.repair.chipWorst, run: a.repairWorst },
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

  // Pre-fills the chat textarea with a git command so the user can review and confirm before sending.
  // The store field is cleared after one tick so it only triggers once per click.
  #prefillGitCommand(command) {
    this.store.set({ minimized: false, welcome: false, gitPrefill: command });
    setTimeout(() => this.store.set({ gitPrefill: '' }), 0);
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
      this.#push({ role: 'bot', text: reply.text, html: reply.html, tone: reply.tone, card: reply.card });
      this.store.set({ typing: false, chips: reply.chips ?? this.store.state.chips });
      reply.then?.();
      this.#next();
    }, typingDelay(reply));
  }
}
