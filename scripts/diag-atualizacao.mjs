/**
 * Diagnóstico: Ajuda > Verificar Atualizações.
 *
 * Sobe um servidor local servindo o manifesto version.json e verifica os
 * três cenários do diálogo: versão nova disponível, já atualizado e
 * manifesto inválido.
 *
 *   node scripts/diag-atualizacao.mjs
 */
import { _electron as electron } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let anyFail = false;
async function step(name, fn) {
  try {
    const detail = await fn();
    check(name, true, detail ?? '');
  } catch (err) {
    anyFail = true;
    check(name, false, err?.message ?? String(err));
  }
}

// ── Servidor local do manifesto ────────────────────────────────────────────
let manifestBody = '{}';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(manifestBody);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const manifestUrl = `http://127.0.0.1:${port}/version.json`;

manifestBody = JSON.stringify({
  version: '99.0.0',
  url: `http://127.0.0.1:${port}/GeoDesk_Instalador_v99.0.0.exe`,
  notes: 'Nota de teste do diagnóstico.',
  releasedAt: '2026-11-17',
});

// ── App ────────────────────────────────────────────────────────────────────
const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
  env: { ...process.env, GEODESK_UPDATE_URL: manifestUrl },
});

const consoleErrors = [];

async function mainPage() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (await page.locator('.app-shell').count()) return page;
      } catch {
        // página já fechada (splash)
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('janela principal não apareceu');
}

const page = await mainPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

async function openCheckDialog() {
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
  await page.click('button.menu-item:has-text("Verificar Atualizações")');
  await page.waitForSelector('.modal:has-text("Atualizações do GeoDesk")', { timeout: 15000 });
  return page.locator('.modal:has-text("Atualizações do GeoDesk")');
}

await step('Menu Ajuda > Verificar Atualizações detecta versão nova', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(800);
  const modal = await openCheckDialog();
  const text = (await modal.innerText()).replace(/\s+/g, ' ');
  if (!text.includes('v99.0.0')) throw new Error(`texto inesperado: ${text}`);
  if (!text.includes('Baixar Atualização')) throw new Error('botão de download ausente');
  await page.screenshot({ path: `${SHOTS}/atualizacao-disponivel.png` });
  return text.slice(0, 120);
});

await step('Botão "Baixar Atualização" fecha o diálogo (abre o navegador)', async () => {
  // Só valida o clique; o download real é feito pelo navegador do sistema.
  await page.click('button:has-text("Baixar Atualização")');
  await page.waitForSelector('.modal:has-text("Atualizações do GeoDesk")', { state: 'detached', timeout: 10000 });
});

await step('Versão igual à instalada reporta "já atualizado"', async () => {
  const current = await app.evaluate(({ app }) => app.getVersion());
  manifestBody = JSON.stringify({ version: current, url: 'https://example.com/x.exe' });
  const modal = await openCheckDialog();
  const text = (await modal.innerText()).replace(/\s+/g, ' ');
  if (!text.includes('versão mais recente')) throw new Error(`texto inesperado: ${text}`);
  if (!text.includes(`v${current}`)) throw new Error(`não citou v${current}: ${text}`);
  await page.screenshot({ path: `${SHOTS}/atualizacao-atualizado.png` });
  await page.click('button:has-text("Fechar")');
  return `instalada v${current}`;
});

await step('Manifesto sem versão válida mostra aviso', async () => {
  manifestBody = JSON.stringify({ url: 'https://example.com/x.exe' });
  const modal = await openCheckDialog();
  const text = (await modal.innerText()).replace(/\s+/g, ' ');
  if (!text.includes('versão válida')) throw new Error(`texto inesperado: ${text}`);
  await page.click('button:has-text("Fechar")');
});

await step('Sem console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(' | '));
});

await app.close();
server.close();

console.log('\n───────────────────────────────');
console.log(`${results.filter((r) => r.ok).length}/${results.length} verificações passaram`);
process.exit(anyFail ? 1 : 0);
