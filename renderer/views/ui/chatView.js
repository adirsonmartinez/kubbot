// Renders ChatViewModel: messages (appended incrementally to keep the scroll; a streaming answer
// updates its bubble in place), map cards, "thinking…", chips, and the composer (Enter sends,
// Shift+Enter breaks) with the Vibe / Dev switch.
//
// While the agent works (libraries.dev effects, placed by their author's rules): a thinking orb in the
// header avatar whose state follows what it is doing (only after 2 s), and a border beam on the composer
// (only after 3 s). File names in answers are links to the map.
import { strings } from '../../i18n/es.js';
import { splitAnswer } from '../../models/answerFormat.js';
import { markdownToHtml } from './markdown.js';
import { renderRunCard, tickRunTimers, orbStateOf } from './runCardView.js';
import { renderChatCard, actionButton } from './chatCardsView.js';
import { icon, applyIcons } from './icons.js';
import { thinkingOrb } from './thinkingOrb.js';

const MAX_INPUT_PX = 160;
const ORB_AFTER_MS = 2000;
const BEAM_AFTER_MS = 3000;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createChatView({ chatViewModel: vm, connection = null, modeModel = null, onLocate = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const root = $('chat'), body = $('chat-body'), form = $('chat-form'), input = $('chat-text');
  const sendButton = $('chat-send'), toggle = $('chat-toggle');
  const rendered = new Map(); // message id -> { el, text }

  // "Thinking…": three dots, and a composing orb with its label if it takes longer than 2 s
  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  const dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.innerHTML = '<i></i><i></i><i></i>'; // static markup
  const slow = document.createElement('span');
  slow.className = 'typing-slow';
  slow.append(thinkingOrb('composing', { size: 20 }), document.createTextNode(strings.chat.thinking));
  typing.append(dots, slow);

  const chips = document.createElement('div');
  chips.className = 'chips';

  // Welcome screen (empty conversation), as in Obra: title, one sentence and suggestions
  const hero = document.createElement('div');
  hero.className = 'chat-hero';
  body.prepend(hero);
  let heroKey = '';
  function renderHero(state) {
    const key = `${state.projectName}|${(state.chips ?? []).map((c) => (typeof c === 'string' ? c : c.label)).join('|')}`;
    if (key === heroKey) return;
    heroKey = key;
    const mark = document.createElement('span');
    mark.className = 'chat-hero-mark';
    const title = document.createElement('h2');
    title.textContent = state.projectName ? strings.chat.welcomeTitle(state.projectName) : strings.chat.welcomeNoProject;
    const text = document.createElement('p');
    text.textContent = strings.chat.welcomeBody;
    const list = document.createElement('div');
    list.className = 'chat-hero-list';
    const options = [...(state.chips ?? []), ...(state.projectName ? strings.chat.prompts : [])];
    for (const option of options) {
      list.appendChild(actionButton(typeof option === 'string' ? { kind: 'ask', label: option } : option, vm, 'hero-option'));
    }
    mark.replaceChildren(icon('sparkles', { size: 22 }));
    hero.replaceChildren(mark, title, text, list);
  }

  // Agent answers are Markdown (escaped first, see markdown.js) with cards; the suggestions block is
  // not shown (it becomes the chips). The person's own text stays plain.
  function fill(el, { role, text, html, thinking }) {
    if (html) { el.innerHTML = html; return; } // only our own strings, never user input
    if (role !== 'bot') { el.textContent = text ?? ''; return; }
    const parts = [];
    if (thinking) {
      parts.push(`<details class="reasoning"${text ? '' : ' open'}><summary>${strings.chat.reasoning}</summary><div>${markdownToHtml(thinking)}</div></details>`);
    }
    const answer = splitAnswer(text).body;
    parts.push(answer ? `<div class="md">${markdownToHtml(answer)}</div>` : thinking ? '' : `<div class="md">${strings.chat.thinking}</div>`);
    const open = el.querySelector('details.reasoning')?.open;
    el.innerHTML = parts.join('');
    applyIcons(el);
    if (open !== undefined && text) el.querySelector('details.reasoning').open = open; // keep what the person chose
  }

  function messageElement(m) {
    const el = document.createElement('div');
    el.className = ['msg', m.role, m.tone, m.run && 'run', m.card && `card-msg ${m.card.kind}`].filter(Boolean).join(' ');
    paint(el, m);
    return el;
  }

  const paint = (el, m) => {
    if (m.run) renderRunCard(el, m);
    else if (m.card) renderChatCard(el, m.card, vm);
    else fill(el, m);
  };

  // File names in answers are links: they show the file on the map
  const locate = (e) => {
    const ref = e.target.closest?.('.file-ref');
    if (!ref || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onLocate(ref.dataset.path);
  };
  body.addEventListener('click', locate);
  body.addEventListener('keydown', locate);

  function render(state, previous) {
    // Follow the conversation only if the person is already at the bottom (not while they read above)
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    body.classList.toggle('welcome', state.welcome);
    if (state.welcome) renderHero(state);
    // A new conversation empties the list: drop the bubbles that are no longer there
    if (previous && state.messages.length < previous.messages.length) {
      const keep = new Set(state.messages.map((m) => m.id));
      for (const [id, { el }] of rendered) if (!keep.has(id)) { el.remove(); rendered.delete(id); }
    }
    state.messages.forEach((m) => {
      const seen = rendered.get(m.id);
      if (!seen) {
        const el = messageElement(m);
        rendered.set(m.id, { el, msg: m });
        body.appendChild(el);
      } else if (seen.msg !== m && !m.html) { // messages are immutable: a new object means it changed
        seen.msg = m;
        paint(seen.el, m);
      }
    });

    typing.remove();
    chips.remove();
    // A live run card already says "Trabajando…": no extra dots under it
    const runWorking = state.messages.at(-1)?.run?.status === 'running';
    if (state.typing && !runWorking) body.appendChild(typing);
    if (state.chips?.length) {
      if (state.chips !== previous?.chips) {
        chips.replaceChildren(...state.chips.map((chip, i) => {
          const button = actionButton(typeof chip === 'string' ? { kind: 'ask', label: chip } : chip, vm, 'chip');
          button.style.setProperty('--i', String(i)); // staggered entrance
          return button;
        }));
      }
      body.appendChild(chips);
    }
    if (atBottom || state.messages.length !== previous?.messages.length) body.scrollTop = body.scrollHeight;

    sendButton.disabled = state.typing;
    root.classList.toggle('min', state.minimized);
    root.classList.toggle('working', state.typing);
    document.body.classList.toggle('chat-min', state.minimized); // the map takes the chat's column
    toggle.setAttribute('aria-expanded', String(!state.minimized));
    toggle.title = state.minimized ? strings.chat.expand : strings.chat.minimize;
    if (toggle.dataset.min !== String(state.minimized)) {
      toggle.dataset.min = String(state.minimized);
      toggle.replaceChildren(icon(state.minimized ? 'expand' : 'minimize', { size: 16 }));
    }
    working(state);
  }

  // --- While the agent works: orb in the avatar (after 2 s), beam on the composer (after 3 s) ---
  const avatar = root.querySelector('.chat-avatar');
  const avatarIcon = avatar.firstElementChild;
  let orbState = null;
  let workStarted = 0;
  let beamTimer = 0;
  let beam = null;
  // Built by scripts/vendor-ui.js (npm start runs it); without it the chat simply has no beam
  import('../../vendor/border-beam.js')
    .then(({ mountBorderBeam }) => {
      beam = mountBorderBeam(form, { size: 'md', colorVariant: 'ocean', theme: 'dark', active: Boolean(beamTimer === -1), strength: 0.85, borderRadius: 16 });
    })
    .catch((error) => console.warn('border-beam:', error.message));
  function working(state) {
    if (!state.typing) {
      workStarted = 0;
      clearTimeout(beamTimer);
      beamTimer = 0;
      beam?.update({ active: false });
      if (orbState) { avatar.querySelector('.orb')?.remove(); avatarIcon.hidden = false; orbState = null; }
      avatar.classList.remove('busy');
      return;
    }
    if (!workStarted) {
      workStarted = Date.now();
      if (!reducedMotion()) beamTimer = setTimeout(() => { beamTimer = -1; beam?.update({ active: true }); }, BEAM_AFTER_MS);
    }
    const next = orbStateOf(state.messages.at(-1));
    if (next === orbState) return;
    orbState = next;
    avatar.querySelector('.orb')?.remove();
    const orb = thinkingOrb(next, { size: 20, label: strings.chat.orbLabels[next] ?? strings.chat.thinking });
    orb.style.animationDelay = `${ORB_AFTER_MS - (Date.now() - workStarted)}ms`; // appears 2 s after it started
    avatar.appendChild(orb);
    avatar.classList.add('busy');
  }

  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_PX)}px`;
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (vm.store.state.typing || !input.value.trim()) return; // keep the text until it can be sent
    vm.send(input.value);
    input.value = '';
    grow();
  });
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  toggle.addEventListener('click', () => vm.toggleMinimized());
  setInterval(() => tickRunTimers(body), 1000);

  // Suggestions to start writing: a click fills the box (the person can edit before sending)
  const suggest = $('chat-suggest');
  suggest.setAttribute('aria-label', strings.chat.followUpsTitle);
  const fillSuggestions = (mode) => suggest.replaceChildren(...strings.chat.followUps[mode].map((text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.textContent = text;
    b.addEventListener('click', () => {
      input.value = text;
      grow();
      input.focus();
      input.setSelectionRange(text.length, text.length);
      updateSuggest();
    });
    return b;
  }));

  // Vibe / Dev: how the agent talks (plain words or technical detail). Lives in the composer bar.
  const voice = document.createElement('div');
  voice.className = 'voice-switch';
  voice.setAttribute('role', 'radiogroup');
  voice.setAttribute('aria-label', strings.chat.voice.label);
  const voiceButtons = ['vibe', 'tech'].map((mode) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.mode = mode;
    b.title = strings.chat.voice.hints[mode];
    b.setAttribute('aria-label', strings.chat.voice.names[mode]);
    b.appendChild(icon(mode === 'vibe' ? 'vibe' : 'dev', { size: 14 }));
    b.addEventListener('click', () => modeModel?.set(mode));
    voice.appendChild(b);
    return b;
  });
  if (modeModel) $('agent-picker').before(voice);
  const applyMode = (mode) => {
    voice.dataset.mode = mode;
    voiceButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    input.placeholder = strings.chat.placeholders[mode];
    fillSuggestions(mode);
  };
  if (modeModel) modeModel.store.subscribe(({ mode }) => applyMode(mode), { immediate: true });
  else fillSuggestions('vibe');
  const updateSuggest = () => {
    const { welcome, typing, chips: next } = vm.store.state;
    // the agent's own next steps (chips) take the place of the generic suggestions
    suggest.hidden = welcome || typing || input.value.trim().length > 0 || Boolean(next?.length);
  };
  input.addEventListener('input', updateSuggest);
  vm.store.subscribe(updateSuggest, { immediate: true });

  vm.store.subscribe(render, { immediate: true });

  // Header: which agent is answering (the demo or the user's own subscription)
  const status = root.querySelector('.chat-title span');
  connection?.store.subscribe((state) => {
    const agent = state.agents.find((a) => a.id === state.selected);
    status.textContent = agent ? `${agent.label} · ${strings.connect.efforts[state.effort]}` : strings.chat.online;
  }, { immediate: true });
}
