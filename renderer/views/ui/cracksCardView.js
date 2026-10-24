// Cracks card: floating card on the map (top-right) showing open security cracks.
// Reads only; forwards repair and "see all" callbacks.
import { strings } from '../../i18n/es.js';

const C = strings.cracksCard;

/* --- tiny DOM helpers (same pattern as shellView.js) --- */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createCracksCardView({ container, shellViewModel, repairHistory, onRepair, onSeeAll }) {
  let collapsed = false;
  let unsubVm, unsubHist;

  function render(state) {
    // Hidden when no project is open or we are not on the map stage
    const visible = state.open && state.stage === 'map';
    container.hidden = !visible;
    if (!visible) return;

    const { risks } = state;
    const cracks = risks.filter((r) => r.level === 'red' || r.level === 'yellow');
    const n = cracks.length;

    // verified repairs count
    const verified = repairHistory.store.state.entries.filter(
      (e) => e.status === 'verified'
    ).length;
    const total = verified + n;
    const pct = total > 0 ? Math.round((verified / total) * 100) : 100;

    // ---- build ----
    container.replaceChildren();
    container.classList.add('cracks-card');

    // — Header (always shown) —
    const header = el('div', 'cracks-card__header');
    header.appendChild(el('strong', 'cracks-card__title', n > 0 ? C.title(n) : C.allGood));
    header.appendChild(el('span', 'cracks-card__progress', n > 0 ? `${verified}/${total}` : '—'));
    container.appendChild(header);

    // — Progress bar (start at 0 so the CSS transition animates in) —
    const barWrap = el('div', 'cracks-card__bar-wrap');
    const bar = el('div', 'cracks-card__bar');
    bar.style.width = '0%';
    barWrap.appendChild(bar);
    container.appendChild(barWrap);

    // — Crack cards (up to 2, red first) —
    const show = collapsed ? 0 : cracks.slice(0, 2);
    show.forEach((r, i) => {
      const card = el('div', `crack-card ${r.level}`);
      card.style.animationDelay = `${i * 60}ms`;

      const head = el('div', 'crack-card__head');
      head.appendChild(el('span', `crack-dot ${r.level}`));
      head.appendChild(el('span', 'crack-card__name', r.name));
      head.appendChild(el('span', `crack-card__severity ${r.level}`, C.severity[r.level] ?? r.level));
      card.appendChild(head);

      const btn = el('button', 'crack-card__btn', C.repair);
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onRepair(r.path, btn);
      });
      card.appendChild(btn);
      container.appendChild(card);
    });

    // — "see all" pill —
    const rest = n - show.length;
    if (rest > 0) {
      const pill = el('button', 'cracks-card__see-all', C.seeAll(rest));
      pill.type = 'button';
      pill.addEventListener('click', () => onSeeAll());
      container.appendChild(pill);
    }

    // — Collapse toggle —
    const toggleBtn = el('button', 'cracks-card__collapse', C.collapse);
    toggleBtn.type = 'button';
    toggleBtn.addEventListener('click', () => {
      collapsed = true;
      render(shellViewModel.store.state);
    });
    container.appendChild(toggleBtn);

    // — Staggered entrance via the .enter class —
    requestAnimationFrame(() => {
      bar.style.width = `${pct}%`;  // triggers width transition
    });
    container.classList.add('enter');
    setTimeout(() => container.classList.remove('enter'), 500);
  }

  // --- subscriptions ---
  unsubVm = shellViewModel.store.subscribe((state) => render(state), { immediate: true });
  unsubHist = repairHistory.store.subscribe(() => render(shellViewModel.store.state), { immediate: true });

  return {
    destroy() {
      unsubVm?.();
      unsubHist?.();
    },
  };
}