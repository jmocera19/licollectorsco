const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const dataPath = path.join(__dirname, '../src/data.json');
const cwdPath = path.join(__dirname, '..');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    backgroundColor: '#0A192F',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
};

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: Load Active Data.json ---
ipcMain.handle('read-vault', async () => {
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    return { vault: [], error: err.message };
  }
});

// --- IPC: Remove Target Item ID ---
ipcMain.handle('remove-vault-item', async (event, targetId) => {
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const dataObj = JSON.parse(rawData);
    dataObj.vault = dataObj.vault.filter(item => item.id !== targetId);
    fs.writeFileSync(dataPath, JSON.stringify(dataObj, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Run add-to-vault Scraper ---
ipcMain.handle('add-vault-item', async (event, itemId) => {
  return new Promise((resolve) => {
    exec(`node scripts/add-to-vault.js ${itemId}`, { cwd: cwdPath }, (error, stdout, stderr) => {
      // The script will resolve dynamically. 
      // If eBay throws a 404, the stderr triggers but the application won't crash!
      if (error) {
        resolve({ success: false, error: error.message, stdout, stderr });
      } else {
        resolve({ success: true, stdout });
      }
    });
  });
});

// --- IPC: Perform Git Sync Automation ---
ipcMain.handle('sync-live', async () => {
  return new Promise((resolve) => {
    const dateStr = new Date().toISOString().split('T')[0];
    const command = `node scripts/generate-sitemap.js && git add . && git commit -m "Vault Update: ${dateStr}" && git push origin main`;
    
    exec(command, { cwd: cwdPath }, (error, stdout, stderr) => {
      if (error) {
        // Typically happens if there's nothing to commit. We handle it safely.
        resolve({ success: false, error: error.message, stdout, stderr });
      } else {
        resolve({ success: true, stdout });
      }
    });
  });
});
