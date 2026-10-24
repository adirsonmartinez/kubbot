// Remi, the repairer: walks to a cracked building, looks at the file, writes a plan (with the user's
// own agent when one is connected, otherwise from the Platanus guide) and shores the crack up.
// Honest by design: Remi never edits files. The file turns yellow ("plan ready") until the person
// says they applied it, then green.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { LEVEL_RANK } from '../models/securityModel.js';

const R = strings.repair;
export const STEPS = R.steps.length; // walk, look, plan, shore up, done
const WALK_SPEED = 9; // map units per second
const LOOK_MS = 1300;
const PLAN_MIN_MS = 1500;
const SHORE_MS = 2300;
const AGENT_TIMEOUT_MS = 90_000;
const HQ_DOOR = { x: -1, z: 2.6 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// "- step" / "1. step" lines from an agent answer -> at most 4 steps
function parseSteps(text) {
  return text.split('\n')
    .map((l) => l.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1])
    .filter(Boolean)
    .map((s) => s.replace(/\*\*/g, ''))
    .slice(0, 4);
}

export class RepairViewModel {
  #security;
  #map;
  #camera;
  #tower;
  #connection;
  #bus;
  #runId = 0;

  // job: { path, reason, reasonKey, folder, from, to, height, step, stepMs, plan, source, agentLabel }
  store = new Observable({ job: null, queue: [] });

  constructor({ securityModel, mapViewModel, cameraViewModel, towerViewModel, connection, bus }) {
    this.#security = securityModel;
    this.#map = mapViewModel;
    this.#camera = cameraViewModel;
    this.#tower = towerViewModel;
    this.#connection = connection;
    this.#bus = bus;
  }

  get busy() {
    const { job } = this.store.state;
    return Boolean(job && job.step < STEPS - 1);
  }

  isQueued(path) {
    const { job, queue } = this.store.state;
    return (job?.path === path && this.busy) || queue.includes(path);
  }

  // Repairs a file; if Remi is busy it waits in line
  start(path) {
    if (!path || this.isQueued(path)) return;
    if (this.busy) {
      this.store.set({ queue: [...this.store.state.queue, path] });
      return;
    }
    this.#run(path);
  }

  // The riskiest file that is not fixed or planned yet
  startWorst(files) {
    const worst = [...files]
      .filter((f) => f.level === 'red' || (f.level === 'yellow' && f.by !== 'remi'))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
    if (!worst) return false;
    this.start(worst.path);
    return true;
  }

  // The person applied the plan: the crack is closed
  markFixed() {
    const { job } = this.store.state;
    if (!job) return;
    this.#security.setScore(job.path, 'green', R.fixedReason, 'remi');
    this.close();
  }

  close() {
    this.#runId++;
    this.store.set({ job: null });
    this.#next();
  }

  async #run(path) {
    const id = ++this.#runId;
    const alive = () => id === this.#runId;
    const score = this.#security.scoreOf(path);
    const reason = score.reason || strings.security.reasons[score.reasonKey] || '';
    const spot = this.#map.locateFile(path);

    // Go to the map, with the building in view (an open building would hide Remi)
    if (this.#tower.isOpen) this.#tower.close({ restoreCamera: false });
    this.#camera.flyTo({ x: spot.x, z: spot.z });

    // Remi stands on the side of the building that faces the camera
    const az = this.#camera.azimuth;
    const to = { x: spot.x + Math.sin(az) * 4.8, z: spot.z + Math.cos(az) * 4.8 }; // just outside the plinth
    const walkMs = Math.min(Math.max((Math.hypot(to.x - HQ_DOOR.x, to.z - HQ_DOOR.z) / WALK_SPEED) * 1000, 1200), 3200);
    const set = (patch) => alive() && this.store.set({ job: { ...this.store.state.job, ...patch } });

    this.store.set({
      job: { path, reason, reasonKey: score.reasonKey, folder: spot.folder, from: HQ_DOOR, to, center: { x: spot.x, z: spot.z }, height: spot.height, step: 0, stepMs: walkMs, plan: [], source: null, agentLabel: '' },
    });
    this.#bus.emit(EVENTS.repairStarted, { path });

    await wait(walkMs);
    set({ step: 1, stepMs: LOOK_MS });
    await wait(LOOK_MS);
    if (!alive()) return;

    set({ step: 2, stepMs: 0 });
    const [planned] = await Promise.all([this.#plan(path, reason, score.reasonKey), wait(PLAN_MIN_MS)]);
    if (!alive()) return;
    set({ step: 3, stepMs: SHORE_MS, ...planned });

    await wait(SHORE_MS);
    if (!alive()) return;
    this.#security.setScore(path, 'yellow', R.plannedReason(planned.plan[0].toLowerCase()), 'remi');
    set({ step: 4, stepMs: 0 });
    this.#bus.emit(EVENTS.repairPlanned, { path, plan: planned.plan });

    // With more cracks in line, Remi moves on by himself
    if (this.store.state.queue.length) {
      await wait(2500);
      if (alive()) this.close();
    }
  }

  async #plan(path, reason, reasonKey) {
    const guide = { plan: R.plans[reasonKey] ?? R.plans.other, source: 'guide', agentLabel: '' };
    const c = this.#connection;
    if (!c?.live) return guide;
    const agent = c.store.state.agents.find((a) => a.id === c.store.state.selected);
    const answer = await Promise.race([c.ask(R.agentPrompt(path, reason), strings.agent.livePrompt), wait(AGENT_TIMEOUT_MS).then(() => null)]);
    const steps = answer?.text ? parseSteps(answer.text) : [];
    return steps.length ? { plan: steps, source: 'agent', agentLabel: agent?.label ?? '' } : guide;
  }

  #next() {
    const [path, ...rest] = this.store.state.queue;
    if (!path) return;
    this.store.set({ queue: rest });
    this.#run(path);
  }
}
