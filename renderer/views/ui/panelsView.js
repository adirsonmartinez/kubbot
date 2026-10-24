// Panels over the scene: empty state, open building, Supabase schema (map view) and git summary (git view).
import { strings } from '../../i18n/es.js';
import { LEVEL_STYLE } from '../theme.js';

export function createPanelsView({ appViewModel, mapViewModel, towerViewModel, supabaseViewModel, gitViewModel }) {
  const $ = (id) => document.getElementById(id);
  const onMap = () => appViewModel.view === 'map';

  // Empty state: no project open (shown in both views)
  $('open-project').addEventListener('click', () => mapViewModel.openProject());
  const renderEmpty = () => { $('empty-state').hidden = mapViewModel.store.state.status === 'ready'; };

  // Open building
  $('folder-close').addEventListener('click', () => mapViewModel.closeFolder());
  const renderFolder = () => {
    const state = towerViewModel.store.state;
    $('folder-panel').hidden = state.path === null || !onMap();
    if (state.path === null) return;
    $('folder-title').textContent = state.name;
    $('folder-summary').textContent = strings.panels.folderSummary(state.total, state.floors.length, state.hiddenFloors);
    $('folder-legend').innerHTML = ['red', 'yellow', 'green']
      .map((l) => `<span title="${strings.security.levels[l]}"><i class="lvl" style="background:${LEVEL_STYLE[l].color}"></i>${state.counts[l]}</span>`)
      .join('');
  };

  // Supabase schema
  $('schema-close').addEventListener('click', () => supabaseViewModel.openSchema(false));
  const renderSchema = () => {
    const state = supabaseViewModel.store.state;
    $('schema-panel').hidden = !state.schemaOpen || !onMap();
    const summary = $('schema-summary');
    const hasError = state.tables.some((t) => t.exposed);
    summary.textContent = strings.panels.schemaSummary(state.tables.length, hasError);
    summary.classList.toggle('bad', hasError);
  };

  // Git summary
  const renderGit = () => {
    const state = gitViewModel.store.state;
    const projectOpen = mapViewModel.store.state.status === 'ready';
    $('git-panel').hidden = onMap() || !projectOpen;
    const t = strings.git;
    let title = t.loading, summary = '', risky = '';
    if (state.status === 'ready') {
      title = t.title(state.summary.branch);
      summary = t.summary(state.summary);
      risky = state.summary.risky ? t.risky(state.summary.risky) : '';
    } else if (state.status === 'not-repo') {
      title = t.notRepo;
      summary = state.error === 'git-missing' ? t.gitMissing : t.notRepoHint;
    } else if (state.status === 'error') {
      title = t.error;
    }
    $('git-title').textContent = title;
    $('git-summary').textContent = summary;
    $('git-risky').textContent = risky;
    $('git-risky').hidden = !risky;
  };

  const renderAll = () => { renderEmpty(); renderFolder(); renderSchema(); renderGit(); };
  appViewModel.store.subscribe(renderAll);
  mapViewModel.store.subscribe(() => { renderEmpty(); renderGit(); });
  towerViewModel.store.subscribe(renderFolder);
  supabaseViewModel.store.subscribe(renderSchema);
  gitViewModel.store.subscribe(renderGit);
  renderAll();
}
