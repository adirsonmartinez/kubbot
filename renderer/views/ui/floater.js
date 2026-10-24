// Makes a card on the map a floating window: a small bar with a grip to drag it anywhere on the map,
// its title, and a button to minimize it to that bar. Position and minimized state are remembered;
// double-clicking the bar puts it back in its place.
const KEY = (key) => `platanus.float.v1:${key}`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// el: the card (stays as it is; it moves inside a wrapper) · key: what to remember it by
// stage: the area it can move in · title / minimizeLabel / restoreLabel / moveLabel: texts from es.js
export function makeFloating({ el: card, key, stage, title, labels }) {
  const wrap = el('div', 'floater');
  wrap.id = `${card.id}-float`;
  const bar = el('div', 'floater-bar');
  const grip = el('span', 'floater-grip');
  grip.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/></svg>'; // static icon
  grip.title = labels.move;
  const name = el('span', 'floater-title', title);
  const min = el('button', 'floater-min');
  min.type = 'button';
  bar.append(grip, name, min);
  card.before(wrap);
  wrap.append(bar, card);

  let state = { x: null, y: null, min: false };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY(key)) ?? '{}') }; } catch { /* nothing saved */ }
  const save = () => { try { localStorage.setItem(KEY(key), JSON.stringify(state)); } catch { /* private mode */ } };

  const apply = () => {
    wrap.classList.toggle('min', state.min);
    wrap.classList.toggle('moved', state.x !== null);
    if (state.x !== null) {
      Object.assign(wrap.style, { left: `${state.x}px`, top: `${state.y}px`, right: 'auto', bottom: 'auto' });
    } else {
      Object.assign(wrap.style, { left: '', top: '', right: '', bottom: '' });
    }
    min.textContent = state.min ? '+' : '–';
    min.title = state.min ? labels.restore : labels.minimize;
    min.setAttribute('aria-label', min.title);
    min.setAttribute('aria-expanded', String(!state.min));
  };

  // Keep it inside the map
  const clamp = () => {
    if (state.x === null) return;
    const box = stage.getBoundingClientRect();
    state.x = Math.min(Math.max(state.x, 4), Math.max(4, box.width - wrap.offsetWidth - 4));
    state.y = Math.min(Math.max(state.y, 4), Math.max(4, box.height - wrap.offsetHeight - 4));
  };

  min.addEventListener('click', () => { state.min = !state.min; apply(); save(); });

  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.button !== 0) return;
    const box = stage.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, box };
    try { bar.setPointerCapture(e.pointerId); } catch { /* synthetic event: no real pointer to capture */ }
    wrap.classList.add('dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.x = e.clientX - drag.box.left - drag.dx;
    state.y = e.clientY - drag.box.top - drag.dy;
    clamp();
    apply();
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    wrap.classList.remove('dragging');
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    save();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    state.x = null; state.y = null; apply(); save();
  });

  // The card decides when it is shown (e.g. only on the map); the window follows it
  const sync = () => { wrap.hidden = card.hidden; };
  new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', () => { clamp(); apply(); });
  sync();
  apply();
  return wrap;
}
