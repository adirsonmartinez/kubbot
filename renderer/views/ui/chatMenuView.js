// The chat's options menu (as in Obra): from the "+" in the composer, and from the floating button that
// replaces the chat when it is minimized or closed. Items only call app actions.
import { strings } from '../../i18n/es.js';

const M = strings.chat.menu;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// ctx: { actions, modeModel, chatViewModel, openChat? }
export function chatMenuItems({ actions, modeModel, chatViewModel, openChat }) {
  return [
    openChat && { label: M.open, run: openChat, primary: true },
    { label: M.newChat, run: () => chatViewModel.newChat() },
    { separator: true },
    { label: M.repairWorst, run: (b) => actions.repairWorst(b) },
    { label: M.history, run: () => actions.showRepairs() },
    { separator: true },
    { label: M.connect, run: () => actions.showConnect() },
    { label: M.editor, run: () => actions.showConnect() },
    { label: M.mode(modeModel.tech), run: () => modeModel.toggle() },
  ].filter(Boolean);
}

// A button that opens a small menu above it. getItems() is called each time it opens.
export function attachMenu(button, menu, getItems) {
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const close = () => { menu.hidden = true; button.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    menu.replaceChildren(...getItems().map((item) => {
      if (item.separator) return el('div', 'chat-menu-sep');
      const entry = el('button', `chat-menu-item${item.primary ? ' primary' : ''}`, item.label);
      entry.type = 'button';
      entry.setAttribute('role', 'menuitem');
      entry.addEventListener('click', () => { item.run(button); close(); });
      return entry;
    }));
    menu.hidden = false;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
  };
  button.setAttribute('aria-haspopup', 'menu');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  return { close };
}
