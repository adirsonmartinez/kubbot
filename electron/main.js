// Electron main process: creates the window and is the only part that touches the disk.
// The window (renderer) asks for things over IPC and they are validated here before running.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { Workspace } = require('./workspace');
const t = require('./strings');

const workspace = new Workspace();
const audit = []; // log of everything done on disk
let win = null;

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
  const root = await workspace.open(res.filePaths[0]);
  workspace.watch((paths) => send('fs:changed', paths));
  log('workspace:open', root, true);
  return { ok: true, data: { root, name: path.basename(root) } };
});

ipcMain.handle('workspace:current', () => ({
  ok: true,
  data: workspace.root ? { root: workspace.root, name: path.basename(workspace.root) } : null,
}));

ipcMain.handle('audit:list', () => ({ ok: true, data: audit }));

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  workspace.unwatch();
  if (process.platform !== 'darwin') app.quit();
});
