// Bridge between the window and the main process. The page can only use what is exposed here,
// e.g. window.platanus.mkdir('src'), never Node or the disk directly.

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('platanus', {
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  currentWorkspace: () => ipcRenderer.invoke('workspace:current'),

  tree: (rel = '.') => ipcRenderer.invoke('fs:tree', rel),
  read: (rel) => ipcRenderer.invoke('fs:read', rel),
  mkdir: (rel) => ipcRenderer.invoke('fs:mkdir', rel),
  write: (rel, content) => ipcRenderer.invoke('fs:write', rel, content),
  remove: (rel) => ipcRenderer.invoke('fs:delete', rel),

  auditLog: () => ipcRenderer.invoke('audit:list'),
  onChanged: on('fs:changed'), // (paths) => ...
  onAudit: on('audit'),        // (entry) => ...
});
