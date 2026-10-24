// "Conecta tu agente" (sidebar view): your subscriptions (Claude, Grok, Codex) with model and effort,
// and copy-paste snippets so Claude Code, Cursor, Codex or Gemini can use the local MCP server.
import { strings } from '../../i18n/es.js';
import { CATALOG } from '../../models/agentConnectionModel.js';

const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// The address carries the server's private key: on screen it is masked (demos, screen sharing);
// "Copiar" copies the real one.
const mask = (text, url) => text.split(url).join(url.replace(/\/mcp\/[a-f0-9]+$/, '/mcp/••••••••'));

function snippets(url) {
  return [
    { key: 'claude', code: `claude mcp add --transport http platanus ${url}` },
    { key: 'cursor', code: JSON.stringify({ mcpServers: { platanus: { url } } }, null, 2) },
    { key: 'codex', code: `[mcp_servers.platanus]\nurl = "${url}"` },
    { key: 'gemini', code: JSON.stringify({ mcpServers: { platanus: { httpUrl: url } } }, null, 2) },
  ];
}

async function copy(button, textToCopy) {
  try {
    await navigator.clipboard.writeText(textToCopy);
    button.textContent = C.copied;
    setTimeout(() => (button.textContent = C.copy), 1400);
  } catch {
    // no clipboard: the code stays visible to copy by hand
  }
}

export function createAgentConnectView({ container, connection }) {
  function agentRow(agent, state) {
    const row = el('div', `agent-row${state.selected === agent.id ? ' selected' : ''}`);
    const status = agent.loggedIn === true ? C.loggedIn : agent.loggedIn === false ? C.loggedOut : C.unknownLogin;
    const info = el('div', 'agent-info');
    info.append(el('strong', '', agent.label), el('span', `agent-status ${agent.loggedIn === false ? 'off' : 'on'}`, status));
    row.appendChild(info);
    if (agent.loggedIn === false) {
      const login = el('button', 'pill', C.login);
      login.type = 'button';
      login.addEventListener('click', () => connection.login(agent.id).then(() => setTimeout(() => connection.refresh(), 4000)));
      row.appendChild(login);
    }
    const use = el('button', `pill${state.selected === agent.id ? ' active' : ''}`, state.selected === agent.id ? C.inUse : C.use);
    use.type = 'button';
    use.disabled = agent.loggedIn === false;
    use.addEventListener('click', () => connection.select(agent.id));
    row.appendChild(use);
    return row;
  }

  function choices(state) {
    const catalog = CATALOG[state.selected];
    if (!catalog) return [];
    const wrap = el('div', 'agent-choices');
    if (catalog.models.length > 1) {
      wrap.appendChild(el('p', 'side-label', C.model));
      const models = el('div', 'chip-row');
      for (const m of catalog.models) {
        const b = el('button', `chip${state.model === m ? ' active' : ''}`, m || C.planDefault);
        b.type = 'button';
        b.addEventListener('click', () => connection.setModel(m));
        models.appendChild(b);
      }
      wrap.appendChild(models);
    }
    wrap.appendChild(el('p', 'side-label', C.effort));
    const efforts = el('div', 'segmented');
    for (const e of catalog.efforts) {
      const b = el('button', state.effort === e ? 'active' : '', C.efforts[e]);
      b.type = 'button';
      b.addEventListener('click', () => connection.setEffort(e));
      efforts.appendChild(b);
    }
    wrap.appendChild(efforts);
    return [wrap];
  }

  function render(state) {
    const parts = [el('p', 'side-intro', C.intro), el('p', 'side-label', C.subscriptions)];

    if (!state.isDesktop) parts.push(el('p', 'side-empty', C.desktopOnly));
    else {
      const demo = el('div', `agent-row${state.selected ? '' : ' selected'}`);
      const info = el('div', 'agent-info');
      info.append(el('strong', '', C.scripted));
      const useDemo = el('button', `pill${state.selected ? '' : ' active'}`, state.selected ? C.use : C.inUse);
      useDemo.type = 'button';
      useDemo.addEventListener('click', () => connection.select(null));
      demo.append(info, useDemo);
      parts.push(demo);
      if (!state.agents.length) parts.push(el('p', 'side-empty', C.none));
      state.agents.forEach((a) => parts.push(agentRow(a, state)));
      parts.push(...choices(state));
    }

    parts.push(el('p', 'side-label', C.fromEditor), el('p', 'side-intro', C.fromEditorIntro));
    if (!state.mcp.running) parts.push(el('p', 'side-empty', state.isDesktop ? C.mcpOff : C.desktopOnly));
    else {
      parts.push(el('p', 'mcp-url', C.mcpOn(mask(state.mcp.url, state.mcp.url))), el('p', 'side-intro', C.mcpPrivate));
      for (const s of snippets(state.mcp.url)) {
        const box = el('div', 'snippet');
        const head = el('div', 'snippet-head');
        const button = el('button', 'pill', C.copy);
        button.type = 'button';
        button.addEventListener('click', () => copy(button, s.code));
        head.append(el('span', '', C.snippets[s.key]), button);
        box.append(head, el('pre', '', mask(s.code, state.mcp.url)));
        parts.push(box);
      }
    }
    container.replaceChildren(...parts);
  }

  connection.store.subscribe(render, { immediate: true });
}
