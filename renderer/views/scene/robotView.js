// The welcome robot (RobotDialogViewModel): it hovers on the plaza of a new project and talks in one speech
// bubble above its head. Each new message pops in: the robot hops (shakes its head for a risk), a few typing
// dots, the text types itself (click to skip) and then the buttons slide in one by one. Minimized, the bubble
// is a small pill that lights up when there is news.
import * as THREE from 'three';
import { buildRobot } from './builders/robotBuilder.js';
import { strings } from '../../i18n/es.js';
import { escapeHtml } from '../../core/format.js';
import { icon } from '../icons.js';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';

const UI = strings.map.welcome.ui;
const SPOT = 1.1;          // front corner of an empty plaza, so the bubble clears the project's label
const BASE_Y = 0.6;        // hovering just above the plaza
const BUBBLE_Y = 3.1;      // bubble anchor above the robot's base
const POP_SPEED = 2.4;
const TYPING_DOTS_S = 0.35; // "…" before the text starts
const CHARS_PER_S = 55;
const TONE_ICON = { info: 'sparkles', success: 'ok', warn: 'shieldWarn', danger: 'danger' };

function headHtml(b) {
  if (b.progress) {
    const dots = Array.from({ length: b.progress.of }, (_, i) =>
      `<span class="${i < b.progress.step - 1 ? 'done' : i === b.progress.step - 1 ? 'now' : ''}"></span>`).join('');
    return `<span class="rb-steps" aria-label="${escapeHtml(UI.progress(b.progress.step, b.progress.of))}">${dots}</span>`;
  }
  return `<span class="rb-badge">${icon(TONE_ICON[b.tone])}${escapeHtml(UI.coach)}</span>`;
}

function bubbleHtml(b) {
  // Earlier answers: tapping one goes back to that question to change it
  const answers = b.answers?.length
    ? `<div class="rb-answers">${b.answers.map((a, i) => `<button type="button" data-press="rewind:${i}" title="${escapeHtml(UI.rewind(a))}" aria-label="${escapeHtml(UI.rewind(a))}">${escapeHtml(a)}${icon('rotateLeft')}</button>`).join('')}</div>` : '';
  const buttons = b.buttons.map((btn, i) =>
    `<button type="button" class="rb-btn ${btn.kind}" data-press="${btn.id}" style="--i:${i}">${escapeHtml(btn.label)}</button>`).join('');
  const back = b.canBack
    ? `<button type="button" class="rb-back" data-press="back" title="${escapeHtml(UI.back)}">${icon('arrowRight')}${escapeHtml(UI.back)}</button>` : '';
  const hint = b.hint ? `<p class="rb-hint">${escapeHtml(b.hint)}</p>` : '';
  // The recommendation: why it is a good choice first, the real tech in small print
  const card = b.stack ? `
      <div class="rb-card">
        <ul>${b.stack.perks.map((p, i) => `<li style="--i:${i}">${icon('ok')}${escapeHtml(p)}</li>`).join('')}</ul>
        <span class="rb-tech">${escapeHtml(b.stack.inside)} <code>${escapeHtml(b.stack.tech)}</code></span>
      </div>` : '';
  return `
    <div class="rb-bubble tone-${b.tone} kind-${b.kind}" role="dialog" aria-live="polite" aria-label="${escapeHtml(b.title)}">
      <div class="rb-head">
        ${back}
        ${headHtml(b)}
        <button type="button" class="rb-icon" data-press="collapse" title="${escapeHtml(UI.collapse)}" aria-label="${escapeHtml(UI.collapse)}">${icon('minus')}</button>
        <button type="button" class="rb-icon" data-press="close" title="${escapeHtml(UI.close)}" aria-label="${escapeHtml(UI.close)}">${icon('close')}</button>
      </div>
      ${answers}
      <strong class="rb-title">${escapeHtml(b.title)}</strong>
      <p class="rb-text" title="${escapeHtml(UI.skipTyping)}"><span class="rb-typed"></span><span class="rb-caret"></span><span class="rb-dots"><i></i><i></i><i></i></span></p>
      ${hint}${card}
      <div class="rb-buttons">${buttons}</div>
    </div>`;
}

function pillHtml(unread) {
  return `<button type="button" class="rb-pill${unread ? ' unread' : ''}" data-press="expand" aria-label="${escapeHtml(UI.expand)}">${icon('bot')}<span>${escapeHtml(UI.pill)}</span></button>`;
}

export function createRobotView({ sceneView, labels, mapViewModel, robotDialogViewModel: dialog }) {
  const robot = buildRobot();
  robot.root.position.set(SPOT, BASE_Y, SPOT);
  robot.root.rotation.y = CAMERA.azimuth; // faces the camera
  robot.root.visible = false;
  sceneView.layers.map.add(robot.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(SPOT, 0.3, SPOT);
  shadow.visible = false;
  sceneView.layers.map.add(shadow);

  const label = labels.add({ anchor: { x: SPOT, y: BASE_Y + BUBBLE_Y, z: SPOT }, className: 'robot-speech', hidden: true });
  label.el.addEventListener('click', (e) => {
    const button = e.target.closest('[data-press]');
    if (button) return dialog.press(button.dataset.press);
    if (e.target.closest('.rb-text')) finishTyping();
  });
  // Clicks and wheel on the bubble stay off the map below it
  for (const type of ['pointerdown', 'wheel']) label.el.addEventListener(type, (e) => e.stopPropagation());

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0;       // 0..1 pop-in / pop-out
  let on = false;
  let clock = 0;
  let hop = 0;         // 1 -> 0 after each new message
  let shake = 0;       // 1 -> 0 after a risk
  let typing = null;   // { el, full, chars, start } while the text is being typed
  let rendered = { seq: -1, collapsed: null, unread: null };

  function finishTyping() {
    if (!typing) return;
    typing.el.textContent = typing.full;
    typing = null;
    label.el.querySelector('.rb-bubble')?.classList.add('typed');
  }

  function render(state) {
    const fresh = state.seq !== rendered.seq;
    if (!fresh && state.collapsed === rendered.collapsed && state.unread === rendered.unread) return;
    rendered = { seq: state.seq, collapsed: state.collapsed, unread: state.unread };
    typing = null;
    label.el.classList.toggle('collapsed', state.collapsed);
    if (state.collapsed) {
      label.el.innerHTML = pillHtml(state.unread);
      return;
    }
    label.el.innerHTML = bubbleHtml(state.bubble);
    const typed = label.el.querySelector('.rb-typed');
    const bubble = label.el.querySelector('.rb-bubble');
    // Only a new message is typed out and bounced; reopening the bubble shows it whole
    if (fresh && !still) {
      // By characters, not UTF-16 units, so an emoji is never cut in half
      typing = { el: typed, full: state.bubble.text, chars: [...state.bubble.text], start: clock };
      bubble.classList.add('pop');
      hop = 1;
      if (state.bubble.tone === 'danger' || state.bubble.tone === 'warn') shake = 1;
    } else {
      typed.textContent = state.bubble.text;
      bubble.classList.add('typed');
    }
  }

  function sync() {
    const map = mapViewModel.store.state;
    const state = dialog.store.state;
    const wasOn = on;
    on = state.phase !== 'off' && map.status === 'ready';
    if (on && !wasOn) {
      shown = still ? 1 : 0;
      robot.root.visible = shadow.visible = true;
      label.el.hidden = false;
    }
    if (on) render(state);
  }
  mapViewModel.store.subscribe(sync, { immediate: true });
  dialog.store.subscribe(sync, { immediate: true });

  sceneView.onFrame((_t, dt) => {
    if (!robot.root.visible) return;
    clock += dt;
    const a = still ? 0 : 1;

    // Pop in while on, pop out (then hide) when the guide closes
    shown = on ? Math.min(shown + dt * POP_SPEED, 1) : Math.max(shown - dt * POP_SPEED * 1.5, 0);
    if (!on && shown === 0) {
      robot.root.visible = shadow.visible = false;
      label.el.hidden = true;
      rendered = { seq: -1, collapsed: null, unread: null };
      return;
    }
    const pop = 1 - (1 - shown) ** 3;

    const p = robot.root.position;
    hop = Math.max(hop - dt * 2.2, 0);
    shake = Math.max(shake - dt * 1.6, 0);
    const talking = typing ? 1 : 0;

    robot.root.scale.setScalar(1.25 * Math.max(pop, 0.001));
    robot.body.position.y = (Math.sin(clock * 2) * 0.08 + Math.sin(hop * Math.PI) * 0.45) * a;
    robot.arms[1].rotation.z = 2.5 + Math.sin(clock * 6) * 0.35 * a;      // wave, arm up
    robot.arms[0].rotation.x = Math.sin(clock * 2) * 0.08 * a;
    robot.head.rotation.z = Math.sin(clock * 1.5) * 0.08 * a;             // curious tilt
    robot.head.rotation.y = Math.sin(clock * 22) * 0.35 * shake * a;      // "no, no" for a risk
    robot.tip.scale.setScalar(1 + Math.abs(Math.sin(clock * 14)) * 0.6 * talking * a); // antenna blinks while talking
    const blink = !still && clock % 3.2 < 0.12;
    robot.eyes.forEach((eye) => { eye.scale.y = blink ? 0.02 : 0.12; });

    label.setAnchor(p.x, BASE_Y + BUBBLE_Y + robot.body.position.y * 1.25, p.z);
    label.el.style.opacity = String(pop);

    // Typing: a few dots first, then the text letter by letter, then the buttons
    if (typing) {
      const elapsed = clock - typing.start - TYPING_DOTS_S;
      const bubble = label.el.querySelector('.rb-bubble');
      bubble?.classList.toggle('thinking', elapsed < 0);
      if (elapsed >= 0) {
        const n = Math.min(Math.floor(elapsed * CHARS_PER_S), typing.chars.length);
        typing.el.textContent = typing.chars.slice(0, n).join('');
        if (n >= typing.chars.length) finishTyping();
      }
    }
  });
}
