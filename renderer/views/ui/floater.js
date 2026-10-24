// Makes a card on the map a floating window: a small bar with a grip to drag it anywhere on the map,
// its title, and a button to minimize it to that bar. Position and minimized state are remembered;
// double-clicking the bar puts it back in its place.
//
// dockArea (optional): a function returning a place where the card docks (e.g. above the pinned chat)
// or null when there is none. While there is one, the card lives there unless it was dragged out;
// dropping it back over that column docks it again.
import { icon } from '../icons.js';

const KEY = (key) => `platanus.float.v1:${key}`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function makeFloating({ el: card, key, stage, title, labels, dockArea = () => null }) {
  const wrap = el('div', 'floater');
  wrap.id = `${card.id}-float`;
  const bar = el('div', 'floater-bar');
  const grip = el('span', 'floater-grip');
  grip.innerHTML = icon('grip'); // static icon
  grip.title = labels.move;
  const name = el('span', 'floater-title', title);
  const min = el('button', 'floater-min');
  min.type = 'button';
  bar.append(grip, name, min);
  card.before(wrap);
  wrap.append(bar, card);

  // docked: lives in the dock area when there is one (true until dragged out)
  let state = { x: null, y: null, min: false, docked: true };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY(key)) ?? '{}') }; } catch { /* nothing saved */ }
  const save = () => { try { localStorage.setItem(KEY(key), JSON.stringify(state)); } catch { /* private mode */ } };

  const dockColumn = () => dockArea()?.parentElement ?? null;

  // Put the card where it belongs: in the dock, or on the map (in its place or where it was dropped)
  function place() {
    const area = state.docked ? dockArea() : null;
    if (area) {
      if (wrap.parentElement !== area) area.prepend(wrap);
      Object.assign(wrap.style, { left: '', top: '', right: '', bottom: '' });
    } else {
      if (wrap.parentElement !== stage) stage.appendChild(wrap);
      if (state.x !== null) Object.assign(wrap.style, { left: `${state.x}px`, top: `${state.y}px`, right: 'auto', bottom: 'auto' });
      else Object.assign(wrap.style, { left: '', top: '', right: '', bottom: '' });
    }
    wrap.classList.toggle('docked', Boolean(area));
    wrap.classList.toggle('moved', !area && state.x !== null);
    wrap.classList.toggle('min', state.min);
    min.textContent = state.min ? '+' : '–';
    min.title = state.min ? labels.restore : labels.minimize;
    min.setAttribute('aria-label', min.title);
    min.setAttribute('aria-expanded', String(!state.min));
  }

  // Keep it inside the map
  const clamp = () => {
    if (state.x === null) return;
    const box = stage.getBoundingClientRect();
    state.x = Math.min(Math.max(state.x, 4), Math.max(4, box.width - wrap.offsetWidth - 4));
    state.y = Math.min(Math.max(state.y, 4), Math.max(4, box.height - wrap.offsetHeight - 4));
  };

  min.addEventListener('click', (e) => {
    e.stopPropagation();
    state.min = !state.min;
    place();
    save();
  });

  const over = (rect, x, y) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.button !== 0) return;
    const r = wrap.getBoundingClientRect();
    // Leaving the dock: it becomes a floating card on the map, under the pointer
    if (wrap.classList.contains('docked')) {
      const box = stage.getBoundingClientRect();
      state.docked = false;
      state.x = Math.max(4, Math.min(r.left - box.left, box.width - r.width - 4));
      state.y = Math.max(4, r.top - box.top);
      place();
    }
    const now = wrap.getBoundingClientRect();
    drag = { dx: e.clientX - now.left, dy: e.clientY - now.top, box: stage.getBoundingClientRect() };
    try { bar.setPointerCapture(e.pointerId); } catch { /* synthetic event: no real pointer to capture */ }
    wrap.classList.add('dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.x = e.clientX - drag.box.left - drag.dx;
    state.y = e.clientY - drag.box.top - drag.dy;
    clamp();
    place();
    // Over the dock column: show that letting go docks it there
    dockColumn()?.classList.toggle('drop-here', over(dockColumn()?.getBoundingClientRect(), e.clientX, e.clientY));
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    wrap.classList.remove('dragging');
    try { bar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const column = dockColumn();
    if (column && over(column.getBoundingClientRect(), e.clientX, e.clientY)) {
      state.docked = true;
      state.x = null; state.y = null;
    }
    column?.classList.remove('drop-here');
    place();
    save();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    state.x = null; state.y = null; state.docked = true;
    place();
    save();
  });

  // The card decides when it is shown (e.g. only on the map); the window follows it
  const sync = () => { wrap.hidden = card.hidden; };
  new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  // Pinning or unpinning the chat opens or closes the dock area
  new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => { clamp(); place(); });
  sync();
  place();
  return wrap;
}
