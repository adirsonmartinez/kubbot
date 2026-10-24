// Git access: read-only history AND write operations (commit, rollback, branch, checkout, reset).
// All calls use execFile with fixed arguments — no shell, no interpolation. Nothing from the
// renderer's input ever lands in a command-line string directly.

const { execFile } = require('node:child_process');

const MAX_COMMITS = 300;
const FIELD = '\x1f';
const RECORD = '\x1e';

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

const tryGit = (cwd, args) => git(cwd, args).catch(() => '');

// "A\tpath", "M\tpath", "R100\told\tnew" -> { status, path }
function parseNameStatus(line) {
  const [code, ...paths] = line.split('\t');
  if (!code || !paths.length) return null;
  return { status: code[0], path: paths[paths.length - 1] };
}

function parseLog(stdout) {
  return stdout.split(RECORD).filter((r) => r.trim()).map((record) => {
    const [header, ...lines] = record.split('\n');
    const [sha, parents, refs, subject, author, time] = header.split(FIELD);
    return {
      sha,
      parents: parents ? parents.split(' ') : [],
      refs,
      subject,
      author,
      date: Number(time) * 1000,
      files: lines.map(parseNameStatus).filter(Boolean),
    };
  });
}

// refname<FIELD>objectname<FIELD>*objectname (the last one is set for annotated tags)
function parseRefs(stdout) {
  return stdout.split('\n').filter(Boolean).map((line) => {
    const [name, object, peeled] = line.split(FIELD);
    return { name, sha: peeled || object };
  });
}

// { isRepo, error?, head: { branch, sha }, branches: [{ name, sha, remote }], tags: [{ name, sha }], commits: [...] }
async function readGitHistory(cwd) {
  if (!cwd) return { isRepo: false };
  try {
    const inside = (await git(cwd, ['rev-parse', '--is-inside-work-tree'])).trim();
    if (inside !== 'true') return { isRepo: false };
  } catch (error) {
    return { isRepo: false, error: error.code === 'ENOENT' ? 'git-missing' : undefined };
  }

  const refFormat = '--format=%(refname:short)%1f%(objectname)%1f%(*objectname)'; // %1f = FIELD
  const [log, heads, remotes, tags, branch, headSha] = await Promise.all([
    tryGit(cwd, ['log', '--all', '--date-order', `--max-count=${MAX_COMMITS}`, '--name-status',
      `--format=${RECORD}%H${FIELD}%P${FIELD}%D${FIELD}%s${FIELD}%an${FIELD}%at`]),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/heads']),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/remotes']),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/tags']),
    tryGit(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']),
    tryGit(cwd, ['rev-parse', '-q', '--verify', 'HEAD']),
  ]);

  return {
    isRepo: true,
    head: { branch: branch.trim() || null, sha: headSha.trim() || null },
    branches: [
      ...parseRefs(heads).map((b) => ({ ...b, remote: false })),
      ...parseRefs(remotes).filter((b) => !b.name.endsWith('/HEAD') && b.name.includes('/')).map((b) => ({ ...b, remote: true })),
    ],
    tags: parseRefs(tags),
    commits: parseLog(log),
  };
}

// ---- Write operations ----
// Every operation validates the workspace root exists and returns { ok, data } | { ok: false, error }.

async function gitWrite(cwd, args) {
  if (!cwd) return { ok: false, error: 'no-workspace' };
  try {
    const out = await git(cwd, args);
    return { ok: true, data: out.trim() };
  } catch (err) {
    return { ok: false, error: err.stderr?.trim() || err.message || String(err) };
  }
}

// Stage all changes and create a commit with the given message.
async function gitCommit(cwd, message) {
  if (!message || !message.trim()) return { ok: false, error: 'empty-message' };
  // Stage everything (including new files, respecting .gitignore).
  const stage = await gitWrite(cwd, ['add', '--all']);
  if (!stage.ok) return stage;
  return gitWrite(cwd, ['commit', '--message', message.trim()]);
}

// Create a revert commit for the given SHA (non-interactive, no auto-commit edits).
async function gitRevert(cwd, sha) {
  if (!sha) return { ok: false, error: 'no-sha' };
  // --no-edit: don't open an editor. --no-gpg-sign: skip signing in CI/demo environments.
  return gitWrite(cwd, ['revert', '--no-edit', '--no-gpg-sign', sha]);
}

// Hard reset HEAD to the given SHA. WARNING: discards all uncommitted changes.
async function gitReset(cwd, sha) {
  if (!sha) return { ok: false, error: 'no-sha' };
  return gitWrite(cwd, ['reset', '--hard', sha]);
}

// Create a new local branch from the current HEAD.
async function gitCreateBranch(cwd, name) {
  if (!name || !name.trim()) return { ok: false, error: 'empty-name' };
  // Validate: only alphanumeric, dash, underscore and slash (git flow prefixes)
  if (!/^[\w./-]+$/.test(name.trim())) return { ok: false, error: 'invalid-name' };
  return gitWrite(cwd, ['checkout', '-b', name.trim()]);
}

// Checkout an existing branch or SHA.
async function gitCheckout(cwd, target) {
  if (!target || !target.trim()) return { ok: false, error: 'empty-target' };
  return gitWrite(cwd, ['checkout', target.trim()]);
}

// Returns the one-line log for a SHA (for confirmation messages).
async function gitShowShort(cwd, sha) {
  return gitWrite(cwd, ['log', '--oneline', '-1', sha]);
}

module.exports = { readGitHistory, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort };
