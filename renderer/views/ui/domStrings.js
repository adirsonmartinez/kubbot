// Fills static HTML from the strings file:
//   data-i18n="chat.agentName"          -> textContent
//   data-i18n-title / -aria / -placeholder -> title / aria-label / placeholder
import { strings } from '../../i18n/es.js';

const lookup = (path) => path.split('.').reduce((node, key) => node?.[key], strings);

export function applyStrings(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = lookup(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = lookup(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', lookup(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = lookup(el.dataset.i18nPlaceholder); });
}
