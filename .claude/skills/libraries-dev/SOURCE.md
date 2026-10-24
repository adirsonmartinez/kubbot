# Source

Copied unchanged from https://github.com/Jakubantalik/Libraries.dev/tree/main/skills/libraries-dev
(commit b0e5a8f, MIT license). Update by copying the folder again; do not edit these files here.

How Platanus uses it (plain JS renderer, no React):
- Thinking orbs: through the package's framework-free engine, `renderer/views/ui/thinkingOrb.js`.
- Border beam: React-only, bundled with React into `renderer/vendor/border-beam.js` by `scripts/vendor-ui.js`
  (runs before `npm start`, `npm run dev`, `npm run build:web` and the installers).
