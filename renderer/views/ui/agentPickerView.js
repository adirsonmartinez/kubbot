// Agent picker inside the chat composer (as in Obra): a pill with the agent and effort in use; it opens
// a small menu to switch agent, model and effort, or to go to "Conecta tu agente".
import { strings } from '../../i18n/es.js';
import { CATALOG } from '../../models/agentConnectionModel.js';

const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createAgentPickerView({ container, connectorsButton, connection, onMore }) {
  const pill = el('button', 'picker-pill');
  pill.type = 'button';
  pill.setAttribute('aria-haspopup', 'menu');
  const menu = el('div', 'picker-menu glass-pop');
  menu.hidden = true;
  container.append(pill, menu);

  const close = () => { menu.hidden = true; pill.classList.remove('open'); };
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    pill.classList.toggle('open', !menu.hidden);
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());

  connectorsButton.title = strings.chat.connectors;
  connectorsButton.setAttribute('aria-label', strings.chat.connectors);
  connectorsButton.addEventListener('click', () => onMore());

  function option(label, detail, active, disabled, run) {
    const b = el('button', `picker-option${active ? ' active' : ''}`);
    b.type = 'button';
    b.disabled = disabled;
    b.append(el('span', 'picker-dot'), el('strong', '', label), el('small', '', detail));
    b.addEventListener('click', run);
    return b;
  }

  function render(state) {
    const agent = state.agents.find((a) => a.id === state.selected);
    pill.textContent = agent ? `${agent.label.split(' ')[0]} · ${C.efforts[state.effort]}` : strings.chat.demo;
    pill.classList.toggle('live', Boolean(agent));

    const parts = [el('p', 'picker-label', strings.chat.pickerTitle)];
    parts.push(option(C.scripted, '', !state.selected, false, () => connection.select(null)));
    for (const a of state.agents) {
      const status = a.loggedIn === true ? C.loggedIn : a.loggedIn === false ? C.loggedOut : C.unknownLogin;
      parts.push(option(a.label, status, state.selected === a.id, a.loggedIn === false, () => connection.select(a.id)));
    }
    const catalog = CATALOG[state.selected];
    if (catalog) {
      if (catalog.models.length > 1) {
        parts.push(el('p', 'picker-label', C.model));
        const row = el('div', 'chip-row');
        for (const m of catalog.models) {
          const b = el('button', `chip${state.model === m ? ' active' : ''}`, m || C.planDefault);
          b.type = 'button';
          b.addEventListener('click', () => connection.setModel(m));
          row.appendChild(b);
        }
        parts.push(row);
      }
      parts.push(el('p', 'picker-label', C.effort));
      const seg = el('div', 'segmented');
      for (const e of catalog.efforts) {
        const b = el('button', state.effort === e ? 'active' : '', C.efforts[e]);
        b.type = 'button';
        b.addEventListener('click', () => connection.setEffort(e));
        seg.appendChild(b);
      }
      parts.push(seg);
    }
    const more = el('button', 'picker-more', strings.chat.pickerMore);
    more.type = 'button';
    more.addEventListener('click', () => { close(); onMore(); });
    parts.push(more);
    menu.replaceChildren(...parts);
  }

  connection.store.subscribe(render, { immediate: true });
}
