/**
 * E2E — Seleção de região por polígono (tecla P):
 *  - ativa a ferramenta pelo atalho e pela toolbar;
 *  - desenha um polígono sobre a amostra de pontos;
 *  - verifica a contagem de pontos dentro (painel + Inspetor Lateral);
 *  - exporta Excel (.xlsx) e KML (.kml) e confere os arquivos baixados;
 *  - cria camada com os pontos da região e limpa a seleção.
 *
 * Uso: node scripts/e2e-regiao.mjs
 */
import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const NOME_PONTOS = 'Pontos de monitoramento (sintéticos)';
const DL_DIR = join(tmpdir(), 'geodesk-regiao-dl');
rmSync(DL_DIR, { recursive: true, force: true });
mkdirSync(DL_DIR, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let anyFail = false;
function step(name, fn) {
  return fn()
    .then((detail) => check(name, true, detail ?? ''))
    .catch((err) => {
      anyFail = true;
      check(name, false, err?.message ?? String(err));
    });
}

const consoleErrors = [];

const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

// A janela de splash abre antes da principal e fecha sozinha; espera a
// janela que realmente contém a interface (evita pegar o splash).
async function waitForMainWindow(electronApp, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        if ((await win.locator('.app-shell').count()) > 0) {
          await win.waitForSelector('.app-shell', {
            state: 'visible',
            timeout: Math.max(1000, deadline - Date.now()),
          });
          return win;
        }
      } catch {
        // janela pode fechar no meio da espera (splash) — tenta a próxima
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('janela principal não apareceu');
}

const page = await waitForMainWindow(app);
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

// Redireciona todos os downloads (anchor + blob) para uma pasta temporária,
// permitindo conferir os arquivos gerados pela exportação.
await app.evaluate(({ session }, dir) => {
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSavePath(dir + '\\' + item.getFilename());
  });
}, DL_DIR);

const layerByName = (name) =>
  page.locator('.layer-item').filter({ has: page.locator(`.layer-name:text-is("${name}")`) });

await step('App abre e renderiza a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(1200);
});

await step(`Carrega amostra "${NOME_PONTOS}"`, async () => {
  await page.click('button[title="Carregar Dados de Amostra"]');
  await page.click(`button:has-text("${NOME_PONTOS}")`);
  await layerByName(NOME_PONTOS).waitFor({ timeout: 30000 });
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('carregada')) throw new Error(`status inesperado: ${status.slice(0, 120)}`);
  await page.waitForTimeout(500);
});

await step('Centraliza a camada de pontos no mapa', async () => {
  await layerByName(NOME_PONTOS).locator('.layer-action-btn[title="Centralizar nesta camada no mapa"]').click();
  await page.waitForTimeout(1000);
});

let totalDentro = 0;

await step('Atalho P ativa a ferramenta e mostra a dica', async () => {
  await page.keyboard.press('p');
  await page.waitForSelector('.region-select-panel', { timeout: 8000 });
  const dica = (await page.textContent('.region-select-panel')) ?? '';
  if (!dica.includes('traçar o polígono')) throw new Error(`dica inesperada: ${dica.slice(0, 160)}`);
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('Selecionar Região')) throw new Error(`status inesperado: ${status.slice(0, 160)}`);
  const active = await page
    .locator('button[title^="Selecionar Região"]')
    .evaluate((el) => el.classList.contains('active'));
  if (!active) throw new Error('botão da toolbar não ficou ativo');
});

await step('Desenha um polígono e conta os pontos dentro', async () => {
  const box = await page.locator('.map-wrap').boundingBox();
  const left = box.x + 80;
  const right = box.x + box.width - 340; // evita o painel flutuante (canto superior direito)
  const top = box.y + 90;
  const bottom = box.y + box.height - 90;

  await page.mouse.click(left, top);
  await page.mouse.click(right, top);
  await page.mouse.click(right, bottom);
  await page.mouse.dblclick(left, bottom);

  await page.waitForSelector('.region-select-panel .region-total-value', { timeout: 10000 });
  await page.waitForTimeout(400);

  const texto = (await page.textContent('.region-select-panel .region-total-value')) ?? '';
  totalDentro = Number(texto.replace(/\D/g, ''));
  if (!Number.isFinite(totalDentro) || totalDentro < 1) {
    throw new Error(`contagem inválida: "${texto}"`);
  }

  const linhas = await page.locator('.region-select-panel .region-layer-row').count();
  if (linhas < 1) throw new Error('sem contagem por camada no painel');
  const primeira = (await page.textContent('.region-select-panel .region-layer-row')) ?? '';
  if (!primeira.includes('Pontos de monitoramento')) {
    throw new Error(`camada inesperada na contagem: ${primeira}`);
  }

  const meta = (await page.textContent('.region-select-panel .region-meta')) ?? '';
  if (!meta.includes('Área:')) throw new Error(`meta sem área: ${meta}`);

  await page.screenshot({ path: `${SHOTS}/40-regiao-poligono.png` });
  return `${totalDentro} pontos dentro`;
});

await step('Inspetor Lateral mostra a mesma contagem', async () => {
  await page.click('.segmented-tab:has-text("Análise")');
  const card = page.locator('.collapsible-card').filter({ hasText: 'Seleção por Região' });
  await card.waitFor({ timeout: 8000 });
  const valor = (await card.locator('.stat-box .stat-value').first().textContent()) ?? '';
  const noCard = Number(valor.replace(/\D/g, ''));
  if (noCard !== totalDentro) {
    throw new Error(`painel mostra ${totalDentro}, card mostra ${valor}`);
  }
  await page.screenshot({ path: `${SHOTS}/41-regiao-inspetor.png` });
  return `${valor} no card`;
});

await step('Exporta os pontos da região em Excel (.xlsx)', async () => {
  await page.locator('.region-select-panel button:has-text("Excel")').click();
  await page.waitForFunction(
    () => document.querySelector('.status-bar')?.textContent?.includes('Excel exportado') ?? false,
    undefined,
    { timeout: 20000 },
  );
  const file = join(DL_DIR, 'pontos_na_regiao.xlsx');
  for (let i = 0; i < 40 && !existsSync(file); i++) {
    await page.waitForTimeout(250);
  }
  if (!existsSync(file)) throw new Error(`arquivo não baixado em ${DL_DIR}`);
  const size = statSync(file).size;
  if (size < 500) throw new Error(`xlsx suspeito: ${size} bytes`);
  return `pontos_na_regiao.xlsx (${size} bytes)`;
});

await step('Exporta os pontos da região em KML (.kml)', async () => {
  await page.locator('.region-select-panel button:has-text("KML")').click();
  await page.waitForFunction(
    () => document.querySelector('.status-bar')?.textContent?.includes('KML exportado') ?? false,
    undefined,
    { timeout: 20000 },
  );
  const file = join(DL_DIR, 'pontos_na_regiao.kml');
  for (let i = 0; i < 40 && !existsSync(file); i++) {
    await page.waitForTimeout(250);
  }
  if (!existsSync(file)) throw new Error(`arquivo não baixado em ${DL_DIR}`);
  const kml = readFileSync(file, 'utf8');
  const placemarks = (kml.match(/<Placemark>/g) ?? []).length;
  if (placemarks !== totalDentro) {
    throw new Error(`KML tem ${placemarks} placemarks, esperado ${totalDentro}`);
  }
  if (!kml.includes('<Point>')) throw new Error('KML sem elementos <Point>');
  return `${placemarks} placemarks`;
});

await step('Cria camada com os pontos dentro da região', async () => {
  await page.locator('.region-select-panel button:has-text("Criar Camada")').click();
  await layerByName('Pontos na Região').waitFor({ timeout: 15000 });
  const count = await page.locator('.layer-item').count();
  await page.screenshot({ path: `${SHOTS}/42-regiao-camada.png` });
  return `${count} camadas`;
});

await step('Regressão: exportação Excel da camada continua funcionando', async () => {
  await layerByName(NOME_PONTOS).locator('.layer-name').click();
  await page.click('.segmented-tab:has-text("Atributos")');
  await page
    .locator('button[title="Exportar tabela de atributos para Excel (.xlsx)"]')
    .click();
  await page.waitForFunction(
    () => document.querySelector('.status-bar')?.textContent?.includes('exportada para Excel') ?? false,
    undefined,
    { timeout: 20000 },
  );
  const file = join(DL_DIR, 'pontos_de_monitoramento_sinteticos.xlsx');
  for (let i = 0; i < 40 && !existsSync(file); i++) {
    await page.waitForTimeout(250);
  }
  if (!existsSync(file)) throw new Error(`arquivo não baixado em ${DL_DIR}`);
  const size = statSync(file).size;
  if (size < 500) throw new Error(`xlsx suspeito: ${size} bytes`);
  return `pontos_de_monitoramento_sinteticos.xlsx (${size} bytes)`;
});

await step('Limpar região remove polígono e resultado', async () => {
  await page.locator('.region-select-panel .icon-btn[title="Limpar região"]').click();
  await page.waitForFunction(
    () => document.querySelector('.region-select-panel')?.textContent?.includes('traçar o polígono') ?? false,
    undefined,
    { timeout: 8000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('.region-select-panel', { state: 'detached', timeout: 8000 });
});

await step('Sem erros de console ou exceções', async () => {
  await page.waitForTimeout(800);
  const real = consoleErrors.filter(
    (e) => !/favicon|Download the React DevTools|Electron Security Warning/i.test(e),
  );
  if (real.length > 0) throw new Error(real.slice(0, 5).join(' | '));
  return '0 erros';
});

await app.close();

console.log('\n===== RESUMO =====');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} verificações passaram`);
if (anyFail) {
  console.log('RESULTADO: FALHOU');
  process.exit(1);
}
console.log('RESULTADO: TUDO OK');
process.exit(0);
