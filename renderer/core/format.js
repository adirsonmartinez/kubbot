export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Stable number from a string (so each folder always gets the same lit windows)
export const hashString = (text) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
