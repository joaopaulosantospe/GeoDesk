// E2E: abre o GeoDesk.exe empacotado com um arquivo na linha de comando,
// simulando o duplo clique / "Abrir com GeoDesk" do Windows (associações
// registradas pelo installer.iss).
//
//   node scripts/e2e-open-file.mjs
//
// Confere que electron/main.cjs repassa o caminho ao renderer (IPC
// geodesk:startup-file) e que src/import/externalFile.ts carrega o arquivo.

import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeGeoPackageFixture } from './lib/fixture-gpkg.mjs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const EXE = 'D:/geodesk/dist-win/GeoDesk-win32-x64/GeoDesk.exe';
const tmp = join(tmpdir(), 'geodesk-e2e-open-file');
const gpkgPath = await writeGeoPackageFixture(join(tmp, 'clima.gpkg'));

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

const consoleErrors = [];

// Executável empacotado + arquivo como argumento (como o Windows faz).
const app = await electron.launch({
  executablePath: EXE,
  args: [gpkgPath],
  timeout: 60000,
});

// A primeira janela é a splash; esperamos a principal.
let page = null;
for (let i = 0; i < 60 && !page; i++) {
  page = app.windows().find((w) => !w.url().includes('splash.html')) ?? null;
  if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!page) {
  console.log('FAIL — janela principal do GeoDesk.exe não abriu');
  await app.close();
  process.exit(1);
}

page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

await step('GeoDesk.exe empacotado abre a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 30000 });
});

await step('Arquivo da linha de comando (.gpkg) é carregado ao iniciar', async () => {
  await page.waitForSelector('.layer-name:text-is("clima")', { timeout: 90000 });
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('GeoPackage clima carregado')) {
    throw new Error(`status inesperado: ${status.slice(0, 200)}`);
  }
  await page.screenshot({ path: `${SHOTS}/e2e-open-file-por-associacao.png` });
  return status.slice(0, 120);
});

await step('Versão exibida no app é 1.1.0', async () => {
  await page.click('.menu-bar-btn:has-text("Ajuda")');
  await page.click('.menu-item:has-text("Sobre o GeoDesk")');
  await page.waitForSelector('.modal-title:has-text("Sobre o GeoDesk")', { timeout: 10000 });
  const body = (await page.textContent('body').catch(() => '')) ?? '';
  if (!body.includes('Versão:') || !body.includes('1.1.0')) {
    throw new Error('modal Sobre não mostra a versão 1.1.0');
  }
  await page.click('.modal-actions button.btn.primary').catch(() => undefined);
});

await step('Nenhum erro de console inesperado', async () => {
  const relevant = consoleErrors.filter((line) => !/favicon|404 \(File not found\)|Content-Security-Policy/i.test(line));
  if (relevant.length > 0) throw new Error(relevant.slice(0, 3).join(' | '));
});

await app.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nTodos os testes passaram.' : `\n${failed} teste(s) falharam.`);
process.exit(failed === 0 ? 0 : 1);
