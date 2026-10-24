// Bridge between the window and the main process. The page can only use what is exposed here,
// e.g. window.platanus.mkdir('src'), never Node or the disk directly.

const { contextBridge, ipcRenderer } = require('electron');

// Lets the CSS leave room for the macOS window buttons (see styles/shell.css)
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
  currentWorkspace: () => ipcRenderer.invoke('workspace:current'),
  recentWorkspaces: () => ipcRenderer.invoke('workspace:recent'),
  openRecentWorkspace: (root) => ipcRenderer.invoke('workspace:openRecent', root),

  tree: (rel = '.') => ipcRenderer.invoke('fs:tree', rel),
  read: (rel) => ipcRenderer.invoke('fs:read', rel),
  mkdir: (rel) => ipcRenderer.invoke('fs:mkdir', rel),
  write: (rel, content) => ipcRenderer.invoke('fs:write', rel, content),
  remove: (rel) => ipcRenderer.invoke('fs:delete', rel),

  auditLog: () => ipcRenderer.invoke('audit:list'),

  // The user's own agent (subscription CLIs) and the local MCP server it talks to
  agents: {
    detect: () => ipcRenderer.invoke('agents:detect'),
    login: (id) => ipcRenderer.invoke('agents:login', id),
    run: (req) => ipcRenderer.invoke('agents:run', req),
    onEvent: on('agents:event'), // ({ runId, type: 'text'|'tool'|'error'|'done', ... }) => ...
  },
  mcp: {
    info: () => ipcRenderer.invoke('mcp:info'),
    onStatus: on('mcp:status'),
    onRequest: on('mcp:request'), // ({ id, tool, args }) => reply({ id, ok, data | error })
    reply: (payload) => ipcRenderer.invoke('mcp:reply', payload),
    onScore: on('agent:score'), // ({ path, level, reason }) => ...
  },
  onChanged: on('fs:changed'), // (paths) => ...
  onAudit: on('audit'),        // (entry) => ...
});
