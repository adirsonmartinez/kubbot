// Panels over the map: empty state, open building summary and Supabase schema summary.
import { strings } from '../../i18n/es.js';
import { LEVEL_STYLE } from '../theme.js';

export function createPanelsView({ mapViewModel, towerViewModel, supabaseViewModel }) {
  const $ = (id) => document.getElementById(id);

  // Empty state: no project open
  $('open-project').addEventListener('click', () => mapViewModel.openProject());
  mapViewModel.store.subscribe((state) => { $('empty-state').hidden = state.status === 'ready'; }, { immediate: true });

  // Open building
  $('folder-close').addEventListener('click', () => mapViewModel.closeFolder());
  towerViewModel.store.subscribe((state) => {
    $('folder-panel').hidden = state.path === null;
    if (state.path === null) return;
    $('folder-title').textContent = state.name;
    $('folder-summary').textContent = strings.panels.folderSummary(state.total, state.floors.length, state.hiddenFloors);
    $('folder-legend').innerHTML = ['red', 'yellow', 'green']
      .map((l) => `<span title="${strings.security.levels[l]}"><i class="lvl" style="background:${LEVEL_STYLE[l].color}"></i>${state.counts[l]}</span>`)
      .join('');
  });

  // Supabase schema
  $('schema-close').addEventListener('click', () => supabaseViewModel.openSchema(false));
  supabaseViewModel.store.subscribe((state) => {
    $('schema-panel').hidden = !state.schemaOpen;
    const summary = $('schema-summary');
    const hasError = state.tables.some((t) => t.exposed);
    summary.textContent = strings.panels.schemaSummary(state.tables.length, hasError);
    summary.classList.toggle('bad', hasError);
  }, { immediate: true });
}
