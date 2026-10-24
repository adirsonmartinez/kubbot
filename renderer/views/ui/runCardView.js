// A live "run" card for an answer of the user's own agent: header (agent, model, effort, timer), the
// steps it takes (Platanus tools and subagents, nested, each with its status and time), its reasoning
// folded, the answer as Markdown, and time/turns/tokens at the end.
// Rebuilt on every update, but what the person opened or closed stays as it was.
import { strings } from '../../i18n/es.js';
import { modelLabel } from '../../models/agentConnectionModel.js';
import { markdownToHtml } from './markdown.js';
import { splitAnswer } from '../../models/answerFormat.js';
import { icon, applyIcons, TOOL_ICONS } from './icons.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';

const R = strings.chat.run;
const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const ORB_AFTER_MS = 2000; // libraries.dev rule: no orb for waits under 2 s
const elapsed = (step) => (step.endedAt ? R.seconds(step.endedAt - step.startedAt) : '');

// An orb that appears only once the work has lasted 2 s (it is rebuilt on every update, so the delay
// counts from when the work started, not from now)
export function delayedOrb(state, startedAt, size = 20) {
  const orb = thinkingOrb(state, { size });
  orb.classList.add('late');
  orb.style.animationDelay = `${ORB_AFTER_MS - (Date.now() - startedAt)}ms`;
  return orb;
}

// What the agent is doing in this message, as an orb state (header avatar and run card)
export function orbStateOf(message) {
  const run = message?.run;
  const step = run?.steps.findLast((s) => s.status === 'running');
  if (step) return STEP_ORB[step.kind === 'subagent' ? 'subagent' : step.name] ?? 'working';
  if (message?.text) return STEP_ORB.writing;
  return STEP_ORB.thinking;
}

// Icon of a step: its tool's icon, and while it runs (longer than 2 s) an orb on top
function stepIcon(step) {
  const box = el('span', `run-icon ${step.status}`);
  const name = step.status === 'error' ? 'danger' : step.kind === 'subagent' ? 'subagent' : TOOL_ICONS[step.name] ?? 'arrow';
  box.appendChild(icon(name, { size: 14 }));
  if (step.status === 'running') box.appendChild(delayedOrb(STEP_ORB[step.kind === 'subagent' ? 'subagent' : step.name] ?? 'working', step.startedAt));
  if (step.status === 'done') box.appendChild(el('span', 'run-check'));
  return box;
}

function stepRow(step, all) {
  const li = el('li', `run-step ${step.kind} ${step.status}`);
  const line = el('div', 'run-step-line');
  if (step.kind === 'tool') {
    line.append(stepIcon(step), el('span', 'run-step-name', R.tools[step.name] ?? R.tool));
    if (step.target) line.appendChild(el('code', 'run-step-target', step.target));
  } else {
    line.append(stepIcon(step), el('span', 'run-step-badge', R.subagent(step.agentKind)), el('span', 'run-step-name', step.description));
  }
  line.appendChild(el('span', 'run-step-time', elapsed(step)));
  li.appendChild(line);

  if (step.kind === 'subagent') {
    const children = all.filter((x) => x.parent === step.id);
    if (children.length) {
      const ol = el('ol', 'run-steps-nested');
      children.forEach((child) => ol.appendChild(stepRow(child, all)));
      li.appendChild(ol);
    }
    if (step.output) {
      const out = el('details', 'run-step-output');
      out.dataset.key = `out-${step.id}`;
      const body = el('div', 'md');
      body.innerHTML = markdownToHtml(step.output); // escaped by markdownToHtml
      out.append(el('summary', '', R.output), body);
      li.appendChild(out);
    }
  }
  return li;
}

export function renderRunCard(el0, message) {
  const { run, text, thinking } = message;
  // Keep the person's open/closed choices across redraws (default: steps open while it works)
  const opened = new Map([...el0.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]));
  const isOpen = (key, fallback) => (opened.has(key) ? opened.get(key) : fallback);
  const running = run.status === 'running';

  const head = el('header', 'run-head');
  const avatar = el('span', `run-avatar ${run.agentId ?? ''}`, (run.agent ?? '?').slice(0, 1));
  const who = el('div', 'run-who');
  who.append(el('strong', '', run.agent), el('span', 'run-model', `${modelLabel(run.agentId, run.model) ?? C.planDefault} · ${C.efforts[run.effort] ?? ''}`));
  const state = el('span', `run-state ${run.status}`);
  if (running) state.appendChild(delayedOrb(orbStateOf(message), run.startedAt));
  else state.appendChild(icon(run.status === 'error' ? 'danger' : 'ok', { size: 13 }));
  state.appendChild(el('span', '', running ? R.working : run.status === 'error' ? R.failed : R.done));
  const timer = el('span', 'run-time', R.seconds((run.endedAt ?? Date.now()) - run.startedAt));
  timer.dataset.start = String(run.startedAt);
  if (running) timer.dataset.live = '1';
  head.append(avatar, who, ...(run.compare ? [el('span', 'run-compare', strings.hub.compare)] : []), state, timer);
  const parts = [head];

  const top = run.steps.filter((s) => !s.parent);
  if (run.steps.length) {
    const box = el('details', 'run-steps');
    box.dataset.key = 'steps';
    box.open = isOpen('steps', true);
    const subagents = run.steps.filter((s) => s.kind === 'subagent').length;
    box.appendChild(el('summary', '', R.summary(run.steps.length, subagents)));
    const ol = el('ol');
    top.forEach((s) => ol.appendChild(stepRow(s, run.steps)));
    box.appendChild(ol);
    parts.push(box);
  }

  if (thinking) {
    const why = el('details', 'reasoning');
    why.dataset.key = 'reasoning';
    why.open = isOpen('reasoning', !text);
    const body = el('div');
    body.innerHTML = markdownToHtml(thinking);
    why.append(el('summary', '', strings.chat.reasoning), body);
    parts.push(why);
  }

  if (run.error) {
    const fail = el('div', 'run-error');
    fail.innerHTML = run.error; // our own message (strings.agent.liveFailed), already escaped
    parts.push(fail);
  }

  const answer = el('div', `md${running ? ' streaming' : ''}`);
  const body = splitAnswer(text).body; // the suggestions block becomes chips under the chat
  answer.innerHTML = body ? markdownToHtml(body) : running && !run.steps.length && !thinking ? `<p>${strings.chat.thinking}</p>` : '';
  parts.push(answer);

  if (run.result) parts.push(el('footer', 'run-foot', R.foot(run.result, R.seconds)));
  el0.replaceChildren(...parts);
  applyIcons(el0); // callout icons in the answer
  // keep nested details state
  for (const d of el0.querySelectorAll('details[data-key]')) if (opened.has(d.dataset.key)) d.open = opened.get(d.dataset.key);
}

// Running timers tick once per second (only while some run is working)
export function tickRunTimers(root) {
  for (const t of root.querySelectorAll('.run-time[data-live]')) {
    t.textContent = R.seconds(Date.now() - Number(t.dataset.start));
  }
}
