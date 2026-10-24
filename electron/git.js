// Read-only access to the workspace's git history. Uses execFile (no shell) with fixed arguments,
// so nothing coming from the page ends up in a command line.

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

module.exports = { readGitHistory };
