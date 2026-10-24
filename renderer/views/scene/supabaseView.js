// Draws the Supabase node, its status label and the schema cards from SupabaseViewModel.
import { buildSupabaseNode } from './builders/supabaseBuilder.js';
import { buildSchema } from './builders/schemaBuilder.js';
import { strings } from '../../i18n/es.js';

export function createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel }) {
  const node = buildSupabaseNode();
  node.group.userData.pick = { type: 'supabase' };
  node.group.visible = false;
  sceneView.scene.add(node.group);

  const schema = buildSchema(sceneView.renderer, supabaseModel.tables, node.trunkStart);
  sceneView.scene.add(schema.group);

  const label = labels.add({
    html: '<span class="dot"></span><span class="txt"></span> <b></b>',
    anchor: node.labelAnchor,
    className: 'sb-label',
    hidden: true,
  });
  const labelText = label.el.querySelector('.txt');
  const labelStatus = label.el.querySelector('b');

  supabaseViewModel.store.subscribe((state, previous) => {
    node.group.visible = state.visible;
    label.el.hidden = !state.visible;
    label.el.classList.toggle('vuln', state.vulnerable);
    labelText.textContent = state.vulnerable ? strings.supabase.vulnerable : strings.supabase.connected;
    labelStatus.textContent = state.vulnerable ? strings.supabase.critical : strings.supabase.latency(state.latencyMs);
    if (!previous || state.vulnerable !== previous.vulnerable) node.setVulnerable(state.vulnerable);
    if (!previous || state.tables !== previous.tables) schema.setTables(state.tables);
    if (!previous || state.schemaOpen !== previous.schemaOpen) schema.setOpen(state.schemaOpen);
  }, { immediate: true });

  sceneView.onFrame((t, dt) => {
    node.update(t);
    schema.update(t, dt);
  });

  return {
    pickTargets: () => {
      const targets = [node.group];
      if (supabaseViewModel.store.state.schemaOpen) targets.push(schema.group);
      return targets;
    },
  };
}
