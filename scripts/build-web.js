// Builds the static web demo into dist/ (deployed to Vercel).
// The renderer already runs in a plain browser with a demo project; this only copies it and
// vendors three.js so the site does not depend on node_modules.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = path.join(root, 'renderer');
const dist = path.join(root, 'dist');
const threeSource = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');

const IMPORT_MAP_FROM = '"three": "../node_modules/three/build/three.module.js"';
const IMPORT_MAP_TO = '"three": "./vendor/three.module.js"';
const ADDONS_FROM = '"three/addons/": "../node_modules/three/examples/jsm/"';
const ADDONS_TO = '"three/addons/": "./vendor/addons/"';
// three.js addons the app imports (and what they import)
const ADDONS = ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js'];

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(renderer, dist, { recursive: true });

fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
fs.copyFileSync(threeSource, path.join(dist, 'vendor', 'three.module.js'));
for (const addon of ADDONS) {
  const target = path.join(dist, 'vendor', 'addons', addon);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'node_modules', 'three', 'examples', 'jsm', addon), target);
}
fs.rmSync(path.join(dist, 'package.json'), { force: true }); // only for Node's test runner
fs.copyFileSync(path.join(root, 'project-logo.png'), path.join(dist, 'favicon.png'));

const indexPath = path.join(dist, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes(IMPORT_MAP_FROM)) throw new Error('Import map for three.js not found in renderer/index.html');
fs.writeFileSync(
  indexPath,
  html
    .replace(IMPORT_MAP_FROM, IMPORT_MAP_TO)
    .replace(ADDONS_FROM, ADDONS_TO)
    .replace('<title>', '<link rel="icon" type="image/png" href="favicon.png" />\n  <title>')
);

console.log(`Web demo built in ${path.relative(root, dist)}/`);
