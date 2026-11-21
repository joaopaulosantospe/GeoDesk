/**
 * E2E do fluxo REAL de atualização no app INSTALADO no Windows:
 *
 *   Ajuda > Verificar Atualizações > Baixar Atualização
 *     > Instalar agora e Reiniciar   (quitAndInstall(false, true))
 *     -> instalador NSIS concluído (scripts/auto-instalador.ps1)
 *     -> app relancado na versão nova
 *
 * Pré-condições:
 *   - GeoDesk instalado em %LOCALAPPDATA%\Programs\GeoDesk
 *   - Release mais nova que a instalada publicada no GitHub
 *
 *   node scripts/e2e-instalar-agora.mjs
 */
import { _electron as electron } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const INSTALLED = path.join(process.env.LOCALAPPDATA, 'Programs', 'GeoDesk', 'GeoDesk.exe');
const SHOTS = 'D:/geodesk/screenshots';
const REPO = 'joaopaulosantospe/geodesk-updates';
mkdirSync(SHOTS, { recursive: true });

const pkg = JSON.parse(readFileSync('D:/geodesk/package.json', 'utf8'));
const TARGET = String(pkg.version); // versão publicada mais recente

function ps(cmd) {
  return spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
}
function installedVersion() {
  const r = ps(`(Get-Item '${INSTALLED}').VersionInfo.ProductVersion`);
  return (r.stdout || '').trim();
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    check(name, true, detail ?? '');
  } catch (err) {
    check(name, false, err?.message ?? String(err));
  }
}

if (!existsSync(INSTALLED)) {
  console.error(`[ERRO] App instalado não encontrado: ${INSTALLED}`);
  process.exit(1);
}
console.log(`Instalado: ${installedVersion()} | Release alvo: v${TARGET}\n`);

let app = null;
let helper = null;

async function mainPage() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (await page.locator('.app-shell').count()) return page;
      } catch {
        // splash fechada
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('janela principal não apareceu');
}

async function openCheckDialog(page) {
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
  await page.click('button.menu-item:has-text("Verificar Atualizações")');
  await page.waitForSelector('.modal:has-text("Atualizações do GeoDesk")', { timeout: 20000 });
  return page.locator('.modal:has-text("Atualizações do GeoDesk")');
}

try {
  app = await electron.launch({
    executablePath: INSTALLED,
    args: [],
    timeout: 60000,
    env: { ...process.env },
  });
  const page = await mainPage();

  await step('App instalado inicia', async () => {
    await page.waitForSelector('.app-shell', { timeout: 30000 });
    const version = await app.evaluate(({ app }) => app.getVersion());
    const packaged = await app.evaluate(({ app }) => app.isPackaged);
    if (!packaged) throw new Error('app.isPackaged = false');
    return `v${version}, isPackaged=true`;
  });

  await step('Ajuda > Verificar Atualizações detecta release mais nova', async () => {
    await page.waitForTimeout(800);
    const modal = await openCheckDialog(page);
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    if (!text.includes(`Está disponível a versão v${TARGET}`)) {
      throw new Error(`esperava v${TARGET}: ${text}`);
    }
    if (!text.includes('pode ser baixada e instalada pelo próprio aplicativo')) {
      throw new Error(`esperava modo interno: ${text}`);
    }
    await page.screenshot({ path: `${SHOTS}/instalado-disponivel.png` });
    return text.slice(0, 180);
  });

  await step('Download dentro do app (barra de progresso)', async () => {
    await page.click('button:has-text("Baixar Atualização")');
    await page.waitForSelector('button:has-text("Instalar agora e Reiniciar")', { timeout: 600000 });
    await page.screenshot({ path: `${SHOTS}/instalado-baixado.png` });
    return 'botão "Instalar agora e Reiniciar" visível';
  });

  await step('Instalar agora e Reiniciar -> instalador NSIS conclui', async () => {
    // Helper que fecha as páginas do instalador automaticamente.
    helper = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'D:/geodesk/scripts/auto-instalador.ps1', '-TimeoutSec', '600'],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    );
    let helperLog = '';
    helper.stdout.on('data', (d) => (helperLog += d));
    helper.stderr.on('data', (d) => (helperLog += d));
    // Registra o 'exit' ANTES do clique: se o helper terminar durante o
    // clique (o app fecha e o instalador assume), o evento não se perde.
    const helperExit = new Promise((resolve) => helper.on('exit', resolve));

    try {
      await page.click('button:has-text("Instalar agora e Reiniciar")', { timeout: 15000 });
    } catch (err) {
      // Esperado: o quitAndInstall fecha o app (e a página) durante o clique.
      console.log(`   [info] página fechou durante o clique (quitAndInstall): ${err.message.slice(0, 90)}`);
    }
    // NÃO tocar mais na página: o app já fechou. Só aguardar o instalador.
    const helperCode = await helperExit;
    console.log(`   [helper exit ${helperCode}] ${helperLog.trim().replace(/\n/g, ' | ')}`);
    if (helperCode !== 0) throw new Error(`helper do instalador saiu com ${helperCode}: ${helperLog.trim()}`);

    // Instalação concluída: o disco precisa ter a versão nova.
    const v = installedVersion();
    if (v !== TARGET) throw new Error(`versão instalada ainda é ${v}, esperava ${TARGET}`);
    return `instalador concluído; disco = v${v}`;
  });

  await step('App instalado na versão nova (Sobre / Verificar Atualizações)', async () => {
    // Fecha qualquer instância relançada pelo instalador e reabre para conferir.
    ps('Get-Process GeoDesk -ErrorAction SilentlyContinue | Stop-Process -Force');
    await new Promise((r) => setTimeout(r, 3000));
    app = await electron.launch({
      executablePath: INSTALLED,
      args: [],
      timeout: 60000,
      env: { ...process.env },
    });
    const page2 = await mainPage();
    await page2.waitForSelector('.app-shell', { timeout: 30000 });
    const version = await app.evaluate(({ app }) => app.getVersion());
    if (version !== TARGET) throw new Error(`app relançado é v${version}, esperava v${TARGET}`);
    await page2.waitForTimeout(800);
    const modal = await openCheckDialog(page2);
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    if (!text.includes(`versão mais recente: v${TARGET}`)) {
      throw new Error(`esperava "já atualizado v${TARGET}": ${text}`);
    }
    await page2.screenshot({ path: `${SHOTS}/instalado-atualizado.png` });
    return `v${version}; ${text.slice(0, 120)}`;
  });
} catch (err) {
  check('fluxo geral', false, err?.message ?? String(err));
} finally {
  try {
    if (app) await app.close();
  } catch {
    // app já fechou (quitAndInstall)
  }
  if (helper && !helper.killed) helper.kill();
}

console.log('\n───────────────────────────────');
console.log(`${results.filter((r) => r.ok).length}/${results.length} verificações passaram`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
