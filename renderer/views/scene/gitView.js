// Draws GitViewModel on the 'git' layer: tracks, commits, branch and tag labels, HEAD train.
// Commits rise from the track one after another when the graph is (re)built.
import { buildGitGraph, laneColorCss } from './builders/gitBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { GIT_LAYOUT } from '../../viewmodels/layout.js';

const RISE_SPEED = 3;
const RISE_STAGGER = 0.025;

export function createGitView({ sceneView, labels, gitViewModel }) {
  let graph = null;
  let ownLabels = [];
  let riseT = 0;

  function clear() {
    if (graph) sceneView.layers.git.remove(graph.group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    graph = null;
  }

  const addLabel = (options) => ownLabels.push(labels.add({ ...options, layer: 'git' }));

  function render(state) {
    clear();
    if (state.status !== 'ready' || !state.commits.length) return;
    graph = buildGitGraph(state);
    sceneView.layers.git.add(graph.group);
    graph.setFocus(state.focusLane);
    riseT = 0;
    graph.blocks.forEach(({ mesh }) => { mesh.scale.y = 0.001; });

    // Lane names at the oldest end of each track. Short live lanes skip it: their tip label already names them.
    state.lanes.forEach((lane) => {
      if (lane.live && lane.toX - lane.fromX < GIT_LAYOUT.step * 6) return;
      const name = strings.git.laneNames[lane.name] ?? lane.name;
      const suffix = lane.live ? '' : ` <span>${strings.git.deleted}</span>`;
      addLabel({
        html: `<i class="lvl" style="background:${laneColorCss(lane.kind)}"></i><strong>${escapeHtml(name)}</strong>${suffix}`,
        anchor: { x: lane.fromX - 1.2, y: 0.3, z: lane.z },
        className: 'floor lane',
        align: 'left',
      });
    });

    // Live branches at their tip commit; HEAD's branch is highlighted
    state.tips.forEach((tip) => {
      const html = tip.branches.map((b) => {
        const head = b.isHead ? `<b>${strings.git.head}</b> ` : '';
        return `<span class="branch${b.isHead ? ' head' : ''}"><i class="lvl" style="background:${laneColorCss(b.kind)}"></i>${head}${escapeHtml(b.name)}</span>`;
      }).join('');
      addLabel({ html, anchor: { x: tip.x, y: 2.6, z: tip.z }, className: 'branches' });
    });

    state.tags.forEach((tag) => {
      addLabel({ html: `<strong>${escapeHtml(tag.name)}</strong>`, anchor: { x: tag.x - 0.05, y: 4.2, z: tag.z - 0.6 }, className: 'tag' });
    });
  }

  gitViewModel.store.subscribe((state, previous) => {
    if (!previous || state.version !== previous.version) render(state);
    else if (graph && state.focusLane !== previous.focusLane) graph.setFocus(state.focusLane);
  }, { immediate: true });

  sceneView.onFrame((t, dt) => {
    if (!graph) return;
    riseT += dt * RISE_SPEED;
    graph.blocks.forEach(({ mesh, index, height, baseY }) => {
      const k = Math.min(Math.max(riseT - index * RISE_STAGGER, 0), 1);
      mesh.scale.y = Math.max(height * (1 - (1 - k) ** 3), 0.001);
      mesh.position.y = baseY + mesh.scale.y / 2; // grow from the track, not from the middle
    });
    graph.warnings.forEach((w) => { w.rotation.y = t * 2; w.position.y = w.userData.baseY + Math.sin(t * 3) * 0.2; });
    if (graph.train) graph.train.position.y = 0.24 + Math.abs(Math.sin(t * 6)) * 0.04;
  });

  return {
    pickTargets: () => (graph ? [graph.group] : []),
  };
}
