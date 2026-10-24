// Builds renderer/vendor/: the UI libraries as plain ES modules the renderer loads without a bundler.
//   border-beam.js        border-beam + React in one file (libraries.dev; the package is React-only)
//   thinking-orbs/        the thinking-orbs engine (framework-free part of the package)
//   hugeicons/            only the Hugeicons named in renderer/views/ui/icons.js
// The folder is committed, so clones, the web demo and the installers need no build step.
// Run it after adding an icon or updating one of these packages: `npm run vendor` (npm start does it too).
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'renderer', 'vendor');
const modules = path.join(root, 'node_modules');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'hugeicons'), { recursive: true });
fs.mkdirSync(path.join(out, 'thinking-orbs'), { recursive: true });

require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'vendor', 'borderBeam.entry.js')],
  outfile: path.join(out, 'border-beam.js'),
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

const iconsSource = path.join(modules, '@hugeicons', 'core-free-icons', 'dist', 'esm');
const used = [...fs.readFileSync(path.join(root, 'renderer', 'views', 'ui', 'icons.js'), 'utf8').matchAll(/'@hugeicons\/(\w+\.js)'/g)].map((m) => m[1]);
used.forEach((f) => fs.copyFileSync(path.join(iconsSource, f), path.join(out, 'hugeicons', f)));

fs.writeFileSync(path.join(out, 'README.md'), `# vendor (generated, do not edit)

Built by \`scripts/vendor-ui.js\` (\`npm run vendor\`). Licenses: border-beam, thinking-orbs (libraries.dev,
MIT), React (MIT, notices at the end of border-beam.js), Hugeicons free set (MIT).
`);
console.log(`renderer/vendor: border-beam, thinking-orbs engine, ${used.length} icons`);
