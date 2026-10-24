// Renders ChatViewModel: messages (appended incrementally to keep the scroll), "typing…", chips.
import { strings } from '../../i18n/es.js';

const ICON_MINIMIZE = '<path d="M6 12h12"/>';
const ICON_EXPAND = '<path d="M6 12h12M12 6v12"/>';

export function createChatView({ chatViewModel: vm, connection = null }) {
  const $ = (id) => document.getElementById(id);
  const root = $('chat'), body = $('chat-body'), form = $('chat-form'), input = $('chat-text');
  const sendButton = $('chat-send'), toggle = $('chat-toggle');
  const rendered = new Set(); // message ids already in the DOM

  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  typing.innerHTML = '<i></i><i></i><i></i>';

  const chips = document.createElement('div');
  chips.className = 'chips';

  function messageElement({ role, text, html, tone }) {
    const el = document.createElement('div');
    el.className = ['msg', role, tone].filter(Boolean).join(' ');
    if (html) el.innerHTML = html; // only our own strings, never user input
    else el.textContent = text ?? '';
    return el;
  }

  function render(state, previous) {
    state.messages.forEach((m) => {
      if (rendered.has(m.id)) return;
      rendered.add(m.id);
      body.appendChild(messageElement(m));
    });

    typing.remove();
    chips.remove();
    if (state.typing) body.appendChild(typing);
    if (state.chips?.length) {
      if (state.chips !== previous?.chips) {
        chips.replaceChildren(...state.chips.map((label) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.addEventListener('click', () => vm.send(label));
          return button;
        }));
      }
      body.appendChild(chips);
    }
    body.scrollTop = body.scrollHeight;

    sendButton.disabled = state.typing;
    root.classList.toggle('min', state.minimized);
    toggle.setAttribute('aria-expanded', String(!state.minimized));
    toggle.title = state.minimized ? strings.chat.expand : strings.chat.minimize;
    toggle.querySelector('svg').innerHTML = state.minimized ? ICON_EXPAND : ICON_MINIMIZE;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    vm.send(input.value);
    input.value = '';
  });
  toggle.addEventListener('click', () => vm.toggleMinimized());

  vm.store.subscribe(render, { immediate: true });

  // Header: which agent is answering (the demo or the user's own subscription)
  const status = root.querySelector('.chat-title span');
  connection?.store.subscribe((state) => {
    const agent = state.agents.find((a) => a.id === state.selected);
    status.textContent = agent ? `${agent.label} · ${strings.connect.efforts[state.effort]}` : strings.chat.online;
  }, { immediate: true });
}
