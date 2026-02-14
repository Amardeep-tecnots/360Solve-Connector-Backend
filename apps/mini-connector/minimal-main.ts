import { app, BrowserWindow } from 'electron';
import * as path from 'path';

console.log('[MINIMAL] Starting...');

app.whenReady().then(() => {
  console.log('[MINIMAL] App ready');
  
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  console.log('[MINIMAL] Window created');
  console.log('[MINIMAL] Loading http://localhost:5173');
  
  win.loadURL('http://localhost:5173');
  win.webContents.openDevTools();
  
  console.log('[MINIMAL] Setup complete');
}).catch(err => {
  console.error('[MINIMAL] Error:', err);
  process.exit(1);
});

app.on('window-all-closed', () => {
  app.quit();
});
