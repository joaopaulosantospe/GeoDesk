const { contextBridge, ipcRenderer, webUtils } = require('electron');

const SIDECAR_EXTS = ['.dbf', '.prj', '.cpg'];

/**
 * Acesso ao disco para completar um shapefile: o usuário pode escolher só o
 * .shp no diálogo e os arquivos irmãos (.dbf/.prj/.cpg) são lidos da mesma pasta.
 */
contextBridge.exposeInMainWorld('geodeskDisk', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  readSidecar: (shpPath, ext) =>
    SIDECAR_EXTS.includes(ext) ? ipcRenderer.invoke('geodesk:read-sidecar', shpPath, ext) : null,
  readRelated: (basePath, referencePath) =>
    ipcRenderer.invoke('geodesk:read-related', basePath, referencePath),
  getStartupFile: () => ipcRenderer.invoke('geodesk:startup-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('geodesk:save-file', filePath, content),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('geodesk:show-save-dialog', defaultName),
  quit: () => ipcRenderer.invoke('geodesk:quit'),
  onOpenFile: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('geodesk:open-file', handler);
    return () => ipcRenderer.removeListener('geodesk:open-file', handler);
  },
});

/**
 * Verificação de atualizações.
 *
 * App empacotado: electron-updater consulta o manifesto latest.yml publicado,
 * baixa a atualização com progresso (onUpdateProgress) e a instala/reinicia
 * (installUpdate → quitAndInstall). Em desenvolvimento o fallback é o
 * manifesto version.json, com download aberto no navegador (openExternal).
 */
contextBridge.exposeInMainWorld('geodeskUpdate', {
  appVersion: () => ipcRenderer.invoke('geodesk:app-version'),
  check: () => ipcRenderer.invoke('geodesk:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('geodesk:download-update'),
  installUpdate: () => ipcRenderer.invoke('geodesk:install-update'),
  openExternal: (url) => ipcRenderer.invoke('geodesk:open-external', url),
  onUpdateProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('geodesk:update-progress', handler);
    return () => ipcRenderer.removeListener('geodesk:update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('geodesk:update-downloaded', handler);
    return () => ipcRenderer.removeListener('geodesk:update-downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('geodesk:update-error', handler);
    return () => ipcRenderer.removeListener('geodesk:update-error', handler);
  },
});
