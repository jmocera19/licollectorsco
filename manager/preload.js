const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readVault: () => ipcRenderer.invoke('read-vault'),
  removeVaultItem: (id) => ipcRenderer.invoke('remove-vault-item', id),
  addVaultItem: (id) => ipcRenderer.invoke('add-vault-item', id),
  syncLive: () => ipcRenderer.invoke('sync-live')
});
