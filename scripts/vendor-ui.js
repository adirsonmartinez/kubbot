// Builds renderer/vendor/: the UI libraries as plain ES modules the renderer loads without a bundler.
//   react-ui.js           border-beam and metal-fx + one React (libraries.dev; both are React-only)
//   thinking-orbs/        the thinking-orbs engine (framework-free part of the package)
//   fonts/                Inter (variable) and Roboto Mono, the libraries.dev typefaces (OFL-1.1), latin only
// The folder is committed, so clones, the web demo and the installers need no build step.
// Run it after updating one of these packages: `npm run vendor`. (Icons have their own: `npm run icons`.)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'renderer', 'vendor');
const modules = path.join(root, 'node_modules');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'thinking-orbs'), { recursive: true });

require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'vendor', 'reactUi.entry.js')],
  outfile: path.join(out, 'react-ui.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'chrome120',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof',
  logLevel: 'warning',
});

const orbs = path.join(modules, 'thinking-orbs', 'dist');
fs.readdirSync(orbs).filter((f) => f === 'engine.es.js' || /^index-[\w-]+\.js$/.test(f))
  .forEach((f) => fs.copyFileSync(path.join(orbs, f), path.join(out, 'thinking-orbs', f)));


// Fonts: served by the app itself (the window's CSP only allows its own files)
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
const fonts = [
  ['@fontsource-variable/inter', ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']],
  ['@fontsource/roboto-mono', ['roboto-mono-latin-400-normal.woff2', 'roboto-mono-latin-500-normal.woff2']],
];
for (const [pkg, files] of fonts) files.forEach((f) => fs.copyFileSync(path.join(modules, pkg, 'files', f), path.join(out, 'fonts', f)));

fs.writeFileSync(path.join(out, 'README.md'), `# vendor (generated, do not edit)

Built by \`scripts/vendor-ui.js\` (\`npm run vendor\`). Licenses: border-beam, metal-fx, thinking-orbs
(libraries.dev, MIT), React (MIT, notices at the end of react-ui.js), Inter and Roboto Mono fonts (SIL OFL 1.1).
`);
console.log('renderer/vendor: react-ui (border-beam, metal-fx), thinking-orbs engine, fonts');
