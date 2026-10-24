// Menu that opens when a crack (or its "!" sign) is clicked on the map. Only three things to decide:
// what it is, repair it (Remi), or audit it in the chat (the agent checks whether the risk is real).
import { strings } from '../../i18n/es.js';

const K = strings.crackMenu;
const LEVEL = strings.security.levels;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// Files of a building: '' = files at the project root; otherwise everything under that folder
const inBuilding = (folder) => (f) => (folder ? f.path.startsWith(`${folder}/`) : !f.path.includes('/'));

export function createCrackMenuView({ menu, stage, shellViewModel, mapViewModel, modeModel, actions }) {
  let state = null; // { folder, selected, explain }

  const close = () => { state = null; menu.hidden = true; };

  function render() {
    if (!state) return close();
    const files = shellViewModel.store.state.risks.filter(inBuilding(state.folder));
    if (!files.length) return close(); // repaired meanwhile
    const file = files.find((f) => f.path === state.selected) ?? files[0];
    state.selected = file.path;
    const place = mapViewModel.describePick({ type: 'folder', path: state.folder });
    const title = modeModel.tech || !place?.friendly ? `${state.folder || place?.name || ''}/` : place.friendly;

    const head = el('header', 'crack-menu-head');
    const x = el('button', 'crack-menu-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', K.close);
    x.addEventListener('click', close);
    head.append(el('span', `risk-icon ${file.level}`, '!'), el('strong', '', K.title(title)), x);

    const parts = [head];
    if (files.length > 1) {
      const list = el('div', 'crack-menu-files');
      for (const f of files) {
        const b = el('button', `crack-menu-file${f.path === file.path ? ' active' : ''}`);
        b.type = 'button';
        b.append(el('i', `level-dot ${f.level}`), el('span', 'mono', modeModel.tech ? f.path : f.name));
        b.addEventListener('click', () => { state.selected = f.path; state.explain = false; render(); });
        list.appendChild(b);
      }
      parts.push(list);
    } else {
      parts.push(el('p', 'crack-menu-file-one mono', modeModel.tech ? file.path : file.name));
    }

    const reason = file.reason || strings.security.reasons[file.reasonKey] || '';
    if (state.explain) {
      const what = el('div', 'crack-menu-what');
      what.append(el('strong', '', `${LEVEL[file.level]} · ${K.whatTitle}`), el('p', '', reason));
      if (modeModel.tech && strings.security.techReasons[file.reasonKey]) what.appendChild(el('p', 'mono small', strings.security.techReasons[file.reasonKey]));
      parts.push(what);
    }

    const row = el('div', 'crack-menu-actions');
    const button = (label, cls, run) => {
      const b = el('button', `crack-menu-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', () => run(b));
      row.appendChild(b);
    };
    button(state.explain ? K.hide : K.what, 'what', () => { state.explain = !state.explain; render(); });
    button(K.repair, 'repair', (b) => { actions.repair(file.path, b); close(); });
    button(K.audit, 'audit', () => { actions.audit(file.path, reason); close(); });
    parts.push(row);
    menu.replaceChildren(...parts);
    menu.hidden = false;
  }

  function open(pick, clientX, clientY) {
    state = { folder: pick.path, selected: null, explain: false };
    render();
    if (menu.hidden) return;
    const box = stage.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - box.left + 12, 8), box.width - menu.offsetWidth - 8);
    const y = Math.min(Math.max(clientY - box.top + 12, 56), box.height - menu.offsetHeight - 8);
    menu.style.transform = `translate(${x}px, ${y}px)`;
  }

  menu.hidden = true;
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', (e) => { if (state && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  shellViewModel.store.subscribe(() => state && render());
  modeModel.store.subscribe(() => state && render());

  return { open, close };
}
