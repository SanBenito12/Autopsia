import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { startWatcher } from '@core/watcher';
import { EngineClient } from './engine-client';
import { forgetRecent, listRecents, setRecentStatus, touchRecent } from './recents';
import type { InitPreset, Lang, MenuCommand, ProjectStatus } from '../shared/types';

const engine = new EngineClient();
let win: BrowserWindow | null = null;
let watcher: { close: () => void } | null = null;
// Carpeta pedida por argumento o al soltarla en el icono del Dock
let pendingOpen: string | null =
  process.argv.slice(1).reverse().find((arg) => !arg.startsWith('-') && arg !== '.' && isDirectory(arg)) ?? null;

function isDirectory(target: string): boolean {
  try { return fs.statSync(target).isDirectory(); } catch { return false; }
}

function flushPendingOpen(): void {
  if (!pendingOpen || !win || win.webContents.isLoading()) return;
  win.webContents.send('open-path', path.resolve(pendingOpen));
  pendingOpen = null;
}

/** El renderer la pide al montar: antes no hay nadie escuchando 'open-path'. */
function takePendingOpen(): string | null {
  const target = pendingOpen ? path.resolve(pendingOpen) : null;
  pendingOpen = null;
  return target;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Autopsia',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => {
    win = null;
    stopWatching();
  });
}

function send(command: MenuCommand): void {
  win?.webContents.send('menu', command);
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Rescan', accelerator: 'CmdOrCtrl+R', click: () => send('rescan') },
        { label: 'Watch for Changes', accelerator: 'CmdOrCtrl+Shift+W', click: () => send('toggle-watch') },
        { type: 'separator' },
        { label: 'Export HTML Report…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Findings', accelerator: 'CmdOrCtrl+1', click: () => send('tab:findings') },
        { label: 'Graph', accelerator: 'CmdOrCtrl+2', click: () => send('tab:graph') },
        { label: 'Doctor', accelerator: 'CmdOrCtrl+3', click: () => send('tab:doctor') },
        { label: 'Configuration', accelerator: 'CmdOrCtrl+4', click: () => send('tab:config') },
        { type: 'separator' },
        { role: 'reload', accelerator: 'CmdOrCtrl+Alt+R' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Show Tour', click: () => send('tour') },
        { type: 'separator' },
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/SanBenito12/Autopsia#readme') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/SanBenito12/Autopsia/issues') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopWatching(): void {
  watcher?.close();
  watcher = null;
}

function registerIpc(): void {
  ipcMain.handle('pickFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Open a React Native / TypeScript project',
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0];
  });
  ipcMain.handle('scan', (_e, root: string, lang: Lang) => {
    touchRecent(root);
    return engine.call('scan', root, lang);
  });
  ipcMain.handle('doctor', (_e, root: string, lang: Lang) => engine.call('doctor', root, lang));
  ipcMain.handle('initPreview', (_e, root: string, preset: InitPreset) => engine.call('initPreview', root, preset));
  ipcMain.handle('initWrite', (_e, root: string, preset: InitPreset, force: boolean) =>
    engine.call('initWrite', root, preset, force));
  ipcMain.handle('updateBaseline', (_e, root: string) => engine.call('updateBaseline', root));
  ipcMain.handle('compare', async (_e, root: string, lang: Lang) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Compare with a previous JSON report',
      defaultPath: root,
      properties: ['openFile'],
      filters: [{ name: 'Autopsia report', extensions: ['json'] }],
    });
    if (canceled) return { ok: true, value: null };
    return engine.call('compare', root, filePaths[0], lang);
  });
  const exporter = (kind: 'json' | 'html') => async (_e: unknown, root: string, lang: Lang) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(root, kind === 'html' ? 'autopsia-report.html' : 'autopsia-report.json'),
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (canceled || !filePath) return { ok: true, value: null };
    return engine.call('exportReport', root, filePath, kind, lang);
  };
  ipcMain.handle('exportHtml', exporter('html'));
  ipcMain.handle('exportJson', exporter('json'));
  ipcMain.handle('openInEditor', async (_e, root: string, file: string, line?: number) => {
    const abs = path.resolve(root, file);
    for (const scheme of ['cursor', 'vscode']) {
      if (app.getApplicationNameForProtocol(`${scheme}://`)) {
        await shell.openExternal(`${scheme}://file${abs}${line ? `:${line}` : ''}`);
        return;
      }
    }
    await shell.openPath(abs);
  });
  ipcMain.handle('revealInFinder', (_e, target: string) => {
    if (fs.existsSync(target)) shell.showItemInFolder(target);
  });
  ipcMain.handle('recents', () => listRecents());
  ipcMain.handle('takePendingOpen', () => takePendingOpen());
  ipcMain.handle('forgetRecent', (_e, root: string) => forgetRecent(root));
  ipcMain.handle('rememberStatus', (_e, root: string, status: ProjectStatus, newCount?: number) =>
    setRecentStatus(root, status, newCount));
  ipcMain.handle('watch', (_e, root: string | null) => {
    stopWatching();
    if (!root) return;
    watcher = startWatcher({ root, onChange: (file) => win?.webContents.send('watch:change', file) });
  });
}

app.setName('Autopsia');
app.on('open-file', (event, target) => {
  event.preventDefault();
  if (!isDirectory(target)) return;
  pendingOpen = target;
  if (app.isReady() && !win) createWindow();
  else flushPendingOpen();
});
app.whenReady().then(() => {
  nativeTheme.themeSource = 'system';
  buildMenu();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  stopWatching();
  engine.dispose();
});
