/**
 * Verifica no app real (Electron + dist/) que:
 *  1. o mapa base padrão é o OpenStreetMap ao abrir;
 *  2. o Inspetor Lateral nasce oculto;
 *  3. o botão "Buffer" da barra de ferramentas abre o Inspetor e executa o buffer;
 *  4. o menu Geoprocessamento > Interseção Espacial executa a interseção;
 *  5. não há erros de console/exceções.
 *
 * Uso:  npm run build && node scripts/diag-buffer-intersecao.mjs
 */
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
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
const tileRequests = [];

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
page.on('response', (res) => {
  if (res.url().includes('tile.openstreetmap.org')) tileRequests.push(res.status());
});

const optionValueByPrefix = (selector, prefix) =>
  page.evaluate(
    ({ selector, prefix }) => {
      const sel = document.querySelector(selector);
      if (!sel) throw new Error(`select ${selector} não encontrado`);
      const opt = [...sel.options].find((o) => (o.textContent ?? '').startsWith(prefix));
      if (!opt) throw new Error(`opção "${prefix}" ausente em ${selector}`);
      return opt.value;
    },
    { selector, prefix },
  );

await step('App abre e renderiza a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/50-inicial.png` });
});

await step('Inspetor Lateral inicia oculto', async () => {
  const count = await page.locator('.right-panel').count();
  if (count !== 0) throw new Error(`.right-panel presente (${count}) — painel não nasceu oculto`);
  return 'right-panel ausente';
});

await step('Mapa base padrão é OpenStreetMap', async () => {
  // O OpenLayers desenha os tiles em <canvas>, então a prova do carregamento
  // são as requisições de rede para tile.openstreetmap.org.
  const deadline = Date.now() + 20000;
  while (tileRequests.length === 0 && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }
  const label = (await page.locator('.toolbar-btn:has-text("OpenStreetMap")').count()) > 0;
  const attr = (await page.textContent('.ol-attribution').catch(() => '')) ?? '';
  const ok = tileRequests.filter((status) => status === 200).length;
  if (!label) throw new Error('seletor de mapa base não mostra "OpenStreetMap"');
  if (!attr.includes('OpenStreetMap')) throw new Error(`atribuição ausente em "${attr.slice(0, 120)}"`);
  if (ok === 0) throw new Error(`nenhum tile OSM carregou (${tileRequests.length} respostas)`);
  return `${ok} tiles OSM HTTP 200; atribuição presente`;
});

await step('Carrega as 3 amostras de camadas', async () => {
  await page.click('.layer-sample-quick-card:has-text("Brasil — Estados")');
  await page.waitForSelector('.layer-item:has-text("Brasil — Estados")', { timeout: 30000 });

  for (const nome of ['Países (mundo)', 'Pontos de monitoramento']) {
    await page.click('.toolbar-btn[title="Carregar Dados de Amostra"]');
    await page.click(`.modal .menu-item:has-text("${nome}")`);
    await page.waitForSelector(`.layer-item:has-text("${nome.split(' (')[0]}")`, { timeout: 30000 });
  }

  const count = await page.locator('.layer-item').count();
  if (count !== 3) throw new Error(`esperava 3 camadas, veio ${count}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/51-camadas.png` });
  return `${count} camadas`;
});

await step('Botão "Buffer" da barra abre o Inspetor na aba Análise', async () => {
  await page.click('.toolbar-btn[title="Zona de Amortecimento / Buffer (B)"]');
  await page.waitForSelector('.right-panel', { timeout: 8000 });
  const ativo = await page.locator('.segmented-tab:has-text("Análise").active').count();
  if (ativo !== 1) throw new Error('aba Análise não ficou ativa');
  const aviso = (await page.textContent('.right-panel').catch(() => '')) ?? '';
  if (!aviso.includes('Clique para executar o buffer')) throw new Error('aviso do buffer ausente');
  return 'Inspetor aberto com aviso do buffer';
});

await step('Buffer de 5000 m na camada de pontos', async () => {
  const value = await optionValueByPrefix('#analysis-buffer-layer', 'Pontos de monitoramento');
  await page.selectOption('#analysis-buffer-layer', value);
  await page.fill('#analysis-buffer-distance', '5000');
  await page.click('button:has-text("Executar buffer")');
  await page.waitForSelector('.badge:has-text("OK")', { timeout: 30000 });

  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('Buffer gerado')) throw new Error(`status sem confirmação: ${status.slice(0, 160)}`);

  const bufferLayer = await page.evaluate(
    () => [...document.querySelectorAll('.layer-item')].filter((el) => (el.textContent ?? '').trim().startsWith('Buffer')).length,
  );
  if (bufferLayer !== 1) throw new Error('camada de buffer não apareceu no Gerenciador de Camadas');

  const log = (await page.textContent('.tab-content')) ?? '';
  if (!log.includes('feições geradas')) throw new Error('log de resultado sem "feições geradas"');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/52-buffer.png` });
  return status.slice(0, 160);
});

await step('Tabela de atributos da camada de buffer tem 90 feições', async () => {
  await page
    .locator('.layer-item')
    .filter({ hasText: 'Buffer' })
    .first()
    .click();
  await page.waitForSelector('.attr-table tbody tr', { timeout: 20000 });
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows !== 90) throw new Error(`esperava 90 linhas, veio ${rows}`);
  const headers = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  if (!headers.some((h) => /nome|estacao|id/i.test(h))) throw new Error(`campos do buffer inesperados: ${headers.join(', ')}`);
  return `${rows} linhas; campos ${headers.filter(Boolean).slice(0, 6).join(', ')}…`;
});

await step('Fecha o Inspetor (mantém o padrão oculto)', async () => {
  await page.click('.toolbar-btn[title="Ocultar Inspetor Lateral"]');
  await page.waitForTimeout(400);
  const count = await page.locator('.right-panel').count();
  if (count !== 0) throw new Error('.right-panel permaneceu aberto');
  return 'Inspetor recolhido';
});

await step('Menu Geoprocessamento > Interseção Espacial', async () => {
  await page.click('button:has-text("Geoprocessamento")');
  await page.click('.menu-item:has-text("Interseção Espacial de Camadas")');
  await page.waitForSelector('.right-panel', { timeout: 8000 });
  const aviso = (await page.textContent('.right-panel').catch(() => '')) ?? '';
  if (!aviso.includes('Clique para executar a interseção')) throw new Error('aviso da interseção ausente');
  return 'Inspetor aberto com aviso da interseção';
});

await step('Interseção Brasil ∩ Países (mundo)', async () => {
  const a = await optionValueByPrefix('#analysis-intersect-a', 'Brasil — Estados');
  const b = await optionValueByPrefix('#analysis-intersect-b', 'Países (mundo)');
  await page.selectOption('#analysis-intersect-a', a);
  await page.selectOption('#analysis-intersect-b', b);
  await page.click('button:has-text("Executar interseção")');
  await page.waitForFunction(
    () => (document.querySelector('.status-bar')?.textContent ?? '').includes('Interseção concluída'),
    { timeout: 120000 },
  );

  const status = (await page.textContent('.status-bar')) ?? '';
  const resultLayer = await page.evaluate(
    () => [...document.querySelectorAll('.layer-item')].filter((el) => (el.textContent ?? '').trim().startsWith('Interseção')).length,
  );
  if (resultLayer !== 1) throw new Error('camada de interseção não apareceu no Gerenciador de Camadas');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/53-intersecao.png` });
  return status.slice(0, 160);
});

await step('Interseção preserva os atributos das duas camadas', async () => {
  await page
    .locator('.layer-item')
    .filter({ hasText: 'Interseção' })
    .first()
    .click();
  await page.waitForSelector('.attr-table tbody tr', { timeout: 20000 });
  const rows = await page.locator('.attr-table tbody tr').count();
  if (rows < 1) throw new Error('interseção sem feições na tabela');
  const headers = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  const temA = headers.includes('NOME_UF'); // campos da Camada A (Brasil — Estados)
  const temB = headers.includes('name'); // campos da Camada B (Países do Mundo)
  if (!temA || !temB) throw new Error(`campos ausentes: ${headers.join(', ')}`);
  await page.screenshot({ path: `${SHOTS}/54-intersecao-atributos.png` });
  return `${rows} feições; campos A: NOME_UF… · campos B: name…`;
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
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAIL: ${f.name} :: ${f.detail}`);
  console.log('RESULTADO: FALHOU');
  process.exit(1);
}
console.log('RESULTADO: TUDO OK');
process.exit(0);
