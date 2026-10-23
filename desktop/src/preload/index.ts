import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AutopsiaApi, MenuCommand } from '../shared/types';

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: AutopsiaApi = {
  pickFolder: invoke('pickFolder') as AutopsiaApi['pickFolder'],
  scan: invoke('scan') as AutopsiaApi['scan'],
  doctor: invoke('doctor') as AutopsiaApi['doctor'],
  initPreview: invoke('initPreview') as AutopsiaApi['initPreview'],
  initWrite: invoke('initWrite') as AutopsiaApi['initWrite'],
  updateBaseline: invoke('updateBaseline') as AutopsiaApi['updateBaseline'],
  compare: invoke('compare') as AutopsiaApi['compare'],
  exportJson: invoke('exportJson') as AutopsiaApi['exportJson'],
  exportHtml: invoke('exportHtml') as AutopsiaApi['exportHtml'],
  openInEditor: invoke('openInEditor') as AutopsiaApi['openInEditor'],
  revealInFinder: invoke('revealInFinder') as AutopsiaApi['revealInFinder'],
  takePendingOpen: invoke('takePendingOpen') as AutopsiaApi['takePendingOpen'],
  recents: invoke('recents') as AutopsiaApi['recents'],
  forgetRecent: invoke('forgetRecent') as AutopsiaApi['forgetRecent'],
  renameRecent: invoke('renameRecent') as AutopsiaApi['renameRecent'],
  rememberStatus: invoke('rememberStatus') as AutopsiaApi['rememberStatus'],
  watch: invoke('watch') as AutopsiaApi['watch'],
  onWatchChange(listener) {
    const handler = (_e: unknown, file: string) => listener(file);
    ipcRenderer.on('watch:change', handler);
    return () => ipcRenderer.removeListener('watch:change', handler);
  },
  onMenu(listener) {
    const handler = (_e: unknown, command: MenuCommand) => listener(command);
    ipcRenderer.on('menu', handler);
    return () => ipcRenderer.removeListener('menu', handler);
  },
  onOpenPath(listener) {
    const handler = (_e: unknown, root: string) => listener(root);
    ipcRenderer.on('open-path', handler);
    return () => ipcRenderer.removeListener('open-path', handler);
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('autopsia', api);
