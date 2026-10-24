// Thinking orbs (libraries.dev, MIT): a small dotted orb that says what the agent is doing.
// The package's React component is a thin loop over its framework-free engine (`thinking-orbs/engine`);
// this is the same loop for plain DOM: one shared requestAnimationFrame clock for every orb on screen,
// paused while the window is hidden, one static frame with reduced motion. An orb removed from the page
// stops drawing on its own.
//
// States (pick the one that names the activity): working, searching, solving, listening, connecting,
// composing, breathing (thinking), weaving (planning), shaping. Sizes: 64 (avatar) or 20 (inline).
import { resolvePreset, MODE_FRAMES, paintFrame } from 'thinking-orbs/engine';

const orbs = new Set();
let raf = 0;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function draw(orb, t) {
  const { ctx, size, dpr, frame, opts, speed } = orb;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  paintFrame(ctx, frame(size, t * speed, opts), true); // dark theme: light dots
}

function loop() {
  raf = 0;
  if (document.visibilityState === 'hidden') return;
  const t = performance.now() / 1000;
  for (const orb of orbs) {
    if (!orb.canvas.isConnected) { orbs.delete(orb); continue; }
    if (orb.canvas.offsetParent !== null) draw(orb, t); // skip hidden ones (minimized chat…)
  }
  if (orbs.size) raf = requestAnimationFrame(loop);
}
const start = () => { if (!raf && orbs.size && !reduced()) raf = requestAnimationFrame(loop); };
document.addEventListener('visibilitychange', start);

// Returns a <canvas>. label: what it is doing, for screen readers (omit when text beside it says it)
export function thinkingOrb(state = 'working', { size = 20, label = '', className = '' } = {}) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.className = `orb${className ? ` ${className}` : ''}`;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  if (label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  else canvas.setAttribute('aria-hidden', 'true');
  const { mode, speed, opts } = resolvePreset(state, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const orb = { canvas, ctx, size, dpr, frame: MODE_FRAMES[mode], opts, speed };
  draw(orb, reduced() ? 0.6 : performance.now() / 1000);
  if (!reduced()) { orbs.add(orb); start(); }
  return canvas;
}

// What each Platanus step looks like (the package's recipe: search -> searching, write -> composing…)
export const STEP_ORB = {
  get_project: 'searching',
  list_risks: 'searching',
  read_file: 'working',
  write_file: 'composing',
  set_file_score: 'solving',
  show_folder: 'connecting',
  subagent: 'weaving',
  thinking: 'breathing',
  writing: 'composing',
};
