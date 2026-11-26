import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { ensureCardOpen, layerMeta, openLayerContextItem, selectTab } from './lib/ui.mjs';

const SHOTS = 'D:/geodesk/screenshots';
import { tmpdir } from 'node:os';
const FEIRA = path.join(tmpdir(), 'opencode/feira');
mkdirSync(SHOTS, { recursive: true });

const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console.error:', msg.text());
});

const shot = async (path) => {
  await page.waitForTimeout(1600);
  await page.screenshot({ path });
};

await page.waitForSelector('.app-shell', { timeout: 25000 });

// 1) Importa o shapefile real de trafo
await page.setInputFiles('.desktop-header-shell input[accept=".shp,.dbf,.prj,.cpg"]', [
  `${FEIRA}/TRAFOS.shp`,
  `${FEIRA}/TRAFOS.dbf`,
  `${FEIRA}/TRAFOS.prj`,
]);
try {
  await page.waitForSelector('.layer-item:has-text("TRAFOS")', { timeout: 40000 });
} catch {
  const message = await page.locator('.notice.error').first().textContent().catch(() => null);
  console.log('FALHA NO IMPORT:', message ?? 'sem mensagem');
  await shot(`${SHOTS}/feira-00-import-erro.png`);
  await app.close();
  process.exit(1);
}
await page.waitForTimeout(800);
const meta = (await page.locator('.layer-item:has-text("TRAFOS") .layer-meta').textContent()) ?? '';
console.log('camada TRAFOS:', meta);
await shot(`${SHOTS}/feira-01-importado.png`);

// 2) Grade 500 m x 500 m (mesma unidade) — deve sair quadrada
await page.click('.tab:has-text("Análise")');
await page.click('button[title="Criar feições de índice da grade (quadícula)"]');
const layerId = await page.evaluate(() => {
  const sel = document.querySelector('#analysis-grid-base');
  const opt = [...(sel?.options ?? [])].find((o) => o.textContent?.startsWith('TRAFOS'));
  return opt?.value;
});
if (!layerId) throw new Error('opção TRAFOS não encontrada');
await page.selectOption('#analysis-grid-base', layerId);
await page.fill('#analysis-grid-output', 'GradeFeira500');
await page.fill('#analysis-grid-width', '500');
await page.fill('#analysis-grid-height', '500');
const previa = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
console.log('prévia da célula:', previa.trim());
await shot(`${SHOTS}/feira-01b-formulario-previa.png`);
await page.click('button:has-text("Criar feições de índice da grade")');
try {
  await page.waitForSelector('.layer-item:has-text("GradeFeira500")', { timeout: 30000 });
} catch {
  const message = await page.locator('.notice.error').first().textContent().catch(() => null);
  console.log('FALHA GRADE 500m:', message ?? 'sem mensagem');
}
const meta2 = (await page.locator('.layer-item:has-text("GradeFeira500") .layer-meta').textContent()) ?? '';
console.log('GradeFeira500:', meta2);
await shot(`${SHOTS}/feira-02-500m-quadrada.png`);

// 3) Mesmo processo do ArcMap: unidade de página em CENTÍMETROS + escala → 17 células (3,2 km)
await page.check('#analysis-grid-pagescale');
await page.fill('#analysis-grid-scale', '1:20.000'); // formato brasileiro, com ponto de milhar
await page.fill('#analysis-grid-width', '16');
await page.fill('#analysis-grid-height', '16');
const previa3 = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
console.log('prévia (página/escala):', previa3.trim());
await shot(`${SHOTS}/feira-03-pagina-escala-previa.png`);
await page.fill('#analysis-grid-output', 'GradeFeiraPagina');
await page.click('button:has-text("Criar feições de índice da grade")');
try {
  await page.waitForSelector('.layer-item:has-text("GradeFeiraPagina")', { timeout: 30000 });
} catch {
  const message = await page.locator('.notice.error').first().textContent().catch(() => null);
  console.log('FALHA GRADE PÁGINA:', message ?? 'sem mensagem');
}
const meta3 = (await page.locator('.layer-item:has-text("GradeFeiraPagina") .layer-meta').textContent()) ?? '';
console.log('GradeFeiraPagina:', meta3);
await shot(`${SHOTS}/feira-03-pagina-escala.png`);

// 4) Simbologia: troca o ícone dos trafo (triângulo verde, como no ArcMap)
const item = page.locator('.layer-item').filter({ has: page.locator('.layer-name:text-is("TRAFOS")') });
await item.locator('.layer-swatch-btn').click();
await page.waitForSelector('.sym-panel', { timeout: 5000 });
await page.locator('.shape-btn[title="Triângulo"]').click();
await page.locator('.sym-panel input[type="color"]').nth(1).fill('#22c55e');
await page.waitForTimeout(600);
const ativo = await page.locator('.shape-btn.active').getAttribute('title');
console.log('ícone dos trafo:', ativo);
await shot(`${SHOTS}/feira-04-simbologia.png`);

// 5) Tabela de atributos da grade de 17 páginas (como no ArcMap)
await item.locator('.layer-swatch-btn').click(); // fecha o editor de simbologia
const itemPagina = page
  .locator('.layer-item')
  .filter({ has: page.locator('.layer-name:text-is("GradeFeiraPagina")') });
await itemPagina.click({ button: 'right' });
await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
await page.waitForSelector('.attr-table', { timeout: 5000 });
const cabecalhos = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
console.log('colunas da tabela:', cabecalhos.filter(Boolean).join(' | '));
const primeira = (await page.locator('.attr-table tbody tr').first().textContent()) ?? '';
console.log('primeira linha:', primeira.replace(/\s+/g, ' ').trim());
await shot(`${SHOTS}/feira-05-tabela-paginas.png`);

await app.close();
console.log('REPRODUÇÃO CONCLUÍDA');
process.exit(0);
