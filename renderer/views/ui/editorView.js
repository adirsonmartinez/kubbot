// Floating editor over the map: a header (drag to move, double click: back in place), one tab per open
// file (traffic-light dot, name, unsaved dot / close), the file's path with its state, and the text with
// line numbers. ⌘S / Ctrl+S saves, Tab indents. Keys typed here never reach the map's shortcuts.
import { strings } from '../../i18n/es.js';
import { icon } from '../icons.js';
import { makeDraggable } from './draggable.js';

const E = strings.editor;
const INDENT = '  ';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const iconButton = (name, label, className = 'editor-icon-btn') => {
  const button = el('button', className);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name); // static icon
  return button;
};

export function createEditorView({ stage, editorViewModel }) {
  const vm = editorViewModel;
  const root = el('section', 'editor');
  root.id = 'editor';
  root.hidden = true;

  const head = el('header', 'editor-head');
  const title = el('strong', '', E.title);
  const closeWindow = iconButton('close', E.close);
  head.append(title, closeWindow);

  const tabs = el('div', 'editor-tabs');
  tabs.setAttribute('role', 'tablist');

  const bar = el('div', 'editor-bar');
  const path = el('span', 'editor-path mono');
  const secret = el('span', 'editor-secret', E.secret);
  secret.title = E.secretHint;
  const status = el('span', 'editor-status');
  const save = el('button', 'editor-save', E.save);
  save.type = 'button';
  save.title = E.saveHint;
  bar.append(path, secret, status, save);

  const notice = el('div', 'editor-notice');
  const noticeText = el('span');
  const reload = el('button', 'editor-notice-btn', E.reload);
  reload.type = 'button';
  notice.append(noticeText, reload);

  const body = el('div', 'editor-body');
  const gutter = el('pre', 'editor-gutter mono');
  gutter.setAttribute('aria-hidden', 'true');
  const text = el('textarea', 'editor-text mono');
  text.spellcheck = false;
  text.wrap = 'off';
  text.setAttribute('autocapitalize', 'off');
  text.setAttribute('autocomplete', 'off');
  const message = el('div', 'editor-message');
  body.append(gutter, text, message);

  root.append(head, tabs, bar, notice, body);
  stage.appendChild(root);
  makeDraggable({ el: root, handle: head, key: 'editor', area: stage });

  // Each tab keeps its own cursor and scroll
  const views = new Map(); // path -> { start, end, top, left }
  let shown = null; // path whose text is in the textarea

  const active = () => vm.tab(vm.store.state.active);

  function closeTab(path) {
    if (vm.close(path)) return;
    if (window.confirm(E.confirmClose(vm.tab(path)?.name ?? path))) vm.close(path, { force: true });
  }

  function renderTabs({ tabs: list, active: current }) {
    tabs.replaceChildren(...list.map((t) => {
      const dirty = vm.isDirty(t.path);
      const button = el('div', `editor-tab${t.path === current ? ' active' : ''}${dirty ? ' dirty' : ''}`);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(t.path === current));
      button.title = t.path;
      button.append(el('span', `level-dot ${t.level ?? 'green'}`), el('span', 'editor-tab-name', t.name));
      const close = iconButton('close', E.closeTab, 'editor-tab-close');
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.path); });
      button.append(close);
      button.addEventListener('click', () => vm.activate(t.path));
      button.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t.path); });
      return button;
    }));
    tabs.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderGutter(value) {
    const lines = value.split('\n').length;
    if (gutter.dataset.lines === String(lines)) return;
    gutter.dataset.lines = String(lines);
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  }

  function renderActive() {
    const t = active();
    // Remember where the previous tab was
    if (shown && shown !== t?.path && vm.tab(shown)) {
      views.set(shown, { start: text.selectionStart, end: text.selectionEnd, top: text.scrollTop, left: text.scrollLeft });
    }
    if (!t) { shown = null; return; }

    path.textContent = t.path;
    secret.hidden = !t.secret;
    root.classList.toggle('is-secret', t.secret);
    const dirty = vm.isDirty(t.path);
    status.textContent = t.status === 'loading' ? E.loading : t.saving ? E.saving : t.saveError ? t.saveError : dirty ? E.unsaved : t.status === 'ready' ? E.saved : '';
    status.className = `editor-status${t.saveError ? ' error' : dirty ? ' dirty' : ''}`;
    save.disabled = !dirty || t.saving;
    save.hidden = t.status !== 'ready';

    notice.hidden = !t.stale;
    noticeText.textContent = E.stale;

    const ready = t.status === 'ready';
    text.hidden = !ready;
    gutter.hidden = !ready;
    message.hidden = ready;
    message.textContent = t.status === 'error' ? (E.errors[t.error] ?? t.error ?? E.errors.failed) : E.loading;
    if (!ready) { shown = null; return; }

    // Only touch the textarea when another file comes in or the content changed from outside (a reload)
    if (shown !== t.path || text.value !== t.content) {
      text.value = t.content;
      const v = shown !== t.path ? views.get(t.path) : null;
      if (v) {
        text.setSelectionRange(v.start, v.end);
        text.scrollTop = v.top;
        text.scrollLeft = v.left;
      }
      shown = t.path;
    }
    renderGutter(t.content);
    gutter.scrollTop = text.scrollTop;
  }

  vm.store.subscribe((state, previous) => {
    root.hidden = !state.open;
    if (!state.open) return;
    renderTabs(state);
    renderActive();
    if (state.active !== previous?.active || state.open !== previous?.open) {
      if (active()?.status === 'ready') text.focus({ preventScroll: true });
    }
    for (const key of views.keys()) if (!vm.tab(key)) views.delete(key);
  }, { immediate: true });

  // --- Input ---
  closeWindow.addEventListener('click', () => vm.hide());
  save.addEventListener('click', () => vm.save(vm.store.state.active));
  reload.addEventListener('click', () => vm.reload(vm.store.state.active));
  text.addEventListener('input', () => vm.edit(vm.store.state.active, text.value));
  text.addEventListener('scroll', () => { gutter.scrollTop = text.scrollTop; });

  // Typing here never moves the map (Esc, Q/E/G, WASD); ⌘S saves and Tab indents instead of leaving
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      vm.save(vm.store.state.active);
    } else if (e.key === 'Tab' && e.target === text && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) return outdent();
      document.execCommand('insertText', false, INDENT); // keeps the native undo stack
    }
  });

  // Shift+Tab: remove one indent from the current line
  function outdent() {
    const start = text.value.lastIndexOf('\n', text.selectionStart - 1) + 1;
    if (!text.value.startsWith(INDENT, start)) return;
    const caret = text.selectionStart;
    text.setSelectionRange(start, start + INDENT.length);
    document.execCommand('delete');
    text.setSelectionRange(Math.max(start, caret - INDENT.length), Math.max(start, caret - INDENT.length));
  }

  // Wheel and clicks inside the editor stay in the editor (the map must not zoom or pick under it)
  for (const type of ['wheel', 'pointerdown', 'click', 'dblclick']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  return root;
}
