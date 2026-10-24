export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Stable number from a string (so each folder always gets the same lit windows)
export const hashString = (text) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Calendar days between a date (ISO string) and now: 0 = today, 1 = yesterday. null when there is no valid date.
const DAY_MS = 86400000;
export function daysAgo(iso, now = new Date()) {
  const then = new Date(iso);
  if (!iso || Number.isNaN(then.getTime())) return null;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((startOf(now) - startOf(then)) / DAY_MS));
}
