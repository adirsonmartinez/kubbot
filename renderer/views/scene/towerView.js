// Draws the open building from TowerViewModel and animates it: floors rise one after another,
// the focused floor slides toward the camera, and on close it collapses before disappearing.
import * as THREE from 'three';
import { buildTower } from './builders/towerBuilder.js';
import { LEVEL_STYLE } from '../theme.js';
import { TOWER } from '../../viewmodels/layout.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const easeOut = (k) => 1 - (1 - k) ** 3;
const FOCUS_SLIDE = 3;

export function createTowerView({ sceneView, labels, towerViewModel, cameraViewModel, mapView }) {
  let current = null; // { path, built, labels, openT, closing, focus }

  function dispose() {
    if (!current) return;
    sceneView.scene.remove(current.built.group);
    current.labels.forEach((l) => l.remove());
    mapView.setBuildingHidden(current.path, false);
    current = null;
  }

  function build(state) {
    dispose();
    const built = buildTower(state);
    sceneView.scene.add(built.group);
    mapView.setBuildingHidden(state.path, true);
    const floorLabels = state.floors.map((floor) => labels.add({
      html: `<i class="lvl" style="background:${LEVEL_STYLE[floor.worst].color}"></i><strong>${escapeHtml(floor.label)}</strong><span>${floor.files.length ? strings.map.files(floor.files.length) : strings.map.emptyFolder}</span>`,
      className: 'floor',
      align: 'left',
      hidden: true,
    }));
    current = {
      path: state.path,
      built,
      labels: floorLabels,
      openT: state.instant ? 2 : 0,
      closing: false,
      focus: state.focus,
      slides: built.floors.map(() => 0),
    };
  }

  towerViewModel.store.subscribe((state, previous) => {
    if (state.version !== previous.version) {
      if (state.path === null) {
        if (current) { current.closing = true; current.focus = null; }
      } else {
        build(state);
      }
    }
    if (current && !current.closing) current.focus = state.focus;
  });

  sceneView.onFrame((_t, dt) => {
    if (!current) return;
    const c = current;
    c.openT = c.closing ? c.openT - dt * 2 : Math.min(c.openT + dt, 2);
    const az = cameraViewModel.azimuth;
    const toCamera = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const origin = c.built.group.position;
    let previousY = TOWER.base;

    c.built.floors.forEach((floor, i) => {
      const k = easeOut(THREE.MathUtils.clamp((c.openT - i * 0.07) * 2.5, 0, 1));
      const y = TOWER.base + (floor.targetY - TOWER.base) * k;
      c.slides[i] += ((c.focus === i ? FOCUS_SLIDE : 0) - c.slides[i]) * Math.min(dt * 8, 1);
      const slide = c.slides[i];
      floor.group.position.set(toCamera.x * slide, y, toCamera.z * slide);

      // Columns fill the gap down to the slab below
      const gap = Math.max(y - previousY - 0.2, 0.001);
      floor.posts.forEach((p) => { p.scale.y = gap; p.position.y = -gap / 2; p.visible = slide < 0.3; });
      previousY = y;

      // Label at the floor's left corner
      const label = c.labels[i];
      label.setAnchor(origin.x + floor.group.position.x - c.built.width / 2, y + 0.3, origin.z + floor.group.position.z + c.built.depth / 2);
      label.el.hidden = c.closing || k < 0.95;
      label.el.classList.toggle('focus', c.focus === i);
    });

    if (c.closing && c.openT <= 0) dispose();
  });

  return {
    pickTargets: () => (current && !current.closing ? [current.built.group] : []),
  };
}
