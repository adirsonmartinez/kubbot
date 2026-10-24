// Electron main process: creates the window and is the only part that touches the disk.
// The window (renderer) asks for things over IPC and they are validated here before running.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Workspace } = require('./workspace');
const { readGitHistory, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort } = require('./git');
const t = require('./strings');
const agents = require('./agents');
const { startMcpServer, MAX_READ_BYTES, isBlockedRealPath } = require('./mcpServer');

const workspace = new Workspace();
const audit = []; // log of everything done on disk
let win = null;
let mcp = { url: null, running: false }; // local MCP server for the user's agent

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: t.windowTitle,
    backgroundColor: '#0a0b0f',
    // macOS: integrated title bar; the window buttons sit inside the app's 44px title bar
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // the page sees neither Node nor Electron, only what preload exposes
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // External links never open new windows inside the app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function log(action, target, ok, detail) {
  const entry = { at: new Date().toISOString(), action, path: target, ok, detail };
  audit.push(entry);
  send('audit', entry);
  return entry;
}

// Wraps each operation: logs it and returns { ok, data } or { ok: false, error }
function handle(channel, action, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      const data = await fn(...args);
      log(action, args[0], true);
      return { ok: true, data };
    } catch (err) {
      log(action, args[0], false, err.message);
      return { ok: false, error: err.message };
    }
  });
}

// --- Workspace ---
ipcMain.handle('workspace:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: t.chooseFolder,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: t.cancelled };
  return openWorkspace(res.filePaths[0]);
});

async function openWorkspace(dir) {
  const root = await workspace.open(dir);
  workspace.watch((paths) => send('fs:changed', paths));
  log('workspace:open', root, true);
  await rememberRecent(root);
  return { ok: true, data: { root, name: path.basename(root) } };
}

// --- Recent projects (only folders the user already chose can be reopened from the window) ---
const MAX_RECENT = 8;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => typeof r?.root === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberRecent(root) {
  const list = (await readRecent()).filter((r) => r.root !== root);
  list.unshift({ root, name: path.basename(root), at: new Date().toISOString() });
  await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, MAX_RECENT), null, 2)).catch(() => {});
}

ipcMain.handle('workspace:recent', async () => {
  const list = await readRecent();
  const alive = await Promise.all(list.map((r) => fs.stat(r.root).then((s) => s.isDirectory(), () => false)));
  return { ok: true, data: list.filter((_r, i) => alive[i]) };
});

ipcMain.handle('workspace:openRecent', async (_e, root) => {
  if (!(await readRecent()).some((r) => r.root === root)) return { ok: false, error: t.notRecent };
  try {
    return await openWorkspace(root);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('workspace:current', () => ({
  ok: true,
  data: workspace.root ? { root: workspace.root, name: path.basename(workspace.root) } : null,
}));

ipcMain.handle('audit:list', () => ({ ok: true, data: audit }));

// --- Git: read ---
ipcMain.handle('git:history', async () => ({ ok: true, data: await readGitHistory(workspace.root) }));

// --- Git: write (each operation is logged; destructive ones require a confirmation dialog) ---
ipcMain.handle('git:commit', async (_e, message) => {
  if (!workspace.root) return { ok: false, error: 'no-workspace' };
  const result = await gitCommit(workspace.root, message);
  log('git:commit', message?.slice(0, 60), result.ok, result.error);
  if (result.ok) send('git:changed', { op: 'commit', data: result.data });
  return result;
});

ipcMain.handle('git:revert', async (_e, sha) => {
  if (!workspace.root) return { ok: false, error: 'no-workspace' };
  const preview = await gitShowShort(workspace.root, sha);
  const desc = preview.ok ? preview.data : sha;
  const confirmed = await confirm(t.gitConfirmRevert(desc), t.gitConfirmRevertDetail);
  if (!confirmed) return { ok: false, error: 'cancelled' };
  const result = await gitRevert(workspace.root, sha);
  log('git:revert', sha, result.ok, result.error);
  if (result.ok) send('git:changed', { op: 'revert', sha, data: result.data });
  return result;
});

ipcMain.handle('git:reset', async (_e, sha) => {
  if (!workspace.root) return { ok: false, error: 'no-workspace' };
  const preview = await gitShowShort(workspace.root, sha);
  const desc = preview.ok ? preview.data : sha;
  const confirmed = await confirm(t.gitConfirmReset(desc), t.gitConfirmResetDetail);
  if (!confirmed) return { ok: false, error: 'cancelled' };
  const result = await gitReset(workspace.root, sha);
  log('git:reset', sha, result.ok, result.error);
  if (result.ok) send('git:changed', { op: 'reset', sha, data: result.data });
  return result;
});

ipcMain.handle('git:createBranch', async (_e, name) => {
  if (!workspace.root) return { ok: false, error: 'no-workspace' };
  const result = await gitCreateBranch(workspace.root, name);
  log('git:createBranch', name, result.ok, result.error);
  if (result.ok) send('git:changed', { op: 'createBranch', name, data: result.data });
  return result;
});

ipcMain.handle('git:checkout', async (_e, target) => {
  if (!workspace.root) return { ok: false, error: 'no-workspace' };
  const result = await gitCheckout(workspace.root, target);
  log('git:checkout', target, result.ok, result.error);
  if (result.ok) send('git:changed', { op: 'checkout', target, data: result.data });
  return result;
});

// --- Files (every path is relative to the workspace) ---
handle('fs:tree', 'tree', (rel) => workspace.tree(rel));
handle('fs:read', 'read', (rel) => workspace.readFile(rel));
handle('fs:mkdir', 'mkdir', (rel) => workspace.mkdir(rel));

// Creating a new file is free; overwriting an existing one asks for confirmation
handle('fs:write', 'write', async (rel, content) => {
  if (await workspace.exists(rel)) {
    const ok = await confirm(t.confirmOverwrite(rel), t.confirmOverwriteDetail);
    if (!ok) throw new Error(t.overwriteRejected);
  }
  await workspace.writeFile(rel, content);
});

// Deleting always asks for confirmation
handle('fs:delete', 'delete', async (rel) => {
  const ok = await confirm(t.confirmDelete(rel), t.confirmDeleteDetail);
  if (!ok) throw new Error(t.deleteRejected);
  await workspace.remove(rel);
});


// --- Local MCP server: the user's agent (Claude Code, Cursor, Codex, Gemini or the chat CLIs) ---
// Tools that need what the window knows (traffic lights, the map) are answered by the renderer.
const pending = new Map();
let requestSeq = 0;

function askRenderer(tool, args) {
  if (!win || win.isDestroyed()) return Promise.reject(new Error(t.mcp.windowClosed));
  const id = ++requestSeq;
  send('mcp:request', { id, tool, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(t.mcp.timeout)); }, 5000);
    pending.set(id, { resolve, reject, timer });
  });
}

ipcMain.handle('mcp:reply', (_e, { id, ok, data, error }) => {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  if (ok) entry.resolve(data);
  else entry.reject(new Error(error));
});

// Paths only, up to 4 levels: enough for the agent to orient itself without dumping the whole disk
function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push(n.type === 'dir' ? `${n.path}/` : n.path);
    if (n.children && depth < 3) flatten(n.children, depth + 1, out);
  }
  return out;
}

const mcpHandlers = {
  platanus_get_project: async () => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    return { name: path.basename(workspace.root), paths: flatten(await workspace.tree('.', 4)).slice(0, 400) };
  },
  platanus_list_risks: () => askRenderer('list_risks', {}),
  platanus_read_file: async ({ path: rel }) => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    const { size } = await fs.stat(abs);
    if (size > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    return workspace.readFile(rel);
  },
  // Every write is approved by the user; the previous version is backed up and can be undone
  platanus_write_file: async ({ path: rel, content, reason }) => {
    const requestedAt = new Date().toISOString(); // before the dialog: tells which agent run asked
    if (!workspace.root) throw new Error(t.mcp.noProject);
    if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    const abs = await workspace.resolve(rel);
    const exists = await workspace.exists(rel);
    await refuseSecretTarget(abs); // new files too: a symlinked parent may lead into .git/ or a secret
    const why = String(reason).slice(0, 300);
    const ok = await confirm(t.mcp.confirmWrite(rel), t.mcp.confirmWriteDetail(why, exists));
    if (!ok) throw new Error(t.mcp.writeRejected);
    const backup = await backupFile(rel, abs, exists);
    await workspace.writeFile(rel, content);
    const change = { path: rel, reason: why, created: !exists, backup, requestedAt, at: new Date().toISOString() };
    send('agent:changed', change);
    return t.mcp.written(rel);
  },
  platanus_set_file_score: ({ path: rel, level, reason }) => {
    send('agent:score', { path: rel, level, reason: String(reason).slice(0, 240) });
    return `${rel}: ${level}`;
  },
  platanus_show_folder: ({ path: rel }) => askRenderer('show_folder', { path: rel }),
};

// A symlink inside the project may point to a secret: check where the path really lands. For a file
// that does not exist yet, resolve its nearest existing parent folder and add the rest of the path.
async function refuseSecretTarget(abs) {
  if (await isBlockedRealPath(workspace.root, abs)) throw new Error(t.mcp.secret);
}

// Agents' changes: ~/.platanus/backups/<id>/meta.json ({ root, rel, created }) + the previous version.
// Main is the only source of truth for undo: the window only says which id to restore.
const BACKUPS = path.join(app.getPath('home'), '.platanus', 'backups');
async function backupFile(rel, abs, exists) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(BACKUPS, id);
  await fs.mkdir(dir, { recursive: true });
  if (exists) await fs.copyFile(abs, path.join(dir, 'previous'));
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ root: workspace.root, rel, created: !exists }));
  return { id };
}

// Undo an agent's change: put the previous version back, or delete a file the agent created (asks first)
ipcMain.handle('agent:undo', async (_e, { path: rel, backup } = {}) => {
  try {
    if (!backup?.id || !/^[\w-]+$/.test(backup.id)) throw new Error(t.mcp.cannotUndo);
    const dir = path.join(BACKUPS, backup.id);
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
    if (meta.root !== workspace.root || meta.rel !== rel) throw new Error(t.mcp.cannotUndo);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    if (!(await confirm(t.mcp.confirmUndo(rel), meta.created ? t.mcp.confirmUndoCreated : t.mcp.confirmUndoDetail))) throw new Error(t.mcp.writeRejected);
    if (meta.created) await workspace.remove(rel);
    else await workspace.writeFile(rel, await fs.readFile(path.join(dir, 'previous'), 'utf8'));
    log('agent:undo', rel, true);
    return { ok: true };
  } catch (err) {
    log('agent:undo', rel, false, err.message);
    return { ok: false, error: err.message };
  }
});

// Private key of the local MCP server: created once, readable only by this user (0600)
async function mcpToken() {
  const file = path.join(app.getPath('userData'), 'mcp-token');
  try {
    const saved = (await fs.readFile(file, 'utf8')).trim();
    if (/^[a-f0-9]{48}$/.test(saved)) return saved;
  } catch { /* first run */ }
  const token = require('node:crypto').randomBytes(24).toString('hex');
  await fs.writeFile(file, token, { mode: 0o600 });
  return token;
}

async function startMcp() {
  const token = await mcpToken();
  const server = await startMcpServer({
    port: Number(process.env.PLATANUS_MCP_PORT) || 7811,
    token,
    handlers: mcpHandlers,
    onCall: ({ tool, args, ok, error }) => log(`mcp:${tool}`, args?.path ?? '', ok, error),
  });
  mcp = { url: `http://127.0.0.1:${server.address().port}/mcp/${token}`, running: true };
  send('mcp:status', mcp);
}

ipcMain.handle('mcp:info', () => ({ ok: true, data: mcp }));

// --- Agents with the user's own subscription ---
ipcMain.handle('agents:detect', async () => ({ ok: true, data: await agents.detect() }));
ipcMain.handle('agents:login', (_e, id) => ({ ok: agents.login(String(id)) }));
ipcMain.handle('agents:run', (_e, req) => {
  if (!mcp.running) return { ok: false, error: t.mcp.windowClosed };
  const runId = `${Date.now()}-${++requestSeq}`;
  const model = /^[a-zA-Z0-9.\-_]{0,40}$/.test(String(req?.model ?? '')) ? String(req.model ?? '') : '';
  const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(req?.effort) ? req.effort : 'low';
  const child = agents.run(
    String(req?.agent),
    { prompt: String(req?.prompt ?? ''), systemPrompt: String(req?.systemPrompt ?? ''), mcpUrl: mcp.url, continued: Boolean(req?.continued), model, effort, session: req?.session === 'repair' ? 'repair' : 'chat' },
    (event) => {
      if (event.type === 'done') agentRuns.delete(runId);
      send('agents:event', { runId, ...event });
    },
  );
  if (child) agentRuns.set(runId, child);
  return { ok: true, data: runId };
});

// Stop a run (Remi's job was closed or timed out): its later writes never happen
const agentRuns = new Map(); // runId -> child process
ipcMain.handle('agents:cancel', (_e, runId) => {
  agentRuns.get(String(runId))?.kill('SIGTERM');
  return { ok: true };
});

async function confirm(message, detail) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [t.cancel, t.allow],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  });
  return response === 1;
}

// `npx electron . --open=/path/to/project` opens that folder at start (the window restores it)
const openArg = process.argv.find((a) => a.startsWith('--open='))?.slice('--open='.length);

app.whenReady().then(async () => {
  if (openArg) await openWorkspace(openArg).catch((err) => log('workspace:open', openArg, false, err.message));
  createWindow();
  startMcp();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  workspace.unwatch();
  if (process.platform !== 'darwin') app.quit();
});
