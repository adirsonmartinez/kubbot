// The chat agent's "brain". Today it is a scripted demo (keywords + file commands);
// the real AI agent will replace reply() keeping the same reply shape:
//   { text?, html?, tone?: 'alert', chips?: string[], then?: () => void }
// `html` is only ever built from our own strings, never from user input.
import { strings } from '../i18n/es.js';
import { escapeHtml } from '../core/format.js';
import { baseName } from './fileTree.js';

const AGENT = strings.agent;
const FILES = AGENT.files;
const GIT = AGENT.git;
const MAX_LISTED_FILES = 40;

// Matches the start of each word, so "si" does not match inside "visita"
const words = (text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
const hasKeyword = (list, keys) => keys.some((k) => list.some((w) => w.startsWith(k)));

export class AgentModel {
  #workspace;
  #project;
  #supabase;
  #git;

  #connection;

  #mode;

  constructor({ workspace, projectModel, supabaseModel, connection = null, modeModel = null, gitService = null }) {
    this.#mode = modeModel;
    this.#workspace = workspace;
    this.#project = projectModel;
    this.#supabase = supabaseModel;
    this.#connection = connection;
    this.#git = gitService;
  }

  // With a connected agent (the user's own subscription) the real model answers and works through
  // the Platanus MCP tools; otherwise the scripted demo answers. Same reply shape either way.
  // agent: ask another agent than the selected one (compare answers)
  async reply(text, { onTool, onText, onThinking, onEvent, agent } = {}) {
    if (this.#connection?.live) return this.#live(text, { onTool, onText, onThinking, onEvent, ...(agent ? { agent } : {}) });
    return (await this.#gitCommand(text)) ?? (await this.#fileCommand(text)) ?? this.#scripted(text);
  }

  async #live(text, callbacks) {
    const prompt = AGENT.livePrompt + (this.#mode?.tech ? AGENT.techSuffix : '');
    const { text: answer, error } = await this.#connection.ask(text, prompt, callbacks);
    if (answer) return { text: answer };
    return { html: AGENT.liveFailed(escapeHtml(error ?? '')), tone: 'alert' };
  }

  // ---- Git commands (detected before file commands) ----
  // Patterns match common natural-language Spanish phrasing.
  // The `context` chip injected from a selected commit looks like: «abc1234 · mensaje»
  async #gitCommand(text) {
    if (!GIT) return null; // strings not loaded yet
    const t = text.trim();

    // -- commit --
    // "haz commit con 'Fix auth bug'"
    // "realiza un commit: Fix auth bug"
    // «commit Fix auth bug»
    const commitMatch = t.match(GIT.patterns.commit);
    if (commitMatch) {
      const message = (commitMatch[1] || commitMatch[2] || commitMatch[3] || '').trim().replace(/^['"`]|['"`]$/g, '');
      if (!message) return { text: GIT.needsMessage };
      if (!this.#git?.isDesktop) return { text: GIT.desktopOnly };
      const result = await this.#git.commit(message);
      if (!result.ok) {
        if (result.error === 'cancelled') return { text: GIT.cancelled };
        return { html: GIT.failed(escapeHtml(result.error)), tone: 'alert' };
      }
      return { text: GIT.committed(message) };
    }

    // -- revert (safe rollback: creates a new commit that undoes the SHA) --
    // "rollback al commit abc1234"
    // "revert abc1234"
    // «revert abc1234 · Fix auth bug»  (from the chip injected by commitSelected)
    const revertMatch = t.match(GIT.patterns.revert);
    if (revertMatch) {
      const sha = (revertMatch[1] || revertMatch[2] || '').trim().split(/\s/)[0];
      if (!sha) return { text: GIT.needsSha };
      if (!this.#git?.isDesktop) return { text: GIT.desktopOnly };
      const result = await this.#git.revert(sha);
      if (!result.ok) {
        if (result.error === 'cancelled') return { text: GIT.cancelled };
        return { html: GIT.failed(escapeHtml(result.error)), tone: 'alert' };
      }
      return { text: GIT.reverted(sha) };
    }

    // -- reset --hard (destructive, always confirmed by Electron dialog) --
    // "reset al commit abc1234"
    const resetMatch = t.match(GIT.patterns.reset);
    if (resetMatch) {
      const sha = (resetMatch[1] || '').trim().split(/\s/)[0];
      if (!sha) return { text: GIT.needsSha };
      if (!this.#git?.isDesktop) return { text: GIT.desktopOnly };
      const result = await this.#git.reset(sha);
      if (!result.ok) {
        if (result.error === 'cancelled') return { text: GIT.cancelled };
        return { html: GIT.failed(escapeHtml(result.error)), tone: 'alert' };
      }
      return { text: GIT.reset(sha) };
    }

    // -- create branch --
    // "crea la rama feature/auth"
    // "nueva rama hotfix/fix-login"
    const branchMatch = t.match(GIT.patterns.createBranch);
    if (branchMatch) {
      const name = (branchMatch[1] || branchMatch[2] || '').trim();
      if (!name) return { text: GIT.needsBranchName };
      if (!this.#git?.isDesktop) return { text: GIT.desktopOnly };
      const result = await this.#git.createBranch(name);
      if (!result.ok) return { html: GIT.failed(escapeHtml(result.error)), tone: 'alert' };
      return { text: GIT.branchCreated(name) };
    }

    // -- checkout --
    // "cambia a la rama develop"
    // "checkout main"
    const checkoutMatch = t.match(GIT.patterns.checkout);
    if (checkoutMatch) {
      const target = (checkoutMatch[1] || checkoutMatch[2] || '').trim();
      if (!target) return { text: GIT.needsBranchName };
      if (!this.#git?.isDesktop) return { text: GIT.desktopOnly };
      const result = await this.#git.checkout(target);
      if (!result.ok) return { html: GIT.failed(escapeHtml(result.error)), tone: 'alert' };
      return { text: GIT.checkedOut(target) };
    }

    return null;
  }

  #scripted(text) {
    const list = words(text);
    const vuln = AGENT.vulnerability;

    if (hasKeyword(list, AGENT.keywords.fix)) {
      if (!this.#supabase.vulnerable) return { text: vuln.nothingToFix };
      return { text: vuln.fix, then: () => this.#supabase.setVulnerable(false) };
    }
    if (hasKeyword(list, AGENT.keywords.details)) {
      return this.#supabase.vulnerable
        ? { text: vuln.details, chips: [strings.chat.chips.fixNow] }
        : { text: vuln.nothingToFix };
    }
    if (hasKeyword(list, AGENT.keywords.attack)) {
      if (!this.#project.store.state.open) return { text: vuln.needsProject, chips: [strings.chat.chips.openFolder] };
      return { text: vuln.attack, then: () => this.#supabase.setVulnerable(true) };
    }
    const match = AGENT.replies.find((r) => hasKeyword(list, r.keys));
    return { text: match?.text ?? AGENT.fallback };
  }

  // Provisional file commands ("crea carpeta src", "listar archivos"...). The AI agent will call the
  // workspace service directly instead.
  async #fileCommand(text) {
    const { patterns } = FILES;
    const command = Object.entries(patterns).map(([name, re]) => ({ name, match: text.match(re) })).find((c) => c.match);
    if (!command) return null;
    if (!this.#workspace.isDesktop) return { text: FILES.desktopOnly };

    if (command.name === 'openFolder') {
      const response = await this.#project.choose();
      return { text: response.ok ? FILES.opened(response.data.name) : FILES.notOpened };
    }
    if (!(await this.#workspace.current()).data) {
      return { text: FILES.needsFolder, chips: [strings.chat.chips.openFolder] };
    }

    const m = command.match;
    const result = await this.#runFileCommand(command.name, m);
    if (typeof result === 'string') return { text: result };
    return { html: FILES.failed(escapeHtml(result.error)), tone: 'alert' };
  }

  async #runFileCommand(name, m) {
    const ws = this.#workspace;
    switch (name) {
      case 'mkdir': {
        const path = m[3].trim();
        const r = await ws.mkdir(path);
        return r.ok ? FILES.created(path) : r;
      }
      case 'write': {
        const r = await ws.write(m[3], m[4] ?? '');
        return r.ok ? FILES.written(m[3]) : r;
      }
      case 'remove': {
        const path = m[3].trim();
        const r = await ws.remove(path);
        return r.ok ? FILES.removed(path) : r;
      }
      case 'list': {
        const r = await ws.tree();
        if (!r.ok) return r;
        const lines = [];
        const walk = (nodes, depth) => nodes.forEach((n) => {
          if (lines.length >= MAX_LISTED_FILES) return;
          lines.push(`${'  '.repeat(depth)}${n.type === 'dir' ? '📁' : '📄'} ${baseName(n.path)}`);
          if (n.children) walk(n.children, depth + 1);
        });
        walk(r.data, 0);
        return lines.length ? lines.join('\n') : FILES.emptyFolder;
      }
      default:
        return { error: name };
    }
  }
}
