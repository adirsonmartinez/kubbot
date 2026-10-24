// Threat graph (SVG): columns internet -> app -> folders -> database -> exposed tables.
// Red dashed = attacker's route, orange dashed = data that arrives unchecked. Drag to pan, wheel to zoom.
import { strings } from '../../i18n/es.js';

const NS = 'http://www.w3.org/2000/svg';
const NODE_W = 152, NODE_H = 50, COL_GAP = 34, ROW_GAP = 20, PAD = 14;
const MIN_SCALE = 0.6, MAX_SCALE = 1.3; // never shrink text below legibility; pan instead
const G = strings.graph;

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

function layout(nodes) {
  const columns = [];
  for (const n of nodes) (columns[n.column] ??= []).push(n);
  const cols = columns.filter(Boolean);
  const tallest = Math.max(1, ...cols.map((c) => c.length));
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP;
  const pos = new Map();
  cols.forEach((col, ci) => {
    const colH = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const top = (height - colH) / 2;
    col.forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (NODE_W + COL_GAP), y: top + ri * (NODE_H + ROW_GAP) }));
  });
  const width = PAD * 2 + cols.length * NODE_W + (cols.length - 1) * COL_GAP;
  return { pos, width, height };
}

function curve(a, b) {
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function createGraphView({ graphViewModel: vm, shellViewModel: shell, mapViewModel }) {
  const $ = (id) => document.getElementById(id);
  const host = $('graph-canvas');
  const caption = $('graph-caption');
  const attackButton = $('graph-attack');
  const fitButton = $('graph-fit');
  $('graph-title').textContent = G.title;
  $('graph-description').textContent = G.description;
  fitButton.textContent = G.fit;

  const svg = svgEl('svg', { class: 'obra-graph', role: 'img', 'aria-label': G.title });
  host.appendChild(svg);

  // --- pan & zoom on the viewBox ---
  let view = { x: 0, y: 0, w: 1000, h: 600 };
  let content = { width: 1000, height: 600 };
  const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const fit = () => {
    const r = host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return; // hidden (map tab): fit again when shown
    // Pixels per graph unit: fit the whole graph, but keep it readable
    const scale = Math.min(Math.max(Math.min(r.width / content.width, r.height / content.height), MIN_SCALE), MAX_SCALE);
    const w = r.width / scale, h = r.height / scale;
    view = { x: (content.width - w) / 2, y: (content.height - h) / 2, w, h };
    apply();
  };
  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    const k = Math.exp(e.deltaY * 0.0015);
    const px = view.x + ((e.clientX - r.left) / r.width) * view.w;
    const py = view.y + ((e.clientY - r.top) / r.height) * view.h;
    const w = Math.min(Math.max(view.w * k, content.width * 0.2), content.width * 4);
    const h = (view.h / view.w) * w;
    view = { x: px - ((px - view.x) * w) / view.w, y: py - ((py - view.y) * h) / view.h, w, h };
    apply();
  }, { passive: false });
  let drag = null;
  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.node')) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    host.setPointerCapture(e.pointerId);
    host.classList.add('dragging');
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = host.getBoundingClientRect();
    view.x = drag.vx - ((e.clientX - drag.x) / r.width) * view.w;
    view.y = drag.vy - ((e.clientY - drag.y) / r.height) * view.h;
    apply();
  });
  const endDrag = () => { drag = null; host.classList.remove('dragging'); };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  fitButton.addEventListener('click', fit);
  attackButton.addEventListener('click', () => vm.toggleAttack());
  new ResizeObserver(() => { if (!svg.dataset.touched) fit(); }).observe(host); // also fires when the tab is shown
  host.addEventListener('pointerdown', () => { svg.dataset.touched = '1'; });

  // Clicking a folder opens its building on the map; the database opens its schema
  function onNode(n) {
    if (n.kind === 'folder') { shell.setStage('map'); mapViewModel.openFolder(n.path); }
    else if (n.kind === 'database' || n.kind === 'table') { shell.setStage('map'); mapViewModel.toggleSchema(); }
    else if (n.kind === 'app') { shell.setStage('map'); mapViewModel.closeFolder(); }
  }

  let lastSignature = '';
  function render(state) {
    attackButton.textContent = state.attacking ? G.stopAttack : G.animateAttack;
    attackButton.disabled = !state.open || state.attackSteps === 0;
    if (!state.open) {
      svg.replaceChildren();
      caption.textContent = G.noProject;
      return;
    }
    const { pos, width, height } = layout(state.nodes);
    content = { width, height };
    svg.replaceChildren();
    const edges = svgEl('g');
    for (const e of state.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const cls = e.kind === 'attack' ? `edge atk${state.attacking ? ' running' : ''}` : e.kind === 'tainted' ? 'edge taint' : 'edge';
      edges.appendChild(svgEl('path', { d: curve(a, b), class: cls }));
    }
    svg.appendChild(edges);
    for (const n of state.nodes) {
      const p = pos.get(n.id);
      const tone = n.kind === 'table' || n.level === 'red' ? 'danger' : n.kind === 'database' ? 'vault' : n.level === 'yellow' ? 'warn' : '';
      const g = svgEl('g', { class: `node ${tone} ${n.kind}`, transform: `translate(${p.x},${p.y})`, tabindex: '0' });
      g.appendChild(svgEl('rect', { width: NODE_W, height: NODE_H, rx: 8 }));
      const label = svgEl('text', { x: 12, y: 22, class: 'label' });
      label.textContent = truncate(n.label, 17);
      const sub = svgEl('text', { x: 12, y: 39, class: 'sub' });
      sub.textContent = truncate(G.sub(n), 20);
      g.append(label, sub);
      g.addEventListener('click', () => onNode(n));
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && onNode(n));
      svg.appendChild(g);
    }
    caption.textContent = state.attackSteps ? G.route(state.attackSteps) : G.noRoute;
    const signature = state.nodes.map((n) => n.id).join('|');
    if (signature !== lastSignature) { lastSignature = signature; delete svg.dataset.touched; fit(); }
    else apply();
  }

  vm.store.subscribe(render, { immediate: true });
}
