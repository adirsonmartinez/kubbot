// The floating icon bar, in two groups split by a divider: side panels (explorer, risks…) and views
// (map, git…). Icons can be dragged to a new place within their group (or moved with Alt+← / Alt+→
// when focused). The order is remembered in this computer.
const KEY = 'platanus.iconbar.order.v1';

// Stable id of an icon: its side panel, its view, or its own id (chat)
const idOf = (b) => (b.dataset.side ? `side:${b.dataset.side}` : b.dataset.stage ? `stage:${b.dataset.stage}` : b.id);
const groupOf = (b) => (b.dataset.side ? 'side' : 'view');

export function createIconBarView({ bar }) {
  const items = () => [...bar.children].filter((n) => n.tagName === 'BUTTON');

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(items().map(idOf))); } catch { /* private mode */ }
  };

  // Restore the saved order (new icons that were not saved stay at the end)
  try {
    const order = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const byId = new Map(items().map((b) => [idOf(b), b]));
    for (const id of order) if (byId.has(id)) bar.appendChild(byId.get(id));
    for (const b of byId.values()) if (!order.includes(idOf(b))) bar.appendChild(b);
  } catch { /* nothing saved */ }
  // Side panels first, then the views (an order saved before the groups existed may mix them)
  for (const b of items().filter((x) => groupOf(x) === 'view')) bar.appendChild(b);
  const divider = document.createElement('span');
  divider.className = 'icon-bar-divider';
  divider.setAttribute('aria-hidden', 'true');
  items().find((x) => groupOf(x) === 'view')?.before(divider);
  const sameGroup = (a, b) => groupOf(a) === groupOf(b);

  let dragged = null;
  const clearMarks = () => items().forEach((b) => b.classList.remove('drop-before', 'drop-after'));

  for (const button of items()) {
    button.addEventListener('dragstart', (e) => {
      dragged = button;
      button.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', idOf(button));
    });
    button.addEventListener('dragend', () => {
      button.classList.remove('dragging');
      clearMarks();
      dragged = null;
    });
    button.addEventListener('dragover', (e) => {
      if (!dragged || dragged === button || !sameGroup(dragged, button)) return;
      e.preventDefault();
      const r = button.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      clearMarks();
      button.classList.add(after ? 'drop-after' : 'drop-before');
    });
    button.addEventListener('drop', (e) => {
      if (!dragged || dragged === button || !sameGroup(dragged, button)) return;
      e.preventDefault();
      const r = button.getBoundingClientRect();
      button[e.clientX > r.left + r.width / 2 ? 'after' : 'before'](dragged);
      clearMarks();
      save();
    });
    // Keyboard: Alt+← / Alt+→ moves the focused icon
    button.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const list = items().filter((x) => sameGroup(x, button));
      const i = list.indexOf(button);
      if (e.key === 'ArrowLeft' && i > 0) list[i - 1].before(button);
      if (e.key === 'ArrowRight' && i < list.length - 1) list[i + 1].after(button);
      button.focus();
      save();
    });
  }
}
