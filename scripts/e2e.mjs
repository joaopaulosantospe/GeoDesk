import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeShapefileFixture } from './lib/fixture-shp.mjs';
import { SEL, loadSample, openInspector, selectTab, setBasemap } from './lib/ui.mjs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const NOME_BRASIL = 'Brasil — Estados';
const NOME_PONTOS = 'Pontos de monitoramento (sintéticos)';

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

const page = await app.firstWindow();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

const layerByName = (name) =>
  page.locator('.layer-item').filter({ has: page.locator(`.layer-name:text-is("${name}")`) });

await step('App abre e renderiza a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/01-inicial.png` });
});

await step(`Carrega amostra "${NOME_BRASIL}"`, async () => {
  await loadSample(page, NOME_BRASIL);
  await page.waitForSelector(`.layer-item:has-text("${NOME_BRASIL}")`, { timeout: 30000 });
  const status = await page.textContent('.status-bar');
  if (!status?.includes('carregada')) throw new Error(`status inesperado: ${status?.slice(0, 120)}`);
});

await step('Carrega amostra "Pontos de monitoramento"', async () => {
  await loadSample(page, 'Pontos de monitoramento');
  await layerByName(NOME_PONTOS).waitFor({ timeout: 20000 });
  const count = await page.locator('.layer-item').count();
  if (count < 2) throw new Error(`esperava 2 camadas, veio ${count}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/02-camadas.png` });
  return `${count} camadas`;
});

await step('Tabela de atributos da camada ativa', async () => {
  await layerByName(NOME_PONTOS).locator('.layer-name').click();
  await openInspector(page);
  await page.waitForSelector('.attr-table tbody tr', { timeout: 15000 });
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows < 80) throw new Error(`esperava ~90 linhas, veio ${rows}`);
  await page.screenshot({ path: `${SHOTS}/03-atributos.png` });
  return `${rows} linhas`;
});

await step('Busca na tabela de atributos', async () => {
  await page.fill('.tab-content input[placeholder*="Buscar"]', 'Alta');
  await page.waitForTimeout(400);
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows < 1) throw new Error('busca por "Alta" não retornou linhas');
  await page.fill('.tab-content input[placeholder*="Buscar"]', '');
  return `${rows} linhas filtradas`;
});

await step('Centraliza camada e identifica feição no mapa', async () => {
  await layerByName(NOME_BRASIL)
    .locator('.layer-action-btn[title="Centralizar nesta camada no mapa"]')
    .click();
  await page.waitForTimeout(900);
  await page.click(SEL.identify);
  const box = await page.locator('.map-wrap').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.popup-card', { timeout: 8000 });
  const popup = await page.textContent('.popup-card');
  if (!popup || popup.trim().length < 10) throw new Error('popup vazio');
  await page.screenshot({ path: `${SHOTS}/04-identificar.png` });
  await page.click(SEL.identify);
});

await step('Medição de distância no mapa', async () => {
  await page.click(SEL.measureDistance);
  const box = await page.locator('.map-wrap').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx - 150, cy);
  await page.mouse.click(cx + 100, cy + 60);
  await page.mouse.dblclick(cx + 150, cy + 80);
  await page.waitForSelector('.overlay-label', { timeout: 8000 });
  const label = await page.textContent('.overlay-label');
  if (!label || !/(km|m)/.test(label)) throw new Error(`rótulo inválido: ${label}`);
  await page.screenshot({ path: `${SHOTS}/05-medicao.png` });
  await page.click(SEL.measureDistance);
  return label.trim();
});

await step('Buffer de 5 km na camada de pontos', async () => {
  await selectTab(page, 'Análise');
  const pontosValue = await page.evaluate((nome) => {
    const sel = document.querySelector('#analysis-buffer-layer');
    const opt = [...sel.options].find((o) => o.textContent?.startsWith(nome));
    if (!opt) throw new Error('opção da camada de pontos não encontrada no select');
    return opt.value;
  }, NOME_PONTOS);
  await page.selectOption('#analysis-buffer-layer', pontosValue);
  await page.fill('#analysis-buffer-distance', '5000');
  await page.click('button:has-text("Executar buffer")');
  await page.waitForSelector('.badge:has-text("OK")', { timeout: 20000 });
  const log = await page.textContent('.tab-content');
  if (!log?.includes('feições geradas')) throw new Error('log de buffer sem resultado');
  const count = await page.locator('.layer-item').count();
  if (count < 3) throw new Error(`esperava camada de buffer (3+), veio ${count}`);
  await page.screenshot({ path: `${SHOTS}/06-buffer.png` });
  return `${count} camadas após buffer`;
});

await step('Aba Relatório mostra estatísticas', async () => {
  await layerByName(NOME_PONTOS).locator('.layer-name').click();
  await selectTab(page, 'Relatório');
  await page.waitForSelector('.stat-box', { timeout: 8000 });
  const text = await page.textContent('.tab-content');
  if (!text?.includes('Feições')) throw new Error('sem estatísticas visíveis');
  await page.screenshot({ path: `${SHOTS}/08-relatorio.png` });
});

await step('Alternar basemap offline (Claro ↔ Escuro)', async () => {
  await setBasemap(page, 'Claro (Vetor)');
  await page.waitForTimeout(700);
  const bgClaro = await page.locator('.ol-viewport').evaluate((el) => el.style.backgroundColor);
  if (bgClaro !== 'rgb(248, 250, 252)') throw new Error(`fundo não clareou: "${bgClaro}"`);
  await page.screenshot({ path: `${SHOTS}/09-basemap-claro.png` });
  await setBasemap(page, 'Escuro (Vetor)');
  await page.waitForTimeout(400);
  const bgEscuro = await page.locator('.ol-viewport').evaluate((el) => el.style.backgroundColor);
  if (bgEscuro !== 'rgb(10, 12, 16)') throw new Error(`fundo não escureceu: "${bgEscuro}"`);
});

await step('Alternar basemap Satélite (online) e voltar', async () => {
  await setBasemap(page, 'Esri Satélite');
  await page.waitForTimeout(1800);
  const rotulo = ((await page.textContent('.toolbar-btn:has-text("Esri Satélite")').catch(() => '')) ?? '').trim();
  if (!rotulo.includes('Esri Satélite')) throw new Error(`seletor de mapa base não atualizou: "${rotulo}"`);
  const attr = (await page.textContent('.ol-attribution')) ?? '';
  if (!attr.includes('Esri')) throw new Error(`atribuição Esri ausente em: "${attr.slice(0, 120)}"`);
  await page.screenshot({ path: `${SHOTS}/10-basemap-satelite.png` });
  await setBasemap(page, 'Escuro (Vetor)');
  await page.waitForTimeout(600);
  const attrDepois = (await page.textContent('.ol-attribution')) ?? '';
  if (attrDepois.includes('Esri')) throw new Error('atribuição Esri permaneceu após voltar ao Escuro');
});

await step('Shapefile individual (.shp só): companions do disco montam a tabela', async () => {
  const dir = join(tmpdir(), 'geodesk-shp-e2e');
  writeShapefileFixture(dir, 'TRAFO_FIXTURE');

  // Usuário escolhe apenas o .shp — .dbf/.prj/.cpg têm de vir do disco automaticamente.
  await page
    .locator('.desktop-header-shell input[accept=".shp,.dbf,.prj,.cpg"]')
    .setInputFiles(join(dir, 'TRAFO_FIXTURE.shp'));
  await layerByName('TRAFO_FIXTURE').waitFor({ timeout: 20000 });
  const status = (await page.textContent('.status-bar')) ?? '';
  if (status.includes('ausente')) throw new Error(`companions não vieram do disco: ${status.slice(0, 160)}`);

  await layerByName('TRAFO_FIXTURE').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
  const headers = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  if (!headers.includes('COD') || !headers.includes('VALOR')) {
    throw new Error(`campos do .dbf não apareceram na tabela: ${headers.join(', ')}`);
  }
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows !== 2) throw new Error(`esperava 2 linhas, veio ${rows}`);
  await page.screenshot({ path: `${SHOTS}/32-shp-individual-tabela.png` });
  return `cabeçalhos ${headers.filter(Boolean).join(', ')}; ${rows} linhas`;
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
