// Agent picker inside the chat composer (as in Obra): a pill with the agent and effort in use; it opens
// a small menu to switch agent, model and effort, or to go to "Conecta tu agente".
import { strings } from '../../i18n/es.js';
import { CATALOG, modelLabel } from '../../models/agentConnectionModel.js';
import { createEffortSlider } from './effortSlider.js';

const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createAgentPickerView({ container, connection, onMore }) {
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


  function option(label, detail, active, disabled, run) {
    const b = el('button', `picker-option${active ? ' active' : ''}`);
    b.type = 'button';
    b.disabled = disabled;
    b.append(el('span', 'picker-dot'), el('strong', '', label), el('small', '', detail));
    b.addEventListener('click', run);
    return b;
  }

  let slider = null;
  let menuKey = '';

  function renderPill(state, agent) {
    // As in Obra: "● Opus 5.5  Profundo ▮▮▮ ⌄"
    pill.replaceChildren();
    if (agent) {
      const catalog = CATALOG[state.selected];
      const index = catalog.efforts.indexOf(state.effort);
      const meter = el('span', 'picker-meter');
      meter.style.setProperty('--level', String(index / Math.max(1, catalog.efforts.length - 1)));
      catalog.efforts.forEach((_, i) => {
        const bar = el('i', i <= index ? 'on' : '');
        bar.style.height = `${4 + i * 1.5}px`;
        meter.appendChild(bar);
      });
      pill.append(el('i', 'picker-live'), el('span', 'picker-model', modelLabel(state.selected, state.model) ?? C.planDefault), el('span', 'picker-effort', C.efforts[state.effort]), meter);
    } else pill.append(el('span', 'picker-model', strings.chat.demo));
    pill.appendChild(el('span', 'picker-chevron', '⌄'));
    pill.title = agent ? agent.label : C.scripted;
    pill.classList.toggle('live', Boolean(agent));
  }

  function render(state) {
    const agent = state.agents.find((a) => a.id === state.selected);
    renderPill(state, agent);
    // Changing only the effort updates the slider in place (rebuilding would drop the thumb mid-drag)
    const key = JSON.stringify([state.selected, state.model, state.agents.map((a) => [a.id, a.loggedIn])]);
    if (key === menuKey && slider) return slider.set(state.effort);
    menuKey = key;

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
        const row = el('div', 'model-grid');
        for (const m of catalog.models) {
          const b = el('button', `model-option${state.model === m.id ? ' active' : ''}`);
          b.type = 'button';
          b.append(el('strong', '', m.label ?? C.planDefault), el('small', '', m.note ?? C.modelNotes[m.tier] ?? ''));
          b.addEventListener('click', () => connection.setModel(m.id));
          row.appendChild(b);
        }
        parts.push(row);
      }
      slider = createEffortSlider({ efforts: catalog.efforts, value: state.effort, onChange: (e) => connection.setEffort(e) });
      parts.push(slider.el);
    } else slider = null;
    const more = el('button', 'picker-more', strings.chat.pickerMore);
    more.type = 'button';
    more.addEventListener('click', () => { close(); onMore(); });
    parts.push(more);
    menu.replaceChildren(...parts);
  }

  connection.store.subscribe(render, { immediate: true });
}
