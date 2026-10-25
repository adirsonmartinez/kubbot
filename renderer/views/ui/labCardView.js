// The Arduino lab's card (spec/005-arduino-lab.md), over the bench while the Lab view is on screen:
// the project's title and level, «Probar» / «Detener» (data-gesture="never": they run code without a
// confirmation), the obstacle's distance with big − / + (gesture-safe), the circuit's review, the serial
// monitor, the selected part, and the components, steps and cautions the agent wrote. Only draws and
// forwards clicks to the view model.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';

const L = strings.lab;
const node = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};
const button = (cls, iconName, label, run, never = false) => {
  const b = node('button', `lab-btn ${cls}`);
  b.type = 'button';
  if (never) b.dataset.gesture = 'never';
  b.append(icon(iconName, { size: 18 }), node('span', '', label));
  b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
  return b;
};
const partText = (key) => L.parts[key] ?? L.parts.unknown;

export function createLabCardView({ container, labViewModel: vm, appViewModel }) {
  const card = node('aside', 'lab-card');
  card.hidden = true;
  container.append(card);

  const head = node('header', 'lab-head');
  const title = node('strong', 'lab-title');
  const level = node('em', 'lab-level');
  head.append(node('span', 'lab-dot'), title, level);
  const status = node('p', 'lab-status');
  const run = button('primary', 'play', L.run, () => vm.run(), true);
  const stop = button('', 'stop', L.stop, () => vm.stop(), true);
  const actions = node('div', 'lab-actions');
  actions.append(run, stop);
  const example = button('', 'play', L.openExample, () => vm.openExample());

  const obstacle = node('div', 'lab-obstacle');
  const distance = node('output', 'lab-distance');
  obstacle.append(button('', 'minus', L.closer, () => vm.nudge(-10)), distance, button('', 'plus', L.farther, () => vm.nudge(+10)));
  const rulerHint = node('p', 'lab-hint', L.rulerHint);

  const errorLines = node('pre', 'lab-errors');
  const issuesBox = node('section', 'lab-section');
  const serialBox = node('section', 'lab-section');
  const serial = node('pre', 'lab-serial');
  serialBox.append(node('h4', '', L.serial), serial);
  const partBox = node('section', 'lab-section lab-part');
  const speed = node('p', 'lab-speed');
  const details = node('div', 'lab-details');

  card.append(head, status, actions, example, obstacle, rulerHint, errorLines, issuesBox, partBox, serialBox, details, speed);

  const list = (titleText, items, render) => {
    const d = node('details', 'lab-section');
    d.append(node('summary', '', titleText));
    const ul = node('ul');
    items.forEach((item) => ul.append(render(item)));
    d.append(ul);
    return d;
  };

  let shownVersion = -1, shownIssues = null, shownSelected;
  function render() {
    const st = vm.store.state;
    const onLab = appViewModel.view === 'lab';
    card.hidden = !onLab;
    if (!onLab) return;

    title.textContent = st.title || L.status.empty;
    level.textContent = st.lab ? L.levels[st.lab.level] ?? '' : '';
    level.hidden = !st.lab;
    status.textContent = st.status === 'error' ? L.errors[st.error] ?? L.errors.failed : L.status[st.status] ?? '';
    status.classList.toggle('bad', st.status === 'error');
    const hasLab = st.parts.length > 0;
    actions.hidden = !hasLab;
    run.disabled = !hasLab || st.status === 'running' || st.status === 'compiling';
    stop.disabled = st.status !== 'running';
    example.hidden = hasLab;
    const cm = Object.values(st.distance)[0];
    obstacle.hidden = rulerHint.hidden = cm === undefined;
    if (cm !== undefined) distance.textContent = L.obstacle(cm);
    errorLines.hidden = !st.errorLines.length;
    errorLines.textContent = st.errorLines.join('\n');

    if (st.version !== shownVersion || st.issues !== shownIssues) {
      shownVersion = st.version;
      shownIssues = st.issues;
      issuesBox.replaceChildren(node('h4', '', L.issuesTitle));
      if (!st.issues.length) issuesBox.append(node('p', 'lab-ok', L.noIssues));
      for (const issue of st.issues) {
        const p = node('p', `lab-issue ${issue.level}`);
        const who = issue.parts.length ? `${issue.parts.join(', ')}: ` : '';
        p.textContent = who + (L.issues[issue.code]?.(issue.values ?? {}) ?? issue.code);
        issuesBox.append(p);
      }
      issuesBox.hidden = !hasLab;
      details.replaceChildren();
      if (st.lab?.goal) details.append(node('p', 'lab-goal', st.lab.goal));
      if (st.lab?.components.length) details.append(list(L.components, st.lab.components, (c) => { const li = node('li'); li.append(node('b', '', `${c.qty} × ${c.name}`), node('span', '', c.why ? ` — ${c.why}` : '')); return li; }));
      if (st.lab?.steps.length) details.append(list(L.steps, st.lab.steps, (s) => node('li', '', s)));
      if (st.lab?.cautions.length) details.append(list(L.cautions, st.lab.cautions, (s) => node('li', '', s)));
    }

    if (st.selected !== shownSelected || st.version !== shownVersion) {
      shownSelected = st.selected;
      const part = st.parts.find((p) => p.id === st.selected);
      partBox.hidden = !part;
      if (part) {
        const info = partText(part.key);
        const pins = st.wires.filter((w) => w.from.part === part.id || w.to.part === part.id)
          .map((w) => (w.from.part === part.id ? `${w.from.pin} → ${w.to.part}:${w.to.pin}` : `${w.to.pin} → ${w.from.part}:${w.from.pin}`));
        partBox.replaceChildren(node('h4', '', `${L.selected}: ${part.id}`), node('p', 'lab-part-name', info.name), node('p', '', info.role), node('p', 'lab-pins', L.pinsOf(pins.join(', ') || '—')));
      }
    }

    serialBox.hidden = !hasLab;
    const text = st.serial.slice(-8).join('\n') || L.serialEmpty;
    if (serial.textContent !== text) serial.textContent = text;
    serial.classList.toggle('empty', !st.serial.length);
    speed.hidden = st.status !== 'running' || st.speed == null;
    if (st.speed != null) speed.textContent = L.speed(Math.round(st.speed * 100));
  }

  vm.store.subscribe(render, { immediate: true });
  appViewModel.store.subscribe(render);
}
