// IDE shell: title bar with menus and search, icon rail, sidebar (explorer / risks) and status bar.
// Only draws ShellViewModel and forwards clicks to view model actions.
import { strings } from '../../i18n/es.js';

const S = strings.shell;
const LEVEL_LABEL = strings.security.levels;
const ZOOM_STEP = 1.3;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createShellView({ shellViewModel: vm, cameraViewModel: camera }) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;

  // --- Menus (title bar) ---
  const MENUS = [
    { key: 'file', items: [{ label: S.actions.openProject, run: () => vm.openProject() }] },
    {
      key: 'view',
      items: [
        { label: S.actions.centerView, run: () => camera.reset() },
        { label: S.actions.zoomIn, run: () => camera.zoomBy(ZOOM_STEP) },
        { label: S.actions.zoomOut, run: () => camera.zoomBy(1 / ZOOM_STEP) },
        { label: S.actions.backToMap, run: () => { vm.setStage('map'); vm.showFolder(''); } },
        { label: S.actions.showMap, run: () => vm.setStage('map') },
        { label: S.actions.showGraph, run: () => vm.setStage('graph') },
      ],
    },
    { key: 'agent', items: [{ label: S.actions.openChat, run: () => vm.store.state.chatOpen || vm.toggleChat() }] },
    {
      key: 'window',
      items: [
        { label: S.actions.toggleSidebar, run: () => vm.toggleSidebar() },
        { label: S.actions.toggleChat, run: () => vm.toggleChat() },
      ],
    },
  ];

  const menuBar = $('menu');
  let openMenu = null;
  const closeMenus = () => {
    openMenu?.classList.remove('open');
    openMenu = null;
  };
  for (const menu of MENUS) {
    const wrap = el('div', 'menu');
    const button = el('button', 'menu-button', S.menus[menu.key]);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    const list = el('div', 'menu-list glass-pop');
    list.setAttribute('role', 'menu');
    for (const item of menu.items) {
      const entry = el('button', 'menu-item', item.label);
      entry.type = 'button';
      entry.setAttribute('role', 'menuitem');
      entry.addEventListener('click', () => {
        closeMenus();
        item.run();
      });
      list.appendChild(entry);
    }
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = openMenu === wrap;
      closeMenus();
      if (!wasOpen) {
        wrap.classList.add('open');
        openMenu = wrap;
      }
    });
    wrap.append(button, list);
    menuBar.appendChild(wrap);
  }
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenus());

  $('search-label').textContent = S.search;
  $('search-shortcut').textContent = S.searchShortcut;
  $('brand-name').textContent = S.brand;

  // --- Rail ---
  for (const button of document.querySelectorAll('#rail [data-side]')) {
    const side = button.dataset.side;
    button.title = S.rail[side];
    button.setAttribute('aria-label', S.rail[side]);
    button.addEventListener('click', () => vm.setSide(side));
  }
  // Map / graph: switch what the stage shows (the map button also leaves an open building)
  const stageButtons = [...document.querySelectorAll('#rail [data-stage-button]')];
  for (const button of stageButtons) {
    const stage = button.dataset.stageButton;
    button.title = S.rail[stage];
    button.setAttribute('aria-label', S.rail[stage]);
    button.addEventListener('click', () => {
      if (stage === 'map' && vm.store.state.stage === 'map') vm.showFolder('');
      vm.setStage(stage);
    });
  }
  const chatButton = $('rail-chat');
  chatButton.title = S.actions.toggleChat;
  chatButton.setAttribute('aria-label', S.actions.toggleChat);
  chatButton.addEventListener('click', () => vm.toggleChat());

  // --- Sidebar ---
  const sidebarTitle = $('sidebar-title');
  const sidebarBody = $('sidebar-body');

  const dot = (level) => {
    const d = el('span', `level-dot ${level}`);
    d.title = LEVEL_LABEL[level];
    return d;
  };

  function fileRow(file) {
    const row = el('button', 'side-row file');
    row.type = 'button';
    row.append(dot(file.level), el('span', 'side-name', file.name));
    row.title = file.path;
    row.addEventListener('click', () => vm.showFile(file.path));
    return row;
  }

  function renderExplorer(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    return state.folders.map((folder) => {
      const group = el('div', 'side-group');
      if (folder.path) {
        const head = el('button', 'side-row folder');
        head.type = 'button';
        const worst = folder.files.find((f) => f.level === 'red') ? 'red' : folder.files.find((f) => f.level === 'yellow') ? 'yellow' : 'green';
        head.append(dot(worst), el('span', 'side-name', `${folder.name}/`), el('span', 'side-count', String(folder.files.length)));
        head.title = S.sidebar.openFolder(folder.name);
        head.addEventListener('click', () => vm.showFolder(folder.path));
        group.appendChild(head);
      }
      const files = el('div', folder.path ? 'side-files' : 'side-files root');
      folder.files.slice(0, 40).forEach((f) => files.appendChild(fileRow(f)));
      group.appendChild(files);
      return group;
    });
  }

  function renderRisks(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    const red = state.risks.filter((r) => r.level === 'red').length;
    const summary = el('p', 'side-summary', S.sidebar.risksSummary(red, state.risks.length - red));
    if (!state.risks.length) return [el('p', 'side-empty', S.sidebar.noRisks)];
    return [
      summary,
      ...state.risks.map((file) => {
        const card = el('button', `risk-card ${file.level}`);
        card.type = 'button';
        const head = el('div', 'risk-head');
        head.append(dot(file.level), el('span', 'risk-level', LEVEL_LABEL[file.level]));
        const reason = file.reason || strings.security.reasons[file.reasonKey] || '';
        card.append(head, el('strong', 'risk-path', file.path), el('span', 'risk-reason', reason));
        card.addEventListener('click', () => vm.showFile(file.path));
        return card;
      }),
    ];
  }

  // --- Stage tabs (map / graph) ---
  for (const tab of document.querySelectorAll('#stage-tabs [data-stage]')) {
    tab.addEventListener('click', () => vm.setStage(tab.dataset.stage));
  }

  // --- Status bar ---
  const status = $('statusbar');

  function render(state) {
    body.classList.toggle('sidebar-closed', !state.sidebarOpen);
    body.classList.toggle('chat-closed', !state.chatOpen);
    for (const button of document.querySelectorAll('#rail [data-side]')) {
      button.classList.toggle('active', state.sidebarOpen && button.dataset.side === state.side);
    }
    chatButton.classList.toggle('active', state.chatOpen);
    for (const button of stageButtons) button.classList.toggle('active', button.dataset.stageButton === state.stage);
    body.classList.toggle('stage-graph', state.stage === 'graph');
    $('graph-panel').hidden = state.stage !== 'graph';
    for (const tab of document.querySelectorAll('#stage-tabs [data-stage]')) {
      const active = tab.dataset.stage === state.stage;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    }

    sidebarTitle.textContent = S.sidebar[state.side];
    sidebarBody.replaceChildren(...(state.side === 'risks' ? renderRisks(state) : renderExplorer(state)));

    const { red, yellow, green } = state.counts;
    $('project-chip').hidden = !state.open;
    $('project-chip-name').textContent = state.projectName || strings.map.defaultProjectName;
    $('project-chip').classList.toggle('danger', red > 0);
    status.replaceChildren(
      el('span', 'status-strong', state.open ? state.projectName || strings.map.defaultProjectName : S.status.noProject),
      ...(state.open ? [el('span', 'status-counts', S.status.counts(red, yellow, green))] : []),
      el('span', 'status-agent', S.status.agent),
    );
  }

  vm.store.subscribe(render, { immediate: true });
}
