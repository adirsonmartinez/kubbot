// Remi's card (brutalist, bottom-right of the stage): avatar, current step, the plan being ticked off,
// a progress strip and, at the end, "Ya lo apliqué" / "Cerrar".
import { strings } from '../../i18n/es.js';
import { drawSprite, SPRITE_H, SPRITE_W, STEP_FPS, STEP_FRAMES } from '../remiSprite.js';
import { STEPS } from '../../viewmodels/repairViewModel.js';

const R = strings.repair;
const SCALE = 4;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createRepairPanelView({ container, repairViewModel: vm, modeModel }) {
  const card = el('aside', 'remi-card');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.hidden = true;
  container.appendChild(card);

  const canvas = el('canvas', 'remi-avatar');
  canvas.width = SPRITE_W * SCALE;
  canvas.height = SPRITE_H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tick = 0;
  let timer = null;

  function animate(step) {
    clearInterval(timer);
    const frames = STEP_FRAMES[step] ?? ['idle'];
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSprite(ctx, frames[tick++ % frames.length], SCALE);
    };
    draw();
    if (!still && frames.length > 1) timer = setInterval(draw, 1000 / STEP_FPS[step]);
  }

  let lastStep = -1;
  function render({ job, queue }) {
    card.hidden = !job;
    if (!job) { clearInterval(timer); lastStep = -1; return; }
    if (job.step !== lastStep) { lastStep = job.step; animate(job.step); }
    const done = job.step === STEPS - 1;
    card.classList.toggle('done', done);

    const head = el('header', 'remi-head');
    head.append(el('span', '', R.name), el('span', 'remi-progress', R.step(job.step + 1, STEPS) + (queue.length ? ` · ${R.queued(queue.length)}` : '')));

    const frame = el('div', 'remi-frame');
    frame.appendChild(canvas);
    const info = el('div', 'remi-info');
    const path = modeModel.tech ? job.path : job.path.split('/').pop();
    info.append(el('p', 'remi-kicker', R.working), el('p', 'remi-title', path), el('p', `remi-step${done ? ' ok' : ''}`, R.steps[job.step] + (done ? '' : '…')));
    if (modeModel.tech) info.appendChild(el('p', 'remi-reason', strings.security.techReasons[job.reasonKey] ?? job.reason));
    const top = el('div', 'remi-top');
    top.append(frame, info);

    const parts = [head, top];
    if (job.plan.length) {
      const plan = el('div', 'remi-plan');
      plan.appendChild(el('p', 'remi-kicker', `${R.myPlan} · ${job.source === 'agent' ? R.fromAgent(job.agentLabel) : R.fromGuide}`));
      const list = el('ol');
      // Plan items get ticked while Remi shores the crack up, and stay ticked afterwards
      const progress = job.step > 3 ? job.plan.length : job.step === 3 ? Math.ceil(job.plan.length / 2) : 0;
      job.plan.forEach((s, i) => {
        const item = el('li', i < progress ? 'ok' : '');
        item.append(el('span', 'remi-check', i < progress ? '✓' : String(i + 1)), el('span', '', s));
        list.appendChild(item);
      });
      plan.appendChild(list);
      parts.push(plan);
    }
    if (done) {
      parts.push(el('p', 'remi-honest', R.honest));
      const actions = el('div', 'remi-actions');
      const fixed = el('button', 'remi-btn primary', R.markFixed);
      fixed.type = 'button';
      fixed.addEventListener('click', () => vm.markFixed());
      const close = el('button', 'remi-btn', R.close);
      close.type = 'button';
      close.addEventListener('click', () => vm.close());
      actions.append(fixed, close);
      parts.push(actions);
    }
    const strip = el('ol', 'remi-strip');
    R.steps.forEach((label, i) => {
      const cell = el('li', i < job.step ? 'past' : i === job.step ? 'now' : '');
      cell.title = label;
      strip.appendChild(cell);
    });
    parts.push(strip);
    card.replaceChildren(...parts);
  }

  vm.store.subscribe(render, { immediate: true });
  modeModel.store.subscribe(() => render(vm.store.state));
}
