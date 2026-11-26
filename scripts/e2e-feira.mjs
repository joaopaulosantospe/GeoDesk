import { _electron as electron } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import path from 'node:path';
const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const desktop = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : '';
const PASTA = path.join(desktop, 'FEIRA_NOVA');
const ESPERADOS = [
  { nome: 'DELIMITACAO_MUNICIPIO', feicoes: 1 },
  { nome: 'ILUM_PUB', feicoes: 2871 },
  { nome: 'MEDIDOR', feicoes: 35 },
  { nome: 'POSTES', feicoes: 6401 },
  { nome: 'TRAFOS', feicoes: 567 },
  { nome: 'TRECHO_BT', feicoes: 4527 },
  { nome: 'TRECHO_MT', feicoes: 2755 },
];

const results = [];
let anyFail = false;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) anyFail = true;
}
function step(name, fn) {
  return fn()
    .then((detail) => check(name, true, detail ?? ''))
    .catch((err) => check(name, false, err?.message ?? String(err)));
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

await step('App abre', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
});

await step('Importa a pasta FEIRA_NOVA (7 shapefiles)', async () => {
  await page.setInputFiles('input[webkitdirectory]', PASTA);
  for (const item of ESPERADOS) {
    await layerByName(item.nome).waitFor({ timeout: 60000 });
  }
  const count = await page.locator('.layer-item').count();
  if (count !== ESPERADOS.length) throw new Error(`esperava ${ESPERADOS.length} camadas, veio ${count}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/feira-01-camadas.png` });
  return `${count} camadas carregadas`;
});

for (const item of ESPERADOS) {
  await step(`Contagem de "${item.nome}" = ${item.feicoes}`, async () => {
    const meta = await layerByName(item.nome).locator('.layer-meta').textContent();
    if (!meta?.includes(`${item.feicoes} feições`)) {
      throw new Error(`meta inesperada: ${meta?.replace(/\s+/g, ' ')}`);
    }
  });
}

await step('Atributos de POSTES carregam com texto íntegro (UTF-8)', async () => {
  await layerByName('POSTES').locator('.layer-name').click();
  await page.waitForSelector('.attr-table tbody tr', { timeout: 20000 });
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows < 100) throw new Error(`poucas linhas: ${rows}`);
  const tableText = await page.textContent('.attr-table');
  if (tableText?.includes('�')) throw new Error('caracteres substituidos (�) — encoding errado');
  const headers = await page.locator('.attr-table th').allTextContents();
  await page.screenshot({ path: `${SHOTS}/feira-02-postes-atributos.png` });
  return `${rows} linhas, campos: ${headers.slice(1, 6).join(', ')}…`;
});

await step('Centraliza na rede (TRECHO_BT) — visualização', async () => {
  await layerByName('TRECHO_BT').locator('.icon-btn[title="Centralizar na camada"]').click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${SHOTS}/feira-03-rede.png` });
});

await step('Medição rápida sobre a rede', async () => {
  await page.click('button:has-text("Medir distância")');
  const box = await page.locator('.map-wrap').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx - 80, cy - 40);
  await page.mouse.dblclick(cx + 80, cy + 40);
  await page.waitForSelector('.overlay-label', { timeout: 8000 });
  const label = (await page.textContent('.overlay-label'))?.trim();
  await page.screenshot({ path: `${SHOTS}/feira-04-medicao.png` });
  await page.click('button:has-text("Medir distância")');
  return label;
});

await step('Gera quadícula de 500 m sobre DELIMITACAO_MUNICIPIO', async () => {
  await page.click('.tool-btn:has-text("Quadícula")');
  await page.waitForSelector('#analysis-grid-base', { timeout: 8000 });
  const opts = await page.locator('#analysis-grid-base option').allTextContents();
  const idx = opts.findIndex((t) => t.startsWith('DELIMITACAO_MUNICIPIO'));
  if (idx < 0) throw new Error(`opção DELIMITACAO ausente: ${opts.join(' | ')}`);
  await page.selectOption('#analysis-grid-base', { index: idx });
  await page.fill('#analysis-grid-output', 'Quadícula 500 m');
  await page.fill('#analysis-grid-width', '500');
  await page.fill('#analysis-grid-height', '500');
  await page.selectOption('select[aria-label="Unidade da Largura do Polígono"]', 'm');
  await page.selectOption('select[aria-label="Unidade da Altura do Polígono"]', 'm');
  await page.click('button:has-text("Criar feições de índice da grade")');
  const gridName = 'Quadícula 500 m';
  await layerByName(gridName).waitFor({ timeout: 20000 });
  const meta = await layerByName(gridName).locator('.layer-meta').textContent();
  const match = meta?.match(/([\d.]+) feições/);
  if (!match) throw new Error(`meta inesperada: ${meta?.replace(/\s+/g, ' ')}`);
  const cells = Number(match[1].replace(/\./g, ''));
  if (cells < 100 || cells > 20000) throw new Error(`contagem implausível: ${cells}`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/feira-05-quadricula.png` });
  return `${cells} células geradas`;
});

await step('Atributos da quadícula têm ShapeName/PageNumber (padrão ArcMap)', async () => {
  await page.click('.tab:has-text("Atributos")');
  await page.waitForSelector('.attr-table th', { timeout: 15000 });
  const headers = (await page.locator('.attr-table th').allTextContents()).map((h) =>
    h.trim().toLowerCase(),
  );
  for (const needed of ['shapename', 'pagenumber', 'shape_length', 'shape_area']) {
    if (!headers.includes(needed)) throw new Error(`coluna "${needed}" ausente: ${headers.join(', ')}`);
  }
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows < 1) throw new Error('tabela vazia');
  await page.screenshot({ path: `${SHOTS}/feira-06-quadricula-atributos.png` });
  return `${rows} linhas visíveis`;
});

await step('Basemap Satélite sobre a rede', async () => {
  await page.click('.basemap-chip:has-text("Satélite")');
  await page.waitForTimeout(2500);
  const active = await page
    .locator('.basemap-chip:has-text("Satélite")')
    .evaluate((el) => el.classList.contains('active'));
  if (!active) throw new Error('chip Satélite não ficou ativo');
  const attr = (await page.textContent('.ol-attribution')) ?? '';
  if (!attr.includes('Esri')) throw new Error(`atribuição Esri ausente em: "${attr.slice(0, 120)}"`);
  await page.screenshot({ path: `${SHOTS}/feira-07-satelite.png` });
  await page.click('.basemap-chip:has-text("Escuro")');
  await page.waitForTimeout(400);
});

await step('Sem erros de console', async () => {
  await page.waitForTimeout(600);
  const real = consoleErrors.filter((e) => !/favicon|DevTools|Security Warning/i.test(e));
  if (real.length > 0) throw new Error(real.slice(0, 4).join(' | '));
  return '0 erros';
});

await app.close();

console.log('\n===== RESUMO FEIRA NOVA =====');
console.log(`${results.filter((r) => r.ok).length}/${results.length} verificações passaram`);
console.log(anyFail ? 'RESULTADO: FALHOU' : 'RESULTADO: TUDO OK');
process.exit(anyFail ? 1 : 0);
