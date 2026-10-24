// "Conecta tu agente" (sidebar view): connects the user's AI agents and the local MCP server.
// Renders six sections: intro, agents, compare, MCP server, recent activity, editor snippets.
import { strings } from '../../i18n/es.js';
import { CATALOG, modelLabel } from '../../models/agentConnectionModel.js';
import { mcpSnippet, maskUrl } from '../../models/mcpSnippets.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';

const C = strings.connect;
const H = strings.hub;
const T = strings.chat?.run?.tools ?? {};

// The configs per editor / CLI (renderer/models/mcpSnippets.js); the private key is masked on screen
const SNIPPETS = ['claude', 'cursor', 'codex', 'gemini', 'kimi', 'qwen', 'opencode'];
const snippets = (url) => SNIPPETS.map((key) => ({ key, code: mcpSnippet(key, url) }));
const mask = maskUrl;

async function copy(button, textToCopy) {
  try {
    await navigator.clipboard.writeText(textToCopy);
    button.textContent = C.copied;
    setTimeout(() => { button.textContent = C.copy; }, 1400);
  } catch {
    // no clipboard: the code stays visible to copy by hand
  }
}

// ---- DOM helpers ----

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const brandColors = { claude: '#d97757', grok: '#e7e7ea', codex: '#10a37f' };

export function createAgentConnectView({ container, connection, modeModel }) {
  // One card per agent; agent = null is the scripted demo
  function agentCard(agent, state) {
    const selected = agent ? state.selected === agent.id : !state.selected;
    const card = el('div', `hub-agent${selected ? ' hub-agent-selected' : ''}${agent ? '' : ' hub-agent-demo'}`);
    const label = agent ? agent.label : C.scripted;
    const avatar = el('div', 'hub-avatar', label.charAt(0).toUpperCase());
    avatar.style.setProperty('--c', agent ? brandColors[agent.id] ?? '#8b83ff' : '#8b83ff');
    card.appendChild(avatar);

    const info = el('div', 'hub-agent-info');
    info.appendChild(el('div', 'hub-agent-name', label));
    if (agent) {
      const session = agent.loggedIn === true ? ['on', C.loggedIn] : agent.loggedIn === false ? ['off', C.loggedOut] : ['unknown', C.unknownLogin];
      const status = el('span', `hub-status ${session[0]}`, session[1]);
      if (agent.version) status.textContent += ` · ${H.version(agent.version)}`;
      info.appendChild(status);
      if (selected) info.appendChild(el('div', 'hub-current', H.current(modelLabel(agent.id, state.model) ?? C.planDefault, C.efforts[state.effort] ?? '')));
      const stats = state.stats?.[agent.id];
      info.appendChild(el('div', 'hub-stats', stats?.runs ? H.stats(stats) : H.never));
      if (stats?.lastError) info.appendChild(el('div', 'hub-error', `${H.lastError}: ${stats.lastError}`));
      if (modeModel.tech && agent.path) info.appendChild(el('div', 'hub-dev-row', `${H.path}: ${agent.path}`));
    }
    card.appendChild(info);

    const actions = el('div', 'hub-actions');
    const use = el('button', `hub-btn hub-btn-use${selected ? ' active' : ''}`, selected ? C.inUse : C.use);
    use.type = 'button';
    use.disabled = agent?.loggedIn === false;
    use.addEventListener('click', () => connection.select(agent ? agent.id : null));
    actions.appendChild(use);
    if (agent?.loggedIn === false) {
      const login = el('button', 'hub-btn hub-btn-login', C.login);
      login.type = 'button';
      login.addEventListener('click', () => connection.login(agent.id).then(() => setTimeout(() => connection.refresh(), 4000)));
      actions.appendChild(login);
    }
    if (agent && agent.loggedIn !== false) {
      const running = state.testing?.[agent.id] === 'running';
      const test = el('button', `hub-btn hub-btn-test${running ? ' disabled' : ''}`, running ? null : H.test);
      if (running) test.append(thinkingOrb(STEP_ORB.connect, { size: 20 }), document.createTextNode(H.testing)); // connecting to the agent
      test.type = 'button';
      test.disabled = running;
      test.title = H.testHint;
      test.addEventListener('click', () => connection.testAgent(agent.id, H.testPrompt));
      actions.appendChild(test);
      const result = state.testResult?.[agent.id];
      if (result && !running) {
        const line = el('span', `hub-test-result ${state.testing[agent.id] === 'ok' ? 'hub-test-ok' : 'hub-test-error'}`,
          state.testing[agent.id] === 'ok' ? H.testOk(result.ms) : H.testFailed);
        if (result.error) line.title = result.error;
        actions.appendChild(line);
      }
    }
    card.appendChild(actions);
    return card;
  }

  function agentsSection(state) {
    const parts = [el('p', 'hub-intro', C.intro)]; // the sidebar header already says "Conecta tu agente"
    if (!state.isDesktop) return [...parts, el('p', 'hub-empty', C.desktopOnly)];
    const grid = el('div', 'hub-agents');
    grid.appendChild(agentCard(null, state));
    state.agents.forEach((a) => grid.appendChild(agentCard(a, state)));
    if (!state.agents.length) grid.appendChild(el('p', 'hub-empty', C.none));
    parts.push(el('h2', 'hub-section', H.agents), grid);
    return parts;
  }

  function compareSection(state) {
    const others = state.agents.filter((a) => a.id !== state.selected && a.loggedIn !== false);
    if (!state.selected || !others.length) return [];
    const row = el('div', 'hub-segmented');
    for (const [id, label] of [[null, H.compareNone], ...others.map((a) => [a.id, a.label.split(' (')[0]])]) {
      const b = el('button', `hub-btn hub-btn-compare${state.compareWith === id ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => connection.setCompare(id));
      row.appendChild(b);
    }
    return [el('h2', 'hub-section', H.compare), el('p', 'hub-compare-intro', H.compareIntro), row];
  }

  function mcpSection(state) {
    const parts = [el('h2', 'hub-section', H.server), el('div', `hub-pill${state.mcp?.running ? ' on' : ''}`, state.mcp?.running ? H.running : H.stopped)];
    if (!state.mcp?.running || !state.mcp.url) return parts;
    parts.push(el('p', 'hub-url', C.mcpOn(mask(state.mcp.url, state.mcp.url))), el('p', 'hub-hint', C.mcpPrivate));
    const list = el('ul', 'hub-tools');
    for (const k of Object.keys(H.toolInfo)) {
      const li = el('li');
      li.append(el('strong', '', T[k] ?? k), el('span', 'hub-tool-desc', H.toolInfo[k]));
      list.appendChild(li);
    }
    parts.push(el('p', 'side-label', H.tools), list);
    return parts;
  }

  function activitySection(state) {
    const items = (state.activity ?? []).slice(0, 12);
    if (!items.length) return [el('h2', 'hub-section', H.activity), el('p', 'hub-empty', H.activityEmpty)];
    const list = el('div', 'hub-activity');
    for (const a of items) {
      const row = el('div', 'hub-activity-row');
      row.append(el('span', a.ok ? 'hub-dot-ok' : 'hub-dot-err'), el('span', 'hub-activity-tool', T[a.tool] ?? a.tool));
      if (a.path) row.appendChild(el('span', 'hub-activity-path', a.path));
      row.appendChild(el('span', 'hub-activity-ago', H.ago(Date.now() - a.at)));
      if (a.error) row.title = a.error;
      list.appendChild(row);
    }
    return [el('h2', 'hub-section', H.activity), list];
  }

  function snippetsSection(state) {
    if (!state.isDesktop) return [];
    const head = [el('h2', 'hub-section', C.fromEditor), el('p', 'hub-intro', C.fromEditorIntro)];
    if (!state.mcp?.running || !state.mcp.url) return [...head, el('p', 'hub-empty', C.mcpOff)];
    return [...head, ...snippets(state.mcp.url).map((s) => {
      const box = el('div', 'snippet');
      const top = el('div', 'snippet-head');
      const button = el('button', 'pill', C.copy);
      button.type = 'button';
      button.addEventListener('click', () => copy(button, s.code));
      top.append(el('span', '', C.snippets[s.key] ?? s.key), button);
      box.append(top, el('pre', '', mask(s.code, state.mcp.url)));
      return box;
    })];
  }

  function render() {
    const state = connection.store.state;
    const scroll = container.scrollTop;
    container.replaceChildren(...agentsSection(state), ...compareSection(state), ...mcpSection(state), ...activitySection(state), ...snippetsSection(state));
    container.scrollTop = scroll;
  }

  connection.store.subscribe(render, { immediate: true });
  modeModel.store.subscribe(render);
}
