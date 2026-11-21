const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Resolve o caminho de um .ico que o Windows Explorer consiga LER de verdade.
 *
 * Cuidado: no app empacotado `app.getAppPath()` devolve "...\\resources\\app.asar",
 * e o fs do Electron enxerga arquivos dentro do asar virtualmente. O Explorer NÃO
 * lê dentro do asar — registrar esse caminho deixava o ícone do arquivo em branco.
 */
function resolveIconPath(app, targetExe) {
  // 1) geodesk.ico instalado ao lado do executável (o instalador copia para {app}).
  const besideExe = path.join(path.dirname(targetExe), 'geodesk.ico');
  if (fs.existsSync(besideExe)) return besideExe;

  // 1b) Recurso extra do Electron (--extra-resource=geodesk.ico): fica em
  //     resources\geodesk.ico, fora do asar, então o Explorer consegue ler.
  if (app.isPackaged && process.resourcesPath) {
    const extraResource = path.join(process.resourcesPath, 'geodesk.ico');
    if (fs.existsSync(extraResource)) return extraResource;
  }

  // 2) Desenvolvimento: geodesk.ico na raiz do projeto (arquivo real no disco).
  const rootIco = path.join(app.getAppPath(), 'geodesk.ico');
  if (fs.existsSync(rootIco) && !rootIco.includes('app.asar')) return rootIco;

  // 3) Empacotado: copia o .ico de dentro do asar para uma pasta permanente fora dele.
  try {
    if (fs.existsSync(rootIco)) {
      const destDir = app.getPath('userData');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, 'geodesk.ico');
      const needsCopy =
        !fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(rootIco).size;
      if (needsCopy) fs.copyFileSync(rootIco, dest);
      if (fs.existsSync(dest)) return dest;
    }
  } catch (err) {
    console.warn('Não foi possível extrair geodesk.ico do asar:', err);
  }

  // 4) Último recurso: o próprio executável (o Windows extrai o ícone embutido).
  return targetExe;
}

/** Lê um valor (default) do registro. Devolve null se a chave não existir. */
function regQuery(keyPath, valueName) {
  try {
    const out = execSync(`reg query "${keyPath}"${valueName ? ` /v ${valueName}` : ''}`, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString();
    for (const line of out.split(/\r?\n/)) {
      // Dados opcionais no fim: cobre REG_NONE com valor vazio (OpenWithProgids).
      const m = line.match(/^\s*(\S+)\s+REG_\w+\s*(.*)$/);
      if (!m) continue;
      // Sem valueName, o primeiro item "(Default)"/"(Predefinido)" é o valor padrão.
      if (valueName ? m[1] === valueName : /^\(.+\)$/i.test(m[1])) return m[2].trim();
    }
  } catch {
    /* chave inexistente */
  }
  return null;
}

function registerFileAssociations(app) {
  if (process.platform !== 'win32' || !app) return;

  const isDev = !app.isPackaged;
  const targetExe = isDev
    ? path.join(process.env.LOCALAPPDATA || 'C:\\Users\\CENEGED\\AppData\\Local', 'Programs', 'GeoDesk', 'GeoDesk.exe')
    : app.getPath('exe');

  if (!fs.existsSync(targetExe) && !isDev) return;

  const iconPath = resolveIconPath(app, targetExe);
  const openCommand = `"${targetExe}" "%1"`;

  // Associações que precisam existir no registro: [chave, valor esperado]
  const expected = [
    ['HKCU\\Software\\Classes\\.geodesk', 'GeoDesk.Project'],
    ['HKCU\\Software\\Classes\\GeoDesk.Project\\DefaultIcon', iconPath],
    ['HKCU\\Software\\Classes\\GeoDesk.Project\\shell\\open\\command', openCommand],
  ];

  // Só mexe no registro (e notifica o Explorer) quando algo realmente mudou.
  // Evita regravar a cada início e limpa o caminho antigo para o app.asar.
  const upToDate = expected.every(([key, value]) => regQuery(key) === value);

  // -------------------------------------------------------------------------
  // .mxd é formato do ArcMap — o GeoDesk NÃO reivindica essa extensão, para o
  // arquivo manter o ícone e o programa originais do ArcMap. Versões anteriores
  // registravam "GeoDesk.MxdProject"; aqui devolvemos ao ArcMap.
  // -------------------------------------------------------------------------
  const MXD_FILE_EXT =
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.mxd';
  const cleanup = [];
  if (regQuery('HKCU\\Software\\Classes\\.mxd') === 'GeoDesk.MxdProject') {
    cleanup.push('reg delete "HKCU\\Software\\Classes\\.mxd" /f >nul 2>&1');
  }
  if (regQuery('HKCU\\Software\\Classes\\GeoDesk.MxdProject') !== null) {
    cleanup.push('reg delete "HKCU\\Software\\Classes\\GeoDesk.MxdProject" /f >nul 2>&1');
  }
  // Escolha fixada ("sempre usar este app") apontando para o GeoDesk: remove para
  // o Windows voltar a usar o padrão do sistema (ArcMapDocument).
  if (regQuery(`${MXD_FILE_EXT}\\UserChoice`, 'ProgId') === 'GeoDesk.MxdProject') {
    cleanup.push(`reg delete "${MXD_FILE_EXT}\\UserChoice" /f >nul 2>&1`);
  }
  if (regQuery(`${MXD_FILE_EXT}\\OpenWithProgids`, 'GeoDesk.MxdProject') !== null) {
    cleanup.push(`reg delete "${MXD_FILE_EXT}\\OpenWithProgids" /v GeoDesk.MxdProject /f >nul 2>&1`);
  }

  if (upToDate && cleanup.length === 0) return;

  // Valor de registro com escape correto: aspas viram \" (sintaxe do reg.exe)
  // e % vira %% (escapa a expansão de argumento do cmd em arquivo .bat).
  const regValue = (value) => `"${value.replace(/"/g, '\\"').replace(/%/g, '%%')}"`;

  try {
    const batScript = [
      '@echo off',
      // .geodesk
      'reg add "HKCU\\Software\\Classes\\.geodesk" /ve /t REG_SZ /d "GeoDesk.Project" /f >nul',
      'reg add "HKCU\\Software\\Classes\\.geodesk\\OpenWithProgids" /v "GeoDesk.Project" /t REG_NONE /d "" /f >nul',
      'reg add "HKCU\\Software\\Classes\\GeoDesk.Project" /ve /t REG_SZ /d "Projeto GeoDesk" /f >nul',
      `reg add "HKCU\\Software\\Classes\\GeoDesk.Project\\DefaultIcon" /ve /t REG_SZ /d ${regValue(iconPath)} /f >nul`,
      `reg add "HKCU\\Software\\Classes\\GeoDesk.Project\\shell\\open\\command" /ve /t REG_SZ /d ${regValue(openCommand)} /f >nul`,
      // Devolve o .mxd ao ArcMap (formato de terceiros)
      ...cleanup,
      // Notifica o Windows Explorer para reler ícones e associações na hora
      'ie4uinit.exe -show >nul 2>&1',
    ].join('\r\n');

    const tempBat = path.join(app.getPath('temp'), 'geodesk-register-assoc.bat');
    fs.writeFileSync(tempBat, batScript, 'ascii');
    execSync(`cmd.exe /c "${tempBat}"`, { windowsHide: true, stdio: 'ignore' });
    try { fs.unlinkSync(tempBat); } catch {}

    // SHChangeNotify(SHCNE_ASSOCCHANGED): faz o Explorer descartar o ícone em branco
    // gravado em cache e buscar o DefaultIcon novo. Usa -EncodedCommand para evitar
    // qualquer problema de escape de aspas no shell.
    try {
      const ps = [
        "Add-Type -Namespace Win32 -Name Shell -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);';",
        '[Win32.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)',
      ].join(' ');
      const encoded = Buffer.from(ps, 'utf16le').toString('base64');
      execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        { windowsHide: true, stdio: 'ignore' }
      );
    } catch (err) {
      console.warn('SHChangeNotify falhou (não crítico):', err.message);
    }
  } catch (err) {
    console.error('Falha ao registrar associações de arquivos:', err);
  }
}

module.exports = { registerFileAssociations };
