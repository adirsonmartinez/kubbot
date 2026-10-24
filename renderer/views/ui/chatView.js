// Renders ChatViewModel: messages (appended incrementally to keep the scroll; a streaming answer
// updates its bubble in place), "thinking…", chips, and the composer (Enter sends, Shift+Enter breaks).
import { strings } from '../../i18n/es.js';
import { markdownToHtml } from './markdown.js';
import { renderRunCard, tickRunTimers } from './runCardView.js';

const ICON_MINIMIZE = '<path d="M6 12h12"/>';
const ICON_EXPAND = '<path d="M6 12h12M12 6v12"/>';
const MAX_INPUT_PX = 160;

export function createChatView({ chatViewModel: vm, connection = null }) {
  const $ = (id) => document.getElementById(id);
  const root = $('chat'), body = $('chat-body'), form = $('chat-form'), input = $('chat-text');
  const sendButton = $('chat-send'), toggle = $('chat-toggle');
  const rendered = new Map(); // message id -> { el, text }

  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  typing.innerHTML = '<i></i><i></i><i></i>';

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
    mark.textContent = 'P';
    const title = document.createElement('h2');
    title.textContent = state.projectName ? strings.chat.welcomeTitle(state.projectName) : strings.chat.welcomeNoProject;
    const text = document.createElement('p');
    text.textContent = strings.chat.welcomeBody;
    const list = document.createElement('div');
    list.className = 'chat-hero-list';
    const options = [...(state.chips ?? []), ...(state.projectName ? strings.chat.prompts : [])];
    for (const option of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = typeof option === 'string' ? option : option.label;
      if (typeof option !== 'string') b.classList.add('action');
      b.addEventListener('click', () => vm.choose(option, b));
      list.appendChild(b);
    }
    hero.replaceChildren(mark, title, text, list);
  }

  // Agent answers are Markdown (escaped first, see markdown.js); the person's own text stays plain
  function fill(el, { role, text, html, thinking }) {
    if (html) { el.innerHTML = html; return; } // only our own strings, never user input
    if (role !== 'bot') { el.textContent = text ?? ''; return; }
    const parts = [];
    if (thinking) {
      parts.push(`<details class="reasoning"${text ? '' : ' open'}><summary>${strings.chat.reasoning}</summary><div>${markdownToHtml(thinking)}</div></details>`);
    }
    parts.push(text ? `<div class="md">${markdownToHtml(text)}</div>` : thinking ? '' : `<div class="md">${strings.chat.thinking}</div>`);
    const open = el.querySelector('details.reasoning')?.open;
    el.innerHTML = parts.join('');
    if (open !== undefined && text) el.querySelector('details.reasoning').open = open; // keep what the person chose
  }

  function messageElement(m) {
    const el = document.createElement('div');
    el.className = ['msg', m.role, m.tone, m.run && 'run'].filter(Boolean).join(' ');
    paint(el, m);
    return el;
  }

  const paint = (el, m) => (m.run ? renderRunCard(el, m) : fill(el, m));

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
        chips.replaceChildren(...state.chips.map((chip) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = typeof chip === 'string' ? chip : chip.label;
          if (typeof chip !== 'string') button.classList.add('action');
          button.addEventListener('click', () => vm.choose(chip, button));
          return button;
        }));
      }
      body.appendChild(chips);
    }
    if (atBottom || state.messages.length !== previous?.messages.length) body.scrollTop = body.scrollHeight;

    sendButton.disabled = state.typing;
    root.classList.toggle('min', state.minimized);
    document.body.classList.toggle('chat-min', state.minimized); // the map takes the chat's column
    toggle.setAttribute('aria-expanded', String(!state.minimized));
    toggle.title = state.minimized ? strings.chat.expand : strings.chat.minimize;
    toggle.querySelector('svg').innerHTML = state.minimized ? ICON_EXPAND : ICON_MINIMIZE;
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
  for (const text of strings.chat.followUps) {
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
    suggest.appendChild(b);
  }
  const updateSuggest = () => {
    const { welcome, typing } = vm.store.state;
    suggest.hidden = welcome || typing || input.value.trim().length > 0;
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
