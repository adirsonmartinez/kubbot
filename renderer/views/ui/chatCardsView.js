// Interactive cards in the chat for map events (ChatViewModel `card`): a folder (its traffic light as a
// bar, counts, a hint and next steps) or a file (path, level, reason, who marked it, actions).
// Buttons call vm.choose(action, button), like the chips.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';

const K = strings.chat.cards;
const LEVELS = ['red', 'yellow', 'green'];
const LEVEL_ICON = { red: 'danger', yellow: 'shieldWarn', green: 'shieldOk' };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export const CHIP_ICON = { ask: 'ask', repair: 'wrench', audit: 'audit', locate: 'locate', risks: 'alert' };

export function actionButton(action, vm, className = 'card-action') {
  const b = el('button', `${className} ${action.kind ?? ''}`.trim());
  b.type = 'button';
  b.append(icon(CHIP_ICON[action.kind] ?? 'arrowRight', { size: 15 }), el('span', '', action.label));
  b.addEventListener('click', () => vm.choose(action, b));
  return b;
}

function folderCard(card, vm) {
  const total = LEVELS.reduce((n, l) => n + card.counts[l], 0);
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge folder');
  badge.appendChild(icon('folder', { size: 18 }));
  const title = el('div', 'card-title');
  title.append(el('strong', '', card.name), el('span', '', `${K.files(card.files)} · ${K.folders(card.folders)}`));
  head.append(badge, title);
  const parts = [head];
  if (total) {
    const bar = el('div', 'level-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', LEVELS.map((l) => `${card.counts[l]} ${K.levels[l]}`).join(', '));
    LEVELS.filter((l) => card.counts[l]).forEach((l, i) => {
      const seg = el('i', l);
      seg.style.flexGrow = String(card.counts[l]);
      seg.style.setProperty('--i', String(i));
      bar.appendChild(seg);
    });
    const legend = el('ul', 'level-legend');
    LEVELS.forEach((l) => {
      const li = el('li', `${l}${card.counts[l] ? '' : ' zero'}`);
      li.append(el('b', '', String(card.counts[l])), el('span', '', K.levels[l]));
      legend.appendChild(li);
    });
    parts.push(bar, legend);
  }
  parts.push(el('p', 'card-hint', card.hint));
  return parts;
}

function fileCard(card) {
  const head = el('header', 'card-head');
  const badge = el('span', `card-badge ${card.level}`);
  badge.appendChild(icon(LEVEL_ICON[card.level] ?? 'file', { size: 18 }));
  const title = el('div', 'card-title');
  title.appendChild(el('strong', '', card.name));
  if (card.path !== card.name) title.appendChild(el('code', 'card-path', card.path)); // a file at the top needs no path
  const pill = el('span', `level-pill ${card.level}`, strings.security.levels?.[card.level] ?? card.level);
  head.append(badge, title, pill);
  const parts = [head];
  if (card.reason) parts.push(el('p', 'card-reason', card.reason));
  const source = el('p', 'card-source');
  source.append(icon('info', { size: 13 }), el('span', '', card.source));
  parts.push(source);
  return parts;
}

export function renderChatCard(container, card, vm) {
  const parts = card.kind === 'folder' ? folderCard(card, vm) : fileCard(card);
  if (card.actions?.length) {
    const row = el('div', 'card-actions');
    card.actions.forEach((a) => row.appendChild(actionButton(a, vm)));
    parts.push(row);
  }
  container.replaceChildren(...parts);
}
