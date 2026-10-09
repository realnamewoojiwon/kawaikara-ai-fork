const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('KAWAI_EXTENSIONS', {
  manage: (operation, id, value) => ipcRenderer.invoke('extensions:manage', operation, id, value),
  onChanged: callback => ipcRenderer.on('extensions:changed', () => callback()),
});
