// IDE shell: title bar (menus, Vibe/Dev toggle, search), icon rail with hover cards, sidebar
// (explorer as a guide or as the full tree, risks with "Reparar"), stage tabs, project map and status bar.
// Only draws ShellViewModel and forwards clicks to view model actions.
import { strings } from '../../i18n/es.js';
import { TAG_COLOR, TAGS } from '../../models/folderTags.js';
import { createDevTree } from './devTreeView.js';

const S = strings.shell;
const P = S.project;
const LEVEL_LABEL = strings.security.levels;
const ZOOM_STEP = 1.3;
const RISK_ICON = {
  red: '<svg viewBox="0 0 24 24"><path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
  yellow: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const tagChip = (tag, { active = false, onClick = null } = {}) => {
  const chip = el(onClick ? 'button' : 'span', `tag-chip${active ? ' active' : ''}`, strings.tags[tag] ?? tag);
  chip.style.setProperty('--c', TAG_COLOR[tag] ?? '#8c909c');
  if (onClick) {
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(active));
    chip.addEventListener('click', onClick);
  }
  return chip;
};

// Hover card for icon buttons: name + one line of what it is for
function addTip(button, title, info) {
  button.setAttribute('aria-label', title);
  const tip = el('span', 'tip');
  tip.append(el('strong', '', title), el('small', '', info));
  button.appendChild(tip);
}

export function createShellView({ shellViewModel: vm, cameraViewModel: camera, modeModel, repairViewModel, repairHistory, actions }) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const devTree = createDevTree({
    onOpenFolder: (path) => vm.showFolder(path),
    onOpenFile: (path) => vm.showFile(path),
    onRepair: (path, button) => actions.repair(path, button),
    isRepairing: (path) => repairViewModel.isQueued(path),
  });
  let tagFilter = null; // project map filter

  // --- Menus (title bar). Items can be a function so they are rebuilt when the menu opens. ---
  const MENUS = [
    {
      key: 'file',
      items: () => [
        { label: S.actions.openProject, run: () => vm.openProject() },
        { separator: true, label: S.actions.openRecent },
        ...(vm.store.state.recent.length
          ? vm.store.state.recent.map((r) => ({ label: r.name, hint: r.root, run: () => vm.openRecent(r.root) }))
          : [{ label: S.actions.noRecent, disabled: true }]),
      ],
    },
    {
      key: 'view',
      items: () => [
        { label: S.actions.showMap, run: () => vm.setStage('map') },
        { label: P.title, run: () => vm.setStage('project') },
        { label: S.actions.showGraph, run: () => vm.setStage('graph') },
        { separator: true },
        { label: S.actions.centerView, run: () => camera.reset() },
        { label: S.actions.zoomIn, run: () => camera.zoomBy(ZOOM_STEP) },
        { label: S.actions.zoomOut, run: () => camera.zoomBy(1 / ZOOM_STEP) },
        { label: S.actions.backToMap, run: () => { vm.setStage('map'); vm.showFolder(''); } },
        { separator: true },
        { label: `${S.actions.toggleMode} (${modeModel.tech ? strings.mode.vibe : strings.mode.tech})`, run: () => modeModel.toggle() },
      ],
    },
    {
      key: 'agent',
      items: () => [
        { label: S.actions.openChat, run: () => vm.store.state.chatOpen || vm.toggleChat() },
        { label: S.actions.repairWorst, run: () => actions.repairWorst() },
        { label: S.rail.agent, run: () => vm.setSide('agent') },
      ],
    },
    {
      key: 'window',
      items: () => [
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
    const fill = () => list.replaceChildren(...menu.items().map((item) => {
      if (item.separator) return el('div', 'menu-sep', item.label ?? '');
      const entry = el('button', 'menu-item', item.label);
      entry.type = 'button';
      entry.disabled = Boolean(item.disabled);
      entry.setAttribute('role', 'menuitem');
      if (item.hint) entry.title = item.hint;
      entry.addEventListener('click', () => { closeMenus(); item.run(); });
      return entry;
    }));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = openMenu === wrap;
      closeMenus();
      if (!wasOpen) {
        fill();
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

  // --- Vibe / Dev toggle (title bar and explorer header) ---
  function modeToggle(container) {
    container.replaceChildren();
    container.classList.add('mode-toggle');
    container.title = strings.mode.info;
    for (const mode of ['vibe', 'tech']) {
      const b = el('button', '', strings.mode[mode]);
      b.type = 'button';
      b.dataset.mode = mode;
      b.addEventListener('click', () => modeModel.set(mode));
      container.appendChild(b);
    }
  }
  modeToggle($('mode-toggle'));
  const explorerToggle = el('div');
  modeToggle(explorerToggle);
  $('sidebar-actions').appendChild(explorerToggle);

  // --- Rail (icons with a hover card: name + what it is for) ---
  for (const button of document.querySelectorAll('#stage-tabs [data-side]')) {
    const side = button.dataset.side;
    addTip(button, S.rail[side], S.railInfo[side]);
    button.addEventListener('click', () => vm.setSide(side));
  }
  const stageButtons = [...document.querySelectorAll('[data-stage-button]')];
  for (const button of stageButtons) {
    const stage = button.dataset.stageButton;
    addTip(button, S.rail[stage], S.railInfo[stage]);
    button.addEventListener('click', () => {
      if (stage === 'map' && vm.store.state.stage === 'map') vm.showFolder('');
      vm.setStage(stage);
    });
  }
  // Floating button on the map: folds / unfolds the side panel of the selected rail icon
  const panelToggle = $('sidebar-toggle');
  panelToggle.addEventListener('click', () => vm.toggleSidebar());

  // The chat opens from its own floating button (bottom-right), so the bar has no chat icon
  const chatButton = $('rail-chat');
  if (chatButton) {
    addTip(chatButton, S.rail.chat, S.railInfo.chat);
    chatButton.addEventListener('click', () => vm.toggleChat());
  }

  // --- Sidebar ---
  const sidebarTitle = $('sidebar-title');
  const sidebarBody = $('sidebar-body');

  const dot = (level) => {
    const d = el('span', `level-dot ${level}`);
    d.title = LEVEL_LABEL[level];
    return d;
  };

  function counters(red, yellow) {
    const wrap = el('span', 'counters');
    if (red) wrap.appendChild(el('span', 'count red', String(red)));
    if (yellow) wrap.appendChild(el('span', 'count yellow', String(yellow)));
    return wrap;
  }

  // Vibe: a guide with friendly names, one sentence and tags per part
  function renderGuide(state) {
    const parts = [el('p', 'side-intro', S.explorerGuide)];
    for (const g of state.guide.filter((x) => x.depth === 0)) {
      const card = el('button', 'guide-card');
      card.type = 'button';
      const head = el('div', 'guide-head');
      head.append(dot(g.red ? 'red' : g.yellow ? 'yellow' : 'green'), el('strong', '', g.name), counters(g.red, g.yellow));
      const tags = el('div', 'tag-row');
      g.tags.forEach((t) => tags.appendChild(tagChip(t)));
      card.append(head, el('span', 'guide-folder', `${g.folder}/`), el('p', 'guide-summary', g.summary), tags);
      card.addEventListener('click', () => vm.showFolder(g.path));
      parts.push(card);
      const subs = state.guide.filter((x) => x.depth === 1 && x.path.startsWith(`${g.path}/`));
      if (subs.length) {
        const list = el('div', 'guide-subs');
        subs.forEach((sub) => {
          const row = el('button', 'guide-sub');
          row.type = 'button';
          row.title = sub.summary;
          const tag = sub.tags[0];
          const mark = el('i');
          mark.style.background = TAG_COLOR[tag] ?? 'var(--faint)';
          row.append(mark, el('span', '', sub.name), counters(sub.red, sub.yellow));
          row.addEventListener('click', () => vm.showFolder(g.path));
          list.appendChild(row);
        });
        parts.push(list);
      }
    }
    const loose = state.folders.find((f) => f.path === '');
    if (loose) {
      parts.push(el('p', 'side-label', S.allFiles));
      loose.files.slice(0, 30).forEach((f) => parts.push(fileRow(f)));
    }
    return parts;
  }

  function fileRow(file, depth = 0) {
    const row = el('button', 'side-row file');
    row.type = 'button';
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.append(dot(file.level), el('span', 'side-name', file.name));
    if (file.tags?.[0] && modeModel.tech) row.appendChild(tagChip(file.tags[0]));
    row.title = file.path;
    row.addEventListener('click', () => vm.showFile(file.path));
    return row;
  }

  function renderExplorer(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    return modeModel.tech ? devTree.render(state.tree) : renderGuide(state);
  }

  function repairButton(file) {
    const queued = repairViewModel.isQueued(file.path);
    const b = el('button', `pill repair${queued ? ' active' : ''}`, queued ? strings.repair.repairing : strings.repair.repair);
    b.type = 'button';
    b.disabled = queued;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.repair(file.path, b);
    });
    return b;
  }

  function renderRisks(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    if (!state.risks.length) return [el('p', 'side-empty', S.sidebar.noRisks)];
    const red = state.risks.filter((r) => r.level === 'red').length;
    return [
      el('p', 'side-summary', S.sidebar.risksSummary(red, state.risks.length - red)),
      ...state.risks.map((file) => {
        const card = el('div', `risk-card ${file.level}`);
        card.tabIndex = 0;
        const head = el('div', 'risk-head');
        const badge = el('span', `risk-icon ${file.level}`);
        badge.innerHTML = file.level === 'red' ? RISK_ICON.red : RISK_ICON.yellow; // static SVG, no project data
        head.append(badge, el('span', 'risk-level', LEVEL_LABEL[file.level]), repairButton(file));
        const reason = modeModel.tech
          ? strings.security.techReasons[file.reasonKey] ?? file.reason
          : file.reason || strings.security.reasons[file.reasonKey] || '';
        card.append(head, el('strong', 'risk-path', file.path), el('span', 'risk-reason', reason));
        card.addEventListener('click', () => vm.showFile(file.path));
        return card;
      }),
    ];
  }

  // --- Repair history: a task list of what Remi and the agent did ---
  const H = strings.repair.history;
  const expanded = new Set(); // entries opened by the person (the newest unfinished one opens by itself)

  function repairEntry(entry, isNewest) {
    const open = expanded.has(entry.id) || (isNewest && entry.status !== 'verified');
    const card = el('article', `task-card ${entry.status}${open ? ' open' : ''}`);
    const head = el('button', 'task-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    head.append(
      el('span', `task-status ${entry.status}`, H.status[entry.status]),
      el('strong', 'task-path', entry.path),
      el('span', 'task-meta', `${H.by(entry.agent)} · ${H.ago(entry.endedAt ?? entry.startedAt)}`),
    );
    head.addEventListener('click', () => {
      if (open) expanded.delete(entry.id); else expanded.add(entry.id);
      render(vm.store.state);
    });
    card.appendChild(head);
    if (!open) return card;

    const body = el('div', 'task-body');
    if (entry.reason) body.appendChild(el('p', 'task-reason', entry.reason));
    if (entry.changes.length) {
      body.appendChild(el('p', 'side-label', H.changes));
      for (const change of entry.changes) {
        const row = el('div', `task-change${change.undone ? ' undone' : ''}`);
        row.append(el('strong', 'mono', change.path + (change.created ? ` · ${H.created}` : '')), el('span', '', change.reason));
        if (change.backup && !change.undone) {
          const undo = el('button', 'pill', strings.repair.undo);
          undo.type = 'button';
          undo.addEventListener('click', () => repairViewModel.undo(entry.id, change));
          row.appendChild(undo);
        } else if (change.undone) row.appendChild(el('span', 'task-undone', strings.repair.undone));
        body.appendChild(row);
      }
    }
    if (entry.plan.length) {
      body.appendChild(el('p', 'side-label', H.plan));
      const list = el('ol', 'task-plan');
      entry.plan.forEach((step) => list.appendChild(el('li', '', step)));
      body.appendChild(list);
    }
    if (entry.summary) {
      const details = el('details', 'task-summary');
      details.append(el('summary', '', H.explanation), el('p', '', entry.summary));
      body.appendChild(details);
    }
    if (entry.error || entry.interrupted) body.appendChild(el('p', 'task-error', entry.interrupted ? H.interrupted : entry.error));
    const buttons = el('div', 'task-actions');
    const button = (label, run, primary = false) => {
      const b = el('button', `pill${primary ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', (e) => run(e.currentTarget));
      buttons.appendChild(b);
    };
    if (entry.status === 'fixed' || entry.status === 'planned') button(H.verify, () => repairViewModel.markFixed(entry.id), true);
    if (entry.status === 'failed') button(H.retry, (b) => actions.repair(entry.path, b), true);
    button(H.open, () => vm.showFile(entry.path));
    body.appendChild(buttons);
    card.appendChild(body);
    return card;
  }

  function renderRepairs() {
    const { entries } = repairHistory.store.state;
    if (!entries.length) return [el('p', 'side-intro', H.intro), el('p', 'side-empty', H.empty)];
    const parts = [el('p', 'side-intro', H.intro)];
    if (entries.some((e) => e.status !== 'working' && e.status !== 'queued')) {
      const clear = el('button', 'link', H.clear);
      clear.type = 'button';
      clear.addEventListener('click', () => repairHistory.clearFinished());
      parts.push(clear);
    }
    entries.forEach((entry, i) => parts.push(repairEntry(entry, i === 0)));
    return parts;
  }

  // --- Stage tabs (map / project / graph) with icon, badge and hover card ---
  const tabs = [...document.querySelectorAll('#stage-tabs [data-stage]')];
  for (const tab of tabs) tab.addEventListener('click', () => vm.setStage(tab.dataset.stage));

  function renderTabs(state) {
    const cracked = state.guide.filter((g) => g.depth === 0 && g.red).length;
    const info = {
      map: [S.rail.map, S.tabInfo.map(state.guide.filter((g) => g.depth === 0).length, cracked), cracked],
      project: [P.title, P.summary(state.guide.length, state.counts.red + state.counts.yellow + state.counts.green), 0],
      graph: [S.rail.graph, S.tabInfo.graph(state.counts.red), state.counts.red],
      git: [S.rail.git, S.railInfo.git, 0],
    };
    for (const tab of tabs) {
      const [title, text, badge] = info[tab.dataset.stage];
      const active = tab.dataset.stage === state.stage;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      const em = tab.querySelector('.tab-badge');
      em.textContent = state.open && badge ? String(badge) : '';
      em.hidden = !(state.open && badge);
      tab.querySelector('.tip').replaceChildren(el('strong', '', title), el('small', '', state.open ? text : S.status.noProject));
    }
  }

  // --- Project map (stage): every part of the code with tags, like in Obra ---
  const projectPanel = $('project-panel');
  function renderProject(state) {
    if (!state.open) return projectPanel.replaceChildren(el('p', 'side-empty', P.empty));
    const files = state.counts.red + state.counts.yellow + state.counts.green + state.counts.grey;
    const head = el('header', 'project-head');
    head.append(el('h2', '', P.title), el('p', '', P.summary(state.guide.length, files)));
    const used = TAGS.filter((t) => state.guide.some((g) => g.tags.includes(t)));
    const filters = el('div', 'tag-row filters');
    filters.appendChild(el('span', 'filter-label', P.filter));
    used.forEach((t) => filters.appendChild(tagChip(t, { active: tagFilter === t, onClick: () => { tagFilter = tagFilter === t ? null : t; renderProject(vm.store.state); } })));
    if (tagFilter) {
      const clear = el('button', 'link', P.clear);
      clear.type = 'button';
      clear.addEventListener('click', () => { tagFilter = null; renderProject(vm.store.state); });
      filters.appendChild(clear);
    }
    const visible = state.guide.filter((g) => !tagFilter || g.tags.includes(tagFilter));
    const maxFiles = Math.max(1, ...state.guide.map((g) => g.files));
    const grid = el('div', 'project-grid');
    visible.forEach((g, i) => {
      const card = el('article', `project-card${g.red ? ' cracked' : ''}`);
      card.style.setProperty('--i', String(Math.min(i, 20)));
      const top = el('div', 'project-card-top');
      const titles = el('div');
      const parent = g.depth ? g.path.split('/')[0] : '';
      titles.append(
        el('h3', '', modeModel.tech ? `${g.path}/` : g.name),
        el('p', 'mono', modeModel.tech ? g.name : `${g.path}/`),
      );
      top.append(titles, counters(g.red, g.yellow));
      const tags = el('div', 'tag-row');
      g.tags.forEach((t) => tags.appendChild(tagChip(t)));
      const bar = el('div', 'size-bar');
      const fill = el('i');
      fill.style.width = `${(g.files / maxFiles) * 100}%`;
      fill.style.background = TAG_COLOR[g.tags[0]] ?? 'var(--accent)';
      bar.appendChild(fill);
      const foot = el('div', 'project-card-foot');
      const go = el('button', 'pill', P.showOnMap);
      go.type = 'button';
      go.addEventListener('click', () => vm.showFolder(parent || g.path));
      foot.append(el('span', 'mono', `${strings.map.files(g.files)}${g.size ? ` · ${strings.hover.size(g.size)}` : ''}`), go);
      card.append(top, el('p', 'project-summary', g.summary), tags, bar, foot);
      grid.appendChild(card);
    });
    if (!visible.length) grid.appendChild(el('p', 'side-empty', P.none));
    projectPanel.replaceChildren(head, filters, grid);
  }

  // --- Empty state: recent projects ---
  const emptyRecent = $('empty-recent');
  function renderRecent(state) {
    if (!state.recent.length) return emptyRecent.replaceChildren();
    emptyRecent.replaceChildren(el('p', 'side-label', S.recent), ...state.recent.slice(0, 5).map((r) => {
      const b = el('button', 'recent-row');
      b.type = 'button';
      b.title = r.root;
      b.append(el('strong', '', r.name), el('span', '', r.root.replace(/^\/Users\/[^/]+/, '~')));
      b.addEventListener('click', () => vm.openRecent(r.root));
      return b;
    }));
  }

  // --- Status bar ---
  const status = $('statusbar');

  function render(state) {
    body.classList.toggle('sidebar-closed', !state.sidebarOpen);
    const toggleText = state.sidebarOpen ? S.panelToggle.hide : S.panelToggle.show;
    panelToggle.setAttribute('aria-label', toggleText);
    panelToggle.setAttribute('aria-expanded', String(state.sidebarOpen));
    panelToggle.classList.toggle('active', state.sidebarOpen);
    panelToggle.querySelector('.tip').replaceChildren(el('strong', '', toggleText), el('small', '', S.panelToggle.info));
    body.classList.toggle('chat-closed', !state.chatOpen);
    body.classList.toggle('mode-tech', modeModel.tech);
    for (const button of document.querySelectorAll('#stage-tabs [data-side]')) {
      button.classList.toggle('active', state.sidebarOpen && button.dataset.side === state.side);
    }
    chatButton?.classList.toggle('active', state.chatOpen);
    for (const button of stageButtons) button.classList.toggle('active', button.dataset.stageButton === state.stage);
    for (const b of document.querySelectorAll('.mode-toggle button')) b.classList.toggle('active', b.dataset.mode === modeModel.store.state.mode);
    body.classList.toggle('stage-graph', state.stage === 'graph');
    body.classList.toggle('stage-project', state.stage === 'project');
    body.classList.toggle('stage-git', state.stage === 'git');
    $('graph-panel').hidden = state.stage !== 'graph';
    projectPanel.hidden = state.stage !== 'project';
    renderTabs(state);
    if (state.stage === 'project') renderProject(state);
    renderRecent(state);

    sidebarTitle.textContent = S.sidebar[state.side];
    explorerToggle.hidden = state.side !== 'explorer';
    const agentView = state.side === 'agent';
    sidebarBody.hidden = agentView;
    $('agent-connect').hidden = !agentView;
    if (!agentView) {
      const scroll = sidebarBody.scrollTop;
      const views = { risks: renderRisks, repairs: renderRepairs, explorer: renderExplorer };
      const nodes = (views[state.side] ?? renderExplorer)(state);
      // The Dev tree keeps its own root: re-inserting it would drop the focus of its search box
      const same = nodes.length === sidebarBody.childNodes.length && nodes.every((n, i) => n === sidebarBody.childNodes[i]);
      if (!same) sidebarBody.replaceChildren(...nodes);
      sidebarBody.scrollTop = scroll;
    }

    // Repairs waiting for the person (to verify) show a badge on the rail
    const pending = repairHistory.store.state.entries.filter((e) => e.status === 'fixed' || e.status === 'planned').length;
    const badge = $('rail-repairs-badge');
    badge.hidden = !pending;
    badge.textContent = String(pending);

    const { red, yellow, green } = state.counts;
    $('project-chip').hidden = !state.open;
    $('project-chip-name').textContent = state.projectName || strings.map.defaultProjectName;
    $('project-chip').classList.toggle('danger', red > 0);
    const job = repairViewModel.store.state.job;
    status.replaceChildren(
      el('span', 'status-strong', state.open ? state.projectName || strings.map.defaultProjectName : S.status.noProject),
      ...(state.open ? [el('span', 'status-counts', S.status.counts(red, yellow, green))] : []),
      ...(job ? [el('span', 'status-remi', `${strings.repair.name}: ${(job.source === 'agent' ? strings.repair.stepsAgent(job.agentLabel) : strings.repair.steps)[job.step]}`)] : []),
      el('span', 'status-mode', `${strings.mode.title}: ${strings.mode[modeModel.store.state.mode]}`),
      el('span', 'status-agent', S.status.agent),
    );
  }

  // The sidebar animates its content only when the view changes (not on every score update)
  vm.store.subscribe((state, previous) => {
    render(state);
    if (!previous || previous.side !== state.side) {
      for (const node of [sidebarBody, sidebarTitle, $('agent-connect')]) {
        node.classList.remove('enter');
        void node.offsetWidth; // restart the CSS animation
        node.classList.add('enter');
      }
    }
  }, { immediate: true });
  modeModel.store.subscribe(() => render(vm.store.state));
  repairViewModel.store.subscribe(() => render(vm.store.state));
  repairHistory.store.subscribe(() => render(vm.store.state));
}
