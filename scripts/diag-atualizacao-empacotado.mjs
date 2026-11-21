/**
 * Diagnóstico do app EMPACOTADO (dist-builder/win-unpacked) — usa o
 * electron-updater com o app-update.yml gerado pelo electron-builder, ou
 * seja, consulta o repositório GitHub Releases de verdade.
 *
 *   node scripts/diag-atualizacao-empacotado.mjs            # espera "já atualizado"
 *   EXPECT=available node scripts/diag-atualizacao-empacotado.mjs   # espera "versão nova"
 *   EXE=D:/geodesk/dist-builder/win-unpacked-v1.1.1/GeoDesk.exe EXPECT=available node ...
 *
 * Pré-condição: o repositório joaopaulosantospe/geodesk-updates precisa ter
 * uma release publicada (o app instalado enxerga a release mais recente).
 */
import { _electron as electron } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const EXE = process.env.EXE || 'D:/geodesk/dist-builder/win-unpacked/GeoDesk.exe';
const SHOTS = 'D:/geodesk/screenshots';
const EXPECT = process.env.EXPECT || 'up-to-date';
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(EXE)) {
  console.error(`[ERRO] App empacotado não encontrado: ${EXE}\n       Rode: npm run dist:win`);
  process.exit(1);
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

const app = await electron.launch({
  executablePath: EXE,
  args: [],
  timeout: 60000,
  env: { ...process.env },
});

const consoleErrors = [];

async function mainPage() {
  const deadline = Date.now() + 40000;
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
  await page.waitForSelector('.modal:has-text("Atualizações do GeoDesk")', { timeout: 20000 });
  return page.locator('.modal:has-text("Atualizações do GeoDesk")');
}

await step('App empacotado inicia', async () => {
  await page.waitForSelector('.app-shell', { timeout: 30000 });
  const version = await app.evaluate(({ app }) => app.getVersion());
  const packaged = await app.evaluate(({ app }) => app.isPackaged);
  if (!packaged) throw new Error('app.isPackaged = false (não é o build)');
  return `v${version}, isPackaged=true`;
});

await step(`Ajuda > Verificar Atualizações (esperado: ${EXPECT})`, async () => {
  await page.waitForTimeout(800);
  const modal = await openCheckDialog();
  const text = (await modal.innerText()).replace(/\s+/g, ' ');
  const version = await app.evaluate(({ app }) => app.getVersion());

  if (EXPECT === 'up-to-date') {
    if (!text.includes('versão mais recente')) throw new Error(`esperava "já atualizado": ${text}`);
    if (!text.includes(`v${version}`)) throw new Error(`não citou v${version}: ${text}`);
  } else {
    if (!text.includes('Está disponível a versão')) throw new Error(`esperava versão nova: ${text}`);
    if (!text.includes('pode ser baixada e instalada pelo próprio aplicativo')) {
      throw new Error(`esperava modo interno (app): ${text}`);
    }
    if (!text.includes('Baixar Atualização')) throw new Error('botão de download ausente');
  }
  await page.screenshot({ path: `${SHOTS}/empacotado-${EXPECT}.png` });
  return text.slice(0, 200);
});

if (EXPECT === 'available') {
  await step('Download dentro do app inicia e termina', async () => {
    await page.click('button:has-text("Baixar Atualização")');
    // Espera o botão virar "Instalar agora e Reiniciar" (download concluído).
    await page.waitForSelector('button:has-text("Instalar agora e Reiniciar")', { timeout: 300000 });
    await page.screenshot({ path: `${SHOTS}/empacotado-baixado.png` });
    return 'download concluído';
  });
}

await step('Sem console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(' | '));
});

await app.close();

console.log('\n───────────────────────────────');
console.log(`${results.filter((r) => r.ok).length}/${results.length} verificações passaram`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
