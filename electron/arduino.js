// Arduino in the main process (spec/005-arduino-lab.md):
//   · compiling a sketch with the person's arduino-cli: execFile (no shell), an absolute path found on
//     disk, fixed arguments, the board from a closed list, the sketch copied to a temporary folder
//     (arduino-cli wants the folder named like the .ino, and the build stays out of the project);
//   · checking a GitHub repository for the agent: only a GET to api.github.com/repos/{owner}/{repo},
//     names checked, 5 s, 100 KB, no token, and only a few fields come back (never the README: what the
//     web says is data, not instructions).
// Pure helpers are exported for electron/arduino.test.js; the process and network calls are injectable.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFile } = require('node:child_process');

const BOARDS = ['arduino:avr:uno', 'arduino:avr:nano', 'arduino:avr:mega'];
const COMPILE_TIMEOUT_MS = 120000;
const MAX_SKETCH = 200 * 1024;
const MAX_ERROR_LINES = 20;
const GITHUB = { host: 'api.github.com', timeoutMs: 5000, maxBytes: 100 * 1024 };
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

// Where arduino-cli may be: the usual install folders, then PATH (absolute folders only)
function cliCandidates({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const name = platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
  const dirs = [
    ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : []),
    ...(platform === 'linux' ? ['/usr/local/bin', '/usr/bin', path.join(home, 'bin'), path.join(home, '.local', 'bin')] : []),
    ...(platform === 'win32' ? [path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Arduino CLI'), path.join(env.LOCALAPPDATA ?? home, 'Programs', 'arduino-cli')] : []),
    ...String(env.PATH ?? '').split(path.delimiter).filter((d) => d && path.isAbsolute(d)),
  ];
  return [...new Set(dirs)].map((d) => path.join(d, name));
}

const isExecutable = (file) => {
  try { fsSync.accessSync(file, fsSync.constants.X_OK); return fsSync.statSync(file).isFile(); } catch { return false; }
};

function findArduinoCli({ exists = isExecutable, ...where } = {}) {
  return cliCandidates(where).find(exists) ?? null;
}

// Always the same shape: nothing the page or the agent sends becomes a flag
function compileArgs({ fqbn, sketchDir, outDir }) {
  if (!BOARDS.includes(fqbn)) throw new Error('board');
  return ['compile', '--fqbn', fqbn, '--output-dir', outDir, '--no-color', sketchDir];
}

// The compiler's output -> the lines that say what is wrong, with the temporary path hidden
function summarizeErrors(output, tmp) {
  const lines = String(output ?? '').split(/\r?\n/).map((l) => (tmp ? l.split(tmp).join('') : l).replace(/^[\\/]?sketch[\\/]/, ''));
  const errors = lines.filter((l) => /error|Error|undefined reference|not declared/.test(l));
  return (errors.length ? errors : lines.filter(Boolean)).slice(0, MAX_ERROR_LINES);
}

// A sketch may come from an agent: the compiler must not read files outside it. An #include with a path
// (or `..`), or assembler that pulls a file in (.incbin / .include), could put a secret into the errors or
// the .hex (and from there, via the emulator's serial output, back to the agent). Library and system
// headers (<Servo.h>, <avr/io.h>) and a local "header.h" are fine.
function unsafeSource(source) {
  for (const m of source.matchAll(/#\s*include(?:_next)?\s*([<"])([^>"\n]*)[>"]/g)) {
    const [, open, name] = m;
    if (name.includes('..') || /^[\\/~]|^[A-Za-z]:/.test(name) || (open === '"' && /[\\/]/.test(name))) return `#include ${open}${name}`;
  }
  if (/\.incbin|\.include\b|__has_include_next/.test(source)) return '.incbin / .include';
  return null;
}

const run = (file, args, options) => new Promise((resolve) => {
  execFile(file, args, options, (error, stdout, stderr) => resolve({ error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
});

// source: the .ino text; fqbn: one of BOARDS -> { ok: true, hex, bytes } | { ok: false, error, lines }
async function compileSketch({ cli, source, fqbn, exec = run }) {
  if (!cli) return { ok: false, error: 'noCli', lines: [] };
  if (!BOARDS.includes(fqbn)) return { ok: false, error: 'board', lines: [] };
  if (typeof source !== 'string' || !source.trim()) return { ok: false, error: 'empty', lines: [] };
  if (Buffer.byteLength(source) > MAX_SKETCH) return { ok: false, error: 'tooLarge', lines: [] };
  const unsafe = unsafeSource(source);
  if (unsafe) return { ok: false, error: 'unsafe', lines: [unsafe] };
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qubbot-arduino-'));
  try {
    const sketchDir = path.join(tmp, 'sketch');
    const outDir = path.join(tmp, 'out');
    await fs.mkdir(sketchDir);
    await fs.writeFile(path.join(sketchDir, 'sketch.ino'), source);
    const result = await exec(cli, compileArgs({ fqbn, sketchDir, outDir }), { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true });
    const output = `${result.stderr}\n${result.stdout}`;
    if (result.error) {
      if (/platform .*not (found|installed)|Platform 'arduino:avr' not found|core.*not installed/i.test(output)) return { ok: false, error: 'noCore', lines: [] };
      if (result.error.killed) return { ok: false, error: 'timeout', lines: [] };
      return { ok: false, error: 'compile', lines: summarizeErrors(output, tmp) };
    }
    const hex = await fs.readFile(path.join(outDir, 'sketch.ino.hex'), 'utf8');
    return { ok: true, hex, bytes: Buffer.byteLength(hex) };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// GET https://api.github.com/<pathname> -> { status, location, body } (body capped)
function httpsGet(pathname, { timeoutMs = GITHUB.timeoutMs, maxBytes = GITHUB.maxBytes } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: GITHUB.host, path: pathname, headers: { 'User-Agent': 'Qubbot-IDE', Accept: 'application/vnd.github+json' }, timeout: timeoutMs }, (res) => {
      let size = 0;
      const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(new Error('tooLarge')); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location ?? null, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// { owner, repo } -> { exists, fullName, description, license, archived, pushedAt, url, moved } | { exists: false }
async function githubRepo({ owner, repo }, { get = httpsGet } = {}) {
  if (!OWNER.test(String(owner)) || !REPO.test(String(repo)) || repo === '.' || repo === '..') return { error: 'badName' };
  let res;
  try {
    res = await get(`/repos/${owner}/${repo}`);
    // A renamed or moved repository answers 301 with its new API address: follow it once, on GitHub only
    if (res.status === 301 || res.status === 302) {
      const next = new URL(res.location ?? '', `https://${GITHUB.host}`);
      if (next.protocol !== 'https:' || next.host !== GITHUB.host) return { error: 'badRedirect' };
      res = await get(next.pathname);
    }
  } catch (err) {
    return { error: err.message === 'timeout' ? 'timeout' : 'network' };
  }
  if (res.status === 404) return { exists: false };
  if (res.status === 403 || res.status === 429) return { error: 'rateLimited' };
  if (res.status !== 200) return { error: `status ${res.status}` };
  let data;
  try { data = JSON.parse(res.body); } catch { return { error: 'badResponse' }; }
  const fullName = String(data.full_name ?? '');
  return {
    exists: true,
    fullName,
    description: String(data.description ?? '').slice(0, 200),
    license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION' ? data.license.spdx_id : null,
    archived: Boolean(data.archived),
    pushedAt: data.pushed_at ?? null,
    url: typeof data.html_url === 'string' && data.html_url.startsWith('https://github.com/') ? data.html_url : `https://github.com/${fullName}`,
    moved: fullName.toLowerCase() !== `${owner}/${repo}`.toLowerCase(),
  };
}

module.exports = { BOARDS, cliCandidates, findArduinoCli, compileArgs, compileSketch, summarizeErrors, unsafeSource, githubRepo };
