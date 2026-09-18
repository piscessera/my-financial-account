import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';

import { closeAppDatabase, getAppDatabase, openAppDatabase } from '../src/main/db/appDatabase';
import { createInFolder, getDataLocationInfo } from '../src/main/dataLocation';
import { createDomainIpcHandlers } from '../src/main/ipc';
import { checkAndClaimLock } from '../src/main/lockFile';

// Populated by vite-plugin-electron in dev; undefined in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

/** Electron's per-user app-data dir — where the remembered data-folder path lives (AT-1.6). */
function configDir(): string {
  return app.getPath('userData');
}

/**
 * The domain (taxYears/transactions/attachments) handlers need a live DB connection, which
 * only exists once the data folder is known. `getAppDatabase()` returns `null` before
 * onboarding completes; every domain channel is unreachable from the renderer until then
 * anyway (the Onboarding screen is all that's shown), so a clear throw here is the correct
 * failure mode, not a silent no-op.
 */
function requireOpenSqlite() {
  const handle = getAppDatabase();
  if (!handle) {
    throw new Error('App database is not open yet — complete onboarding (choose a data folder) first.');
  }
  return handle.sqlite;
}

function currentDataFolderPath(): string {
  const info = getDataLocationInfo(configDir());
  if (!info) {
    throw new Error('No data folder is configured yet — complete onboarding first.');
  }
  return info.folderPath;
}

function registerIpcHandlers(): void {
  ipcMain.handle('dataLocation:get', () => getDataLocationInfo(configDir()));

  ipcMain.handle('dataLocation:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dataLocation:createInFolder', (_event, folderPath: string) => {
    const info = createInFolder(configDir(), folderPath);
    openAppDatabase(info.folderPath);
    return info;
  });

  ipcMain.handle('lockFile:check', (_event, folderPath: string) => checkAndClaimLock(folderPath));

  const domainHandlers = createDomainIpcHandlers({
    getSqlite: requireOpenSqlite,
    getDataFolderPath: currentDataFolderPath,
  });
  for (const [channel, handler] of Object.entries(domainHandlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (handler as (...a: unknown[]) => unknown)(...args),
    );
  }
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
  // If onboarding already completed on a prior launch, the domain IPC channels need the DB
  // open right away; on a fresh install this stays unopened until `createInFolder` runs.
  const existing = getDataLocationInfo(configDir());
  if (existing) openAppDatabase(existing.folderPath);

  registerIpcHandlers();
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

app.on('will-quit', () => {
  closeAppDatabase();
});
