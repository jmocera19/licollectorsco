const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readVault: () => ipcRenderer.invoke('read-vault'),
  removeVaultItem: (id) => ipcRenderer.invoke('remove-vault-item', id),
  addVaultItem: (id) => ipcRenderer.invoke('add-vault-item', id),
  syncLive: () => ipcRenderer.invoke('sync-live'),
  readPosts: () => ipcRenderer.invoke('read-posts'),
  publishPost: (post) => ipcRenderer.invoke('publish-post', post),
  deletePost: (slug) => ipcRenderer.invoke('delete-post', slug),
});
