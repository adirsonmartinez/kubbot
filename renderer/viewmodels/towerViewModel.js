// The open building: a folder shown floor by floor. Ground floor = its direct files,
// one floor per subfolder. Each file carries its traffic-light level.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { clamp } from '../core/format.js';
import { strings } from '../i18n/es.js';
import { allFiles, collectFloors } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';
import { TOWER, towerHeight } from './layout.js';

const CLOSED = { path: null, floors: [], focus: null };

export class TowerViewModel {
  #security;
  #camera;
  #bus;
  #returnView = null; // where the camera goes back when the building closes

  // `version` changes when the building content changes (views rebuild); `focus` alone does not.
  store = new Observable({ ...CLOSED, name: '', x: 0, z: 0, counts: { green: 0, yellow: 0, red: 0 }, total: 0, hiddenFloors: 0, height: 0, instant: false, version: 0 });

  constructor({ securityModel, camera, bus }) {
    this.#security = securityModel;
    this.#camera = camera;
    this.#bus = bus;
  }

  get isOpen() {
    return this.store.state.path !== null;
  }

  // instant: rebuild in place (after a disk change) without animating, moving the camera or talking
  open({ node, x, z, name, instant = false }) {
    const all = collectFloors(node, name.replace(/\/$/, ''));
    const floors = all.slice(0, TOWER.maxFloors).map((floor) => this.#describeFloor(floor));
    const counts = { green: 0, yellow: 0, red: 0 };
    floors.forEach((f) => f.files.forEach((file) => { if (file.level in counts) counts[file.level]++; }));
    const total = allFiles(node.children ?? []).length;
    const height = towerHeight(floors.length);
    const keepFocus = instant && this.store.state.path === node.path ? this.store.state.focus : null;

    this.store.set({
      path: node.path, name, x, z, floors, counts, total, height,
      hiddenFloors: all.length - floors.length,
      focus: keepFocus !== null && keepFocus < floors.length ? keepFocus : null,
      instant,
      version: this.store.state.version + 1,
    });

    if (instant) return;
    if (!this.#returnView) this.#returnView = this.#camera.saveView();
    this.#camera.flyTo(this.#camera.groundBehind(x, height / 2, z), clamp(30 / (height + 10), 0.6, 2));
    this.#bus.emit(EVENTS.folderOpened, { name, files: total, floors: floors.length, counts });
  }

  close({ restoreCamera = true } = {}) {
    if (!this.isOpen) return;
    this.store.set({ ...CLOSED, instant: false, version: this.store.state.version + 1 });
    if (restoreCamera && this.#returnView) this.#camera.restoreView(this.#returnView);
    this.#returnView = null;
  }

  // Clicking a floor pulls it toward the camera; clicking it again puts it back
  focusFloor(index) {
    if (!this.isOpen) return;
    this.store.set({ focus: this.store.state.focus === index ? null : index });
  }

  selectFile(path) {
    const file = this.store.state.floors.flatMap((f) => f.files).find((f) => f.path === path);
    if (!file) return;
    const { level, reason, reasonKey, by } = file;
    this.#bus.emit(EVENTS.fileSelected, { path, level, reason, reasonKey, by });
  }

  // Files sorted riskiest first (they are drawn at the front of each floor)
  #describeFloor(floor) {
    const files = floor.files
      .map((f) => {
        const score = this.#security.scoreOf(f.path);
        const reason = score.reason || strings.security.reasons[score.reasonKey] || '';
        return { path: f.path, size: f.size ?? 0, level: score.level, reason, reasonKey: score.reasonKey, by: score.by };
      })
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path));
    return { path: floor.path, label: floor.label, files, worst: worstLevel(files.map((f) => f.level)) };
  }
}
