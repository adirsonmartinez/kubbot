// Building live: while an agent (chat or repair) saves files, the robot carries each one as a sheet of
// paper to its folder and drops it in, so the person sees the project being built. The source is the
// chat's run cards (their write_file steps); EVENTS.agentChanged / repairChanged say whether a file is
// new. A folder the map does not draw (the map only shows problems) appears as a temporary "site"
// while the work lasts (views/scene/buildSiteView.js); the robot is driven through `guide`
// (views/scene/robotView.js), like the tour. One file at a time, in the order the agent wrote them.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { clamp } from '../core/format.js';
import { strings } from '../i18n/es.js';
import { findNode } from '../models/fileTree.js';
import { placesFor } from './tourPlaces.js';

export const TIMING = { walkPerUnitMs: 80, walkMinMs: 500, walkMaxMs: 1500, dropMs: 700, editMs: 600, failMs: 900, lingerMs: 6000 };
const HOME = { x: 1.1, z: 1.1 };
const B = strings.build;
const nameOf = (path) => path.split('/').filter(Boolean).pop() ?? path;
const folderOf = (path) => (path.includes('/') ? path.split('/')[0] : '');

export class BuildViewModel {
  #chat;
  #map;
  #project;
  #tour;
  #timing;
  #jobs = new Map();     // key -> { key, path, folder, status, created, done }
  #queue = [];           // keys waiting, in order
  #current = null;       // the job being carried
  #arrived = false;
  #timer = null;         // arrival, drop or linger
  #created = new Map();  // path -> true/false from the agent's change events
  #sites = new Map();    // folder -> { folder, papers, edits }

  // active: there is work (or it just ended); sites: [{ folder, label, kind, x, z, papers, edits, current }]
  // guide: what the robot does { from, to, center, walkMs, stepId, title, text, pose, carrying } or null
  // drop: the last sheet going into a folder { key, folder, from, x, z } (the view animates it)
  store = new Observable({ active: false, sites: [], guide: null, drop: null });

  constructor({ chatViewModel, mapViewModel, projectModel, tourViewModel = null, bus, timing = {} }) {
    this.#chat = chatViewModel;
    this.#map = mapViewModel;
    this.#project = projectModel;
    this.#tour = tourViewModel;
    this.#timing = { ...TIMING, ...timing };
    bus.on(EVENTS.agentChanged, (c) => { if (typeof c?.diff?.created === 'boolean') this.#created.set(c.path, c.diff.created); });
    bus.on(EVENTS.repairChanged, ({ change }) => { if (typeof change?.diff?.created === 'boolean') this.#created.set(change.path, change.diff.created); });
    chatViewModel.store.subscribe((state) => this.#watch(state));
    mapViewModel.store.subscribe(() => { if (this.store.state.active) this.#publish(); }); // folders may move
    let session = projectModel.store.state.session;
    projectModel.store.subscribe(({ session: now }) => { if (now !== session) { session = now; this.#reset(); } });
  }

  // New write steps join the line; known ones update their status; the person's approval is waited for
  #watch(state) {
    const touring = (this.#tour?.store.state.status ?? 'idle') !== 'idle';
    for (const m of state.messages) {
      const run = m.run;
      if (!run) continue;
      for (const s of run.steps ?? []) {
        if (s.name !== 'write_file' || !s.target) continue;
        const key = `${m.id}:${s.id}`;
        const job = this.#jobs.get(key);
        if (job) { job.status = s.status; continue; }
        if (run.status !== 'running' || touring) continue; // old cards are history, not work
        const exists = Boolean(findNode(this.#project.store.state.tree ?? [], s.target));
        this.#jobs.set(key, { key, path: s.target, folder: folderOf(s.target), status: s.status, created: !exists, run: m.id });
        this.#queue.push(key);
        if (!this.#sites.has(folderOf(s.target))) this.#sites.set(folderOf(s.target), { folder: folderOf(s.target), papers: 0, edits: 0 });
      }
    }
    if (!this.#current && this.#queue.length) return this.#next();
    const job = this.#current && this.#jobs.get(this.#current);
    if (!job) return;
    const run = state.messages.find((m) => m.id === job.run)?.run;
    const waiting = run?.awaiting === job.path && job.status === 'running';
    const { guide } = this.store.state;
    if (guide?.carrying) {
      const text = waiting ? B.waiting(nameOf(job.path)) : B.saving(nameOf(job.path));
      if (text !== guide.text) this.store.set({ guide: { ...guide, text, pose: waiting ? 'wait' : 'carry' } });
    }
    this.#check();
  }

  #next() {
    clearTimeout(this.#timer);
    this.#current = null;
    const key = this.#queue.shift();
    if (!key) {
      // nothing left: it says what it built and waves; the sites stay a moment, then it is free again
      const { guide } = this.store.state;
      if (guide) {
        const totals = [...this.#sites.values()].reduce((t, s) => ({ papers: t.papers + s.papers, edits: t.edits + s.edits }), { papers: 0, edits: 0 });
        this.store.set({ guide: { ...guide, stepId: `${guide.stepId.split(':').slice(0, -1).join(':')}:done`, pose: 'wave', carrying: false, title: B.finished, text: B.done(totals.papers, totals.edits) } });
      }
      this.#timer = setTimeout(() => this.#reset(), this.#timing.lingerMs);
      return;
    }
    const job = this.#jobs.get(key);
    this.#current = key;
    this.#arrived = false;
    const place = this.#places().get(job.folder);
    const from = this.store.state.guide?.to ?? HOME;
    const t = this.#timing;
    const walkMs = Math.round(clamp(Math.hypot(place.stand.x - from.x, place.stand.z - from.z) * t.walkPerUnitMs, t.walkMinMs, t.walkMaxMs));
    this.store.set({
      active: true,
      guide: { from, to: place.stand, center: { x: place.x, z: place.z }, walkMs, stepId: `${key}:carry`, title: B.title, text: B.saving(nameOf(job.path)), pose: 'carry', carrying: true },
    });
    this.#publish();
    this.#timer = setTimeout(() => { this.#arrived = true; this.#check(); }, walkMs);
  }

  // The file was saved (or not) and the robot is there: drop the sheet, point at the change, or say so
  #check() {
    const job = this.#current && this.#jobs.get(this.#current);
    if (!job || !this.#arrived || job.status === 'running' || job.done) return;
    job.done = true;
    const { guide } = this.store.state;
    const name = nameOf(job.path);
    const site = this.#sites.get(job.folder);
    const t = this.#timing;
    if (job.status !== 'done') {
      this.store.set({ guide: { ...guide, stepId: `${job.key}:fail`, pose: 'idle', carrying: false, text: B.notSaved(name) } });
      this.#timer = setTimeout(() => this.#next(), t.failMs);
      return;
    }
    const created = this.#created.get(job.path) ?? job.created;
    if (created) {
      this.store.set({
        guide: { ...guide, stepId: `${job.key}:drop`, pose: 'drop', carrying: false, text: B.saved(name) },
        drop: { key: job.key, folder: job.folder, from: guide.to, x: guide.center.x, z: guide.center.z },
      });
      this.#timer = setTimeout(() => { site.papers++; this.#publish(); this.#next(); }, t.dropMs);
    } else {
      this.store.set({ guide: { ...guide, stepId: `${job.key}:edit`, pose: 'point', carrying: false, text: B.edited(name) } });
      this.#timer = setTimeout(() => { site.edits++; this.#publish(); this.#next(); }, t.editMs);
    }
  }

  // Where each site is: the folder's building, the plaza for root files, or a temporary place
  #places() {
    const steps = [...this.#sites.keys()].map((folder) => ({ id: folder, kind: folder ? 'folder' : 'place', target: folder }));
    return placesFor(steps, this.#map.store.state, { usesSupabase: Boolean(this.#project.store.state.usesSupabase) });
  }

  #publish() {
    const places = this.#places();
    const current = this.#current && this.#jobs.get(this.#current)?.folder;
    const sites = [...this.#sites.values()].map((s) => {
      const p = places.get(s.folder);
      return { ...s, label: s.folder ? `${s.folder}/` : this.#map.store.state.plaza?.name ?? '', kind: p.kind, x: p.x, z: p.z, current: s.folder === current };
    });
    this.store.set({ sites });
  }

  #reset() {
    clearTimeout(this.#timer);
    this.#queue = [];
    this.#current = null;
    this.#sites.clear();
    for (const job of this.#jobs.values()) job.done = true; // what was seen stays seen
    this.store.set({ active: false, sites: [], guide: null, drop: null });
  }
}
