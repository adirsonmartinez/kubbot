// Entry bundled by scripts/vendor-ui.js into renderer/vendor/border-beam.js (with React inside).
// border-beam (libraries.dev) is a React component; the renderer is plain JS, so this exposes one
// function that wraps an existing element in the beam.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BorderBeam } from 'border-beam';

// Wraps `target` (already in the page) in a BorderBeam. Returns { update(props), destroy() }.
export function mountBorderBeam(target, props = {}) {
  const host = document.createElement('div');
  host.className = 'beam-host';
  target.before(host);
  const root = createRoot(host);
  let current = props;
  // The slot has no React children, so React never touches what we move into it
  const render = () => root.render(createElement(BorderBeam, current, createElement('div', { className: 'beam-slot' })));
  flushSync(render);
  host.querySelector('.beam-slot').appendChild(target);
  return {
    update(next) { current = { ...current, ...next }; render(); },
    destroy() { host.before(target); root.unmount(); host.remove(); },
  };
}
