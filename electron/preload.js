// Bridge between the window and the main process. The page can only use what is exposed here,
// e.g. window.platanus.mkdir('src'), never Node or the disk directly.

const { contextBridge, ipcRenderer } = require('electron');

// Lets the CSS leave room for the macOS window buttons and hide the in-app menu, which lives in the
// system menu bar on macOS (see styles/shell.css)
window.addEventListener('DOMContentLoaded', () => {
  if (process.platform === 'darwin') document.documentElement.classList.add('is-mac');
});

const on = (channel) => (callback) => {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('platanus', {
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  createWorkspace: () => ipcRenderer.invoke('workspace:create'),
  currentWorkspace: () => ipcRenderer.invoke('workspace:current'),
  closeWorkspace: () => ipcRenderer.invoke('workspace:close'),
  recentWorkspaces: () => ipcRenderer.invoke('workspace:recent'),
  openRecentWorkspace: (root) => ipcRenderer.invoke('workspace:openRecent', root),

  tree: (rel = '.') => ipcRenderer.invoke('fs:tree', rel),
  read: (rel) => ipcRenderer.invoke('fs:read', rel),
  mkdir: (rel) => ipcRenderer.invoke('fs:mkdir', rel),
  write: (rel, content) => ipcRenderer.invoke('fs:write', rel, content),
  remove: (rel) => ipcRenderer.invoke('fs:delete', rel),

  gitHistory: () => ipcRenderer.invoke('git:history'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitRevert: (sha) => ipcRenderer.invoke('git:revert', sha),
  gitReset: (sha) => ipcRenderer.invoke('git:reset', sha),
  gitCreateBranch: (name) => ipcRenderer.invoke('git:createBranch', name),
  gitCheckout: (target) => ipcRenderer.invoke('git:checkout', target),
  onGitChanged: on('git:changed'), // ({ op, sha?, name?, target?, data }) => ...

  auditLog: () => ipcRenderer.invoke('audit:list'),

  // Servers listening on this computer: list, open at http://localhost:<port> (default browser, an installed
  // one by id, or 'other' to pick an app) and stop (the main process asks first)
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    browsers: () => ipcRenderer.invoke('servers:browsers'),
    open: (port, browser) => ipcRenderer.invoke('servers:open', port, browser),
    stop: (port) => ipcRenderer.invoke('servers:stop', port),
    pause: (port) => ipcRenderer.invoke('servers:pause', port),
    resume: (port) => ipcRenderer.invoke('servers:resume', port),
    // Stopped from Platanus: reactivate inside the app (asks first), cancel a start or forget, by the id
    // the main process gave; output of a server Platanus started, by port or by that id
    stopped: () => ipcRenderer.invoke('servers:stopped'),
    restart: (id) => ipcRenderer.invoke('servers:restart', id),
    cancelStart: (id) => ipcRenderer.invoke('servers:cancelStart', id),
    forget: (id) => ipcRenderer.invoke('servers:forget', id),
    output: (key) => ipcRenderer.invoke('servers:output', key),
  },

  // The user's own agent (subscription CLIs) and the local MCP server it talks to
  agents: {
    detect: () => ipcRenderer.invoke('agents:detect'),
    login: (id) => ipcRenderer.invoke('agents:login', id),
    run: (req) => ipcRenderer.invoke('agents:run', req),
    cancel: (runId) => ipcRenderer.invoke('agents:cancel', runId),
    onEvent: on('agents:event'), // ({ runId, type: 'text'|'tool'|'error'|'done', ... }) => ...
  },
  mcp: {
    info: () => ipcRenderer.invoke('mcp:info'),
    onStatus: on('mcp:status'),
    onRequest: on('mcp:request'), // ({ id, tool, args }) => reply({ id, ok, data | error })
    reply: (payload) => ipcRenderer.invoke('mcp:reply', payload),
    onScore: on('agent:score'), // ({ path, level, reason }) => ...
    onChanged: on('agent:changed'), // ({ path, reason, created, backup, at }) => ...
    undo: (change) => ipcRenderer.invoke('agent:undo', change),
  },
  onMenuAction: on('menu:action'), // ({ action: 'newProject'|'openProject'|'openRecent'|'closeProject', root? }) => ...
  onChanged: on('fs:changed'), // (paths) => ...
  onAudit: on('audit'),        // (entry) => ...
});
