import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';

import { createInFolder, getDataLocationInfo } from '../src/main/dataLocation';

// Populated by vite-plugin-electron in dev; undefined in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

/** Electron's per-user app-data dir — where the remembered data-folder path lives (AT-1.6). */
function configDir(): string {
  return app.getPath('userData');
}

function registerDataLocationIpc(): void {
  ipcMain.handle('dataLocation:get', () => getDataLocationInfo(configDir()));

  ipcMain.handle('dataLocation:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dataLocation:createInFolder', (_event, folderPath: string) =>
    createInFolder(configDir(), folderPath),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerDataLocationIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
