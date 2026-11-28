const electronModule = require('electron');

// Se o processo foi iniciado como Node (ex.: ELECTRON_RUN_AS_NODE no terminal do editor),
// require('electron') devolve uma string com o caminho do binário. Relança como Electron real:
if (typeof electronModule === 'string') {
  const { spawn } = require('child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronModule, process.argv.slice(1), {
    stdio: 'inherit',
    env,
    windowsHide: false,
  });
  child.on('close', (code) => process.exit(code ?? 0));
  return;
}

const { app, BrowserWindow, ipcMain } = electronModule;
const path = require('path');
const fs = require('fs/promises');

// Fecha o aplicativo solicitando confirmação de salvamento de alterações se necessário
ipcMain.handle('geodesk:quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

// Diálogo nativo de confirmação para salvar alterações antes de fechar o sistema
ipcMain.handle('geodesk:confirm-save-before-close', async (event, projectName) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const { dialog } = require('electron');
  const projName =
    typeof projectName === 'string' && projectName.trim() ? projectName.trim() : 'meu-projeto';

  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Salvar', 'Não Salvar', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    title: 'GeoDesk',
    message: `Deseja salvar as alterações feitas no projeto "${projName}"?`,
    detail: 'Se você fechar sem salvar, as alterações não salvas serão perdidas.',
    noLink: true,
  });

  // response: 0 = Salvar, 1 = Não Salvar, 2 = Cancelar
  if (result.response === 0) return 'save';
  if (result.response === 1) return 'dontsave';
  return 'cancel';
});

// Força o fechamento da janela ignorando o dirty-checking (após confirmação do usuário)
ipcMain.handle('geodesk:force-close', (event) => {
  const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.__forceClose = true;
    win.destroy();
  }
  app.exit(0);
});

const SIDECAR_EXTS = ['.dbf', '.prj', '.cpg'];

// Salva diretamente o conteúdo de um arquivo em disco no caminho especificado
ipcMain.handle('geodesk:save-file', async (_event, filePath, content) => {
  if (typeof filePath !== 'string' || typeof content !== 'string') return false;
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    return false;
  }
});

// Abre a caixa de diálogo nativa do sistema para salvar arquivo
ipcMain.handle('geodesk:show-save-dialog', async (event, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(win, {
    title: 'Salvar Projeto GeoDesk',
    defaultPath: defaultName || 'meu-projeto.geodesk',
    filters: [
      { name: 'Projeto GeoDesk (*.geodesk)', extensions: ['geodesk'] },
      { name: 'Todos os Arquivos (*.*)', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

// Lê um arquivo irmão (.dbf/.prj/.cpg) que está na mesma pasta do .shp selecionado.
ipcMain.handle('geodesk:read-sidecar', async (_event, shpPath, ext) => {
  if (typeof shpPath !== 'string' || !SIDECAR_EXTS.includes(ext)) return null;
  const base = path.basename(shpPath).replace(/\.[^./\\]+$/, '');
  try {
    return await fs.readFile(path.join(path.dirname(shpPath), base + ext));
  } catch {
    return null;
  }
});

// Lê qualquer arquivo referenciado por um projeto aberto (QGIS .qgs/.qgz,
// ArcGIS). Caminhos relativos são resolvidos a partir da pasta do projeto;
// caminhos absolutos são lidos diretamente. Devolve null quando não existe.
ipcMain.handle('geodesk:read-related', async (_event, basePath, referencePath) => {
  if (typeof basePath !== 'string' || typeof referencePath !== 'string') return null;
  if (basePath.trim() === '' || referencePath.trim() === '') return null;
  const cleaned = referencePath.trim().replace(/^file:\/\//i, '');
  const target = path.isAbsolute(cleaned)
    ? path.normalize(cleaned)
    : path.resolve(path.dirname(basePath), cleaned);
  try {
    const data = await fs.readFile(target);
    return { name: path.basename(target), data: new Uint8Array(data) };
  } catch {
    return null;
  }
});

// ---------------------------------------------------------------------------
// Atualizações
//
// App empacotado: electron-updater consulta o manifesto "latest.yml" publicado
// no GitHub Releases (joaopaulosantospe/geodesk-updates) e baixa/instala
// a atualização dentro do próprio aplicativo com progresso + reinício automático.
//
// Desenvolvimento / Fallback: consulta a API do GitHub Releases ou manifesto
// version.json especificado em GEODESK_UPDATE_URL.
// ---------------------------------------------------------------------------
const GITHUB_REPO = 'joaopaulosantospe/geodesk-updates';
const UPDATE_MANIFEST_URL =
  process.env.GEODESK_UPDATE_URL ||
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

let autoUpdater = null;
let updateDownloaded = false;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/** Inicializa o electron-updater uma única vez (apenas no app empacotado). */
function getAutoUpdater() {
  if (!app.isPackaged || autoUpdater) return autoUpdater;
  const { autoUpdater: updater } = require('electron-updater');
  autoUpdater = updater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = console;
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('geodesk:update-progress', {
      percent: progress?.percent ?? 0,
      transferred: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
    });
  });
  autoUpdater.on('update-downloaded', () => {
    updateDownloaded = true;
    sendToRenderer('geodesk:update-downloaded', {});
  });
  autoUpdater.on('error', (err) => {
    sendToRenderer('geodesk:update-error', String(err?.message || err));
  });
  return autoUpdater;
}

function parseVersionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i];
  }
  return false;
}

/** releaseNotes pode vir como texto ou como lista [{ version, note }]. */
function normalizeReleaseNotes(notes) {
  if (typeof notes === 'string') return notes.trim() || null;
  if (Array.isArray(notes)) {
    const text = notes
      .map((item) => (typeof item === 'string' ? item : item?.note))
      .filter(Boolean)
      .join('\n');
    return text.trim() || null;
  }
  return null;
}

async function fetchUpdateManifest(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GeoDesk-Workstation',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Versão do aplicativo em execução (lida do package.json do empacotamento).
ipcMain.handle('geodesk:app-version', () => app.getVersion());

// Verifica se existe atualização publicada e devolve o resultado para o menu
// Ajuda > Verificar Atualizações.
ipcMain.handle('geodesk:check-update', async () => {
  const current = app.getVersion();
  const updater = getAutoUpdater();

  // ── App empacotado: electron-updater (latest.yml) ─────────────────────────
  if (updater) {
    try {
      const result = await updater.checkForUpdates();
      if (!result) {
        return {
          status: 'error',
          mode: 'app',
          current,
          latest: null,
          message: 'O verificador de atualizações não está disponível neste momento.',
        };
      }
      const latest = result.updateInfo?.version ?? null;
      const available =
        typeof result.isUpdateAvailable === 'boolean'
          ? result.isUpdateAvailable
          : isNewerVersion(parseVersionParts(latest), parseVersionParts(current));
      return {
        status: available ? 'available' : 'up-to-date',
        mode: 'app',
        current,
        latest,
        notes: normalizeReleaseNotes(result.updateInfo?.releaseNotes),
        releasedAt: result.updateInfo?.releaseDate
          ? String(result.updateInfo.releaseDate).slice(0, 10)
          : null,
        url: null,
        downloaded: updateDownloaded,
      };
    } catch (err) {
      return {
        status: 'error',
        mode: 'app',
        current,
        latest: null,
        message: `Não foi possível consultar as atualizações: ${err?.message || err}`,
      };
    }
  }

  // ── Desenvolvimento / Fallback GitHub Releases (download no navegador) ──
  let manifest;
  try {
    manifest = await fetchUpdateManifest(UPDATE_MANIFEST_URL);
  } catch (err) {
    return {
      status: 'error',
      mode: 'browser',
      current,
      latest: null,
      message: `Não foi possível consultar as atualizações: ${err?.message || err}`,
    };
  }

  // Suporta tanto a API do GitHub Releases quanto o formato version.json local
  const latest = typeof manifest?.tag_name === 'string'
    ? manifest.tag_name.replace(/^v/i, '').trim()
    : typeof manifest?.version === 'string' ? manifest.version.trim() : '';

  const latestParts = parseVersionParts(latest);
  if (!latestParts) {
    return {
      status: 'invalid',
      mode: 'browser',
      current,
      latest: null,
      message: 'O manifesto de atualização não informa uma versão válida.',
    };
  }

  const downloadUrl = Array.isArray(manifest?.assets)
    ? manifest.assets.find((a) => a.name?.endsWith('.exe'))?.browser_download_url || manifest?.html_url || null
    : typeof manifest?.url === 'string' ? manifest.url : null;

  const rawNotes = manifest?.body || manifest?.notes || null;
  const releasedAt = manifest?.published_at
    ? String(manifest.published_at).slice(0, 10)
    : manifest?.releasedAt || null;

  return {
    status: isNewerVersion(latestParts, parseVersionParts(current)) ? 'available' : 'up-to-date',
    mode: 'browser',
    current,
    latest,
    url: downloadUrl,
    notes: normalizeReleaseNotes(rawNotes),
    releasedAt,
    downloaded: false,
  };
});

// Baixa a atualização dentro do app; o progresso é enviado para o renderer
// pelo evento 'geodesk:update-progress'.
ipcMain.handle('geodesk:download-update', async () => {
  const updater = getAutoUpdater();
  if (!updater) {
    return {
      status: 'error',
      message: 'O download interno está disponível apenas na versão instalada do GeoDesk.',
    };
  }
  if (updateDownloaded) return { status: 'downloaded' };
  try {
    await updater.downloadUpdate();
    return { status: 'downloaded' };
  } catch (err) {
    return {
      status: 'error',
      message: `Falha ao baixar a atualização: ${err?.message || err}`,
    };
  }
});

// Instala a atualização já baixada e reinicia o aplicativo.
ipcMain.handle('geodesk:install-update', () => {
  const updater = getAutoUpdater();
  if (!updater || !updateDownloaded) return false;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.__forceClose = true;
    }
    // isSilent=false: mostra o instalador NSIS (mensagens em pt-BR) para o
    // usuário confirmar; isForceRunAfter=true: relança o GeoDesk ao final.
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  } catch (err) {
    console.error('install-update error:', err);
    return false;
  }
});

// Abre um link http(s) no navegador padrão do sistema.
ipcMain.handle('geodesk:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  try {
    await electronModule.shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('openExternal error:', err);
    return false;
  }
});

// ---------------------------------------------------------------------------
// Arquivo passado na linha de comando (duplo clique no Windows ou "Abrir com"),
// quando o instalador registra as associações de extensão (installer.iss).
// ---------------------------------------------------------------------------
const STARTUP_EXTENSIONS = ['.shp', '.geojson', '.json', '.gpkg', '.qgs', '.qgz', '.mxd', '.geodesk'];

function findFilePathInArgs(args) {
  return (
    args
      .slice(1)
      .map((arg) => path.resolve(arg))
      .find((arg) => STARTUP_EXTENSIONS.includes(path.extname(arg).toLowerCase())) ?? null
  );
}

const startupFilePath = findFilePathInArgs(process.argv);

ipcMain.handle('geodesk:startup-file', () => startupFilePath);

// Garante instância única: se o usuário der duplo clique em outro arquivo .geodesk ou .mxd,
// a janela existente é focada e o arquivo é enviado via IPC ao invés de abrir uma segunda janela.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    showMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const incomingFile = findFilePathInArgs(commandLine);
      if (incomingFile) {
        mainWindow.webContents.send('geodesk:open-file', incomingFile);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Splash screen em janela própria (estilo ArcGIS): pequena, flutuante e
// centralizada. A janela principal só é exibida quando o splash termina.
// ---------------------------------------------------------------------------
let splashWindow = null;
let mainWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 508, // cartão de 460px + 24px de folga de cada lado p/ sombra
    height: 392,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'GeoDesk',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'splash-preload.cjs'),
    },
  });

  const startUrl = process.env.ELECTRON_START_URL;
  // A versão vai na query string: o splash.html lê `?v=` e exibe em
  // ".version-tag" (evita versão hardcoded no HTML).
  const versionQuery = `?v=${encodeURIComponent(app.getVersion())}`;
  if (startUrl) {
    splashWindow.loadURL(startUrl.replace(/\/+$/, '') + '/splash.html' + versionQuery);
  } else {
    splashWindow.loadFile(path.join(__dirname, '..', 'dist', 'splash.html'), {
      query: { v: app.getVersion() },
    });
  }

  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });

  // Se o usuário fechar o splash manualmente (ex.: Alt+F4), revela a janela principal.
  splashWindow.on('closed', () => {
    splashWindow = null;
    showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.__shown) return;
  mainWindow.__shown = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
  // Revela só agora: a janela principal permaneceu carregando em segundo plano.
  mainWindow.show();
  mainWindow.maximize();
}

ipcMain.on('geodesk:splash-done', (event) => {
  // Ignora mensagens que não venham da janela de splash.
  if (splashWindow && event.sender === splashWindow.webContents) {
    showMainWindow();
  }
});

function createWindow(immediate) {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: '#0a0c10',
    title: 'GeoDesk',
    icon: path.join(__dirname, '..', 'geodesk.ico'), // usado na barra de tarefas / Alt+Tab
    autoHideMenuBar: true,
    // Barra de título nativa removida (sem o ícone nativo); os botões
    // minimizar/maximizar/fechar continuam nativos via titleBarOverlay.
    // O título "GeoDesk — Estação Geoespacial" é desenhado pelo renderer.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#334155',
      height: 30,
    },
    show: false, // fica oculta até a animação do splash terminar
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow = win;

  // Intercepta o fechamento da janela (botão X ou Alt+F4) para verificar alterações não salvas
  win.on('close', (e) => {
    if (win.__forceClose) {
      return;
    }
    if (win.webContents && !win.webContents.isCrashed()) {
      e.preventDefault();
      win.webContents.send('geodesk:request-close');
    }
  });

  if (immediate) {
    // Recriação de janela (ex.: activate no macOS) — não há splash na frente.
    win.once('ready-to-show', () => showMainWindow());
  }

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    win.loadURL(startUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Rede de segurança: se o splash nunca der o sinal (falha de load),
  // revela a janela principal após o tempo máximo da animação (~5s).
  setTimeout(showMainWindow, 8000);
}

const { registerFileAssociations } = require('./registerAssoc.cjs');

app.whenReady().then(() => {
  try {
    registerFileAssociations(app);
  } catch (err) {
    console.error('registerFileAssociations error:', err);
  }
  createSplashWindow();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(true);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
