import { _electron as electron } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

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

// Conta pixels claros no mapa (máscara dos rótulos) para provar que o texto apareceu.
const countMapWhitePixels = () =>
  page.evaluate(() => {
    let count = 0;
    let opaque = 0;
    const canvases = [...document.querySelectorAll('canvas')].map((canvas) => `${canvas.width}x${canvas.height}`);
    for (const canvas of document.querySelectorAll('canvas')) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 200) opaque += 1;
        if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225 && data[i + 3] > 200) count += 1;
      }
    }
    return { count, opaque, canvases };
  });

// Mostra/oculta todas as camadas (para medir os rótulos sem camadas translúcidas por cima).
const clickEnquantoExistir = async (title) => {
  let guard = 0;
  while ((await page.locator(`.icon-btn[title="${title}"]`).count()) > 0 && guard < 40) {
    await page.locator(`.icon-btn[title="${title}"]`).first().click();
    guard += 1;
  }
  return guard;
};

const layerByName = (name) =>
  page.locator('.layer-item').filter({ has: page.locator(`.layer-name:text-is("${name}")`) });

// Espera o mapa re-renderizar (zoom + camada nova) antes de fotografar.
const shot = async (path) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path });
};

await step('App abre e renderiza a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(1000);
});

await step(`Carrega amostra "${NOME_PONTOS}"`, async () => {
  await page.click('button:has-text("Amostras")');
  await page.click(`button:has-text("${NOME_PONTOS}")`);
  await layerByName(NOME_PONTOS).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
});

await step('Card "Feições de Índice da Grade" tem saída, entrada, checkboxes e Largura/Altura', async () => {
  await page.click('.tab:has-text("Análise")');
  await page.click('button:has-text("Quadícula")');
  await page.waitForSelector('h3:has-text("Feições de Índice da Grade")', { timeout: 10000 });

  const output = await page.inputValue('#analysis-grid-output');
  if (output !== 'GridIndexFeatures') throw new Error(`saída esperada GridIndexFeatures, veio "${output}"`);

  if (!(await page.isChecked('#analysis-grid-clip'))) {
    throw new Error('checkbox "Gerar Grade de Polígono que intersecciona..." deveria iniciar marcado');
  }
  if (await page.isChecked('#analysis-grid-pagescale')) {
    throw new Error('"Utilizar Unidade da Página e Escala" deveria iniciar desmarcado');
  }
  if (!(await page.isVisible('#analysis-grid-width'))) throw new Error('campo Largura do Polígono ausente');
  if (!(await page.isVisible('#analysis-grid-height'))) throw new Error('campo Altura do Polígono ausente');
  if ((await page.locator('#analysis-grid-scale').count()) !== 0) {
    throw new Error('Escala do Mapa não deveria aparecer com o checkbox desmarcado');
  }
  const label = await page.textContent('label[for="analysis-grid-base"]');
  if (!label?.includes('Feições de Entrada')) throw new Error('rótulo de Feições de Entrada ausente');
  await shot(`${SHOTS}/11-indice-grade.png`);
  return 'campos base ok';
});

await step('Origem = mapa visível + interseção gera escada (células vazias removidas)', async () => {
  await page.fill('#analysis-grid-output', 'GradeVista');
  await page.fill('#analysis-grid-width', '100000');
  await page.fill('#analysis-grid-height', '100000');
  await page.click('button:has-text("Criar feições de índice da grade")');
  try {
    await page.waitForSelector('.layer-item:has-text("GradeVista")', { timeout: 20000 });
  } catch {
    const message = await page.locator('.notice.error').first().textContent().catch(() => null);
    throw new Error(`camada não criada — ${message ?? 'sem mensagem de erro'}`);
  }
  const meta = (await page.locator('.layer-item:has-text("GradeVista") .layer-meta').textContent()) ?? '';
  const count = Number((meta.match(/(\d+)\s+feições/) ?? [])[1]);
  if (!(count >= 1 && count <= 90)) {
    throw new Error(`esperava de 1 a 90 células (só as que tocam os pontos), veio ${count} :: ${meta}`);
  }
  const log = (await page.textContent('.tab-content')) ?? '';
  if (!log.includes('descartadas')) throw new Error('log não registrou células descartadas pelo recorte');
  await shot(`${SHOTS}/11-recorte-mapa-visivel.png`);
  return `${count} células (recorte ativo)`;
});

await step('Seleciona o trafo (feição) na tabela de atributos', async () => {
  // A grade criada acima virou a camada ativa; volta para a camada de pontos.
  await layerByName(NOME_PONTOS).locator('.layer-name').click();
  await page.click('.tab:has-text("Atributos")');
  await page.waitForSelector('.attr-table tbody tr', { timeout: 15000 });
  await page.locator('.attr-table tbody tr').first().click();
  await page.waitForTimeout(800);
  return 'feição clicada';
});

await step('Após selecionar, a origem vira "Feições selecionadas"', async () => {
  await page.click('.tab:has-text("Análise")');
  await page.waitForSelector('#analysis-grid-base', { timeout: 10000 });
  await page.waitForTimeout(700);
  const value = await page.inputValue('#analysis-grid-base');
  if (value !== '__selection__') throw new Error(`origem esperada __selection__, veio "${value}"`);
  const label = await page.textContent('#analysis-grid-base');
  if (!label?.includes('selecionadas')) throw new Error('opção da seleção ausente no select');
  const stat = await page.locator('.stat-box .stat-value').first().textContent();
  if (stat?.trim() !== '1') throw new Error(`cartão de seleção esperava 1, veio "${stat}"`);
  return 'origem = seleção (1 feição)';
});

await step('Checkbox "Utilizar Unidade da Página e Escala" revela os campos', async () => {
  await page.check('#analysis-grid-pagescale');
  const esperados = [
    '#analysis-grid-scale',
    '#analysis-grid-origin-x',
    '#analysis-grid-origin-y',
    '#analysis-grid-rows',
    '#analysis-grid-cols',
    '#analysis-grid-start-page',
  ];
  for (const selector of esperados) {
    await page.waitForSelector(selector, { timeout: 5000 });
  }
  const unit = await page.inputValue('select[aria-label="Unidade da Largura do Polígono"]');
  if (unit !== 'cm') throw new Error(`unidade esperada cm, veio "${unit}"`);
  const unitHeight = await page.inputValue('select[aria-label="Unidade da Altura do Polígono"]');
  if (unitHeight !== 'cm') throw new Error(`unidade da altura esperada cm, veio "${unitHeight}"`);
  await shot(`${SHOTS}/12-pagina-escala.png`);
  return 'campos revelados';
});

await step('Unidade única (largura = altura) + prévia do tamanho real da célula', async () => {
  // Sem página/escala: 500 m × 500 m
  await page.uncheck('#analysis-grid-pagescale');
  await page.fill('#analysis-grid-width', '500');
  await page.fill('#analysis-grid-height', '500');
  let preview = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
  if (!preview.includes('500 m × 500 m')) {
    throw new Error(`prévia esperava "500 m × 500 m", veio "${preview.trim()}"`);
  }

  // Uma unidade só: trocar a unidade da largura também troca a da altura
  await page.selectOption('select[aria-label="Unidade da Largura do Polígono"]', 'km');
  const unitHeight = await page.inputValue('select[aria-label="Unidade da Altura do Polígono"]');
  if (unitHeight !== 'km') {
    throw new Error(`altura deveria acompanhar a largura (km), veio "${unitHeight}"`);
  }
  preview = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
  if (!preview.includes('500 km × 500 km')) {
    throw new Error(`prévia esperava "500 km × 500 km", veio "${preview.trim()}"`);
  }
  await page.selectOption('select[aria-label="Unidade da Largura do Polígono"]', 'm');

  // Página + escala: 50 cm em 1:2000 = 1 km no terreno
  await page.check('#analysis-grid-pagescale');
  await page.fill('#analysis-grid-scale', '1:2000');
  await page.fill('#analysis-grid-width', '50');
  await page.fill('#analysis-grid-height', '50');
  preview = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
  if (!preview.includes('1 km × 1 km')) {
    throw new Error(`prévia esperava "1 km × 1 km", veio "${preview.trim()}"`);
  }

  // Escala no formato brasileiro: "1:25.000" = 25000 (10 cm → 2,5 km)
  await page.fill('#analysis-grid-scale', '1:25.000');
  await page.fill('#analysis-grid-width', '10');
  await page.fill('#analysis-grid-height', '10');
  preview = (await page.textContent('#analysis-grid-cell-preview')) ?? '';
  if (!preview.includes('2,5 km × 2,5 km')) {
    throw new Error(`prévia esperava "2,5 km × 2,5 km", veio "${preview.trim()}"`);
  }

  // Escala inválida gera aviso claro (não silencia para 1:1)
  await page.fill('#analysis-grid-scale', 'abc');
  await page.click('button:has-text("Criar feições de índice da grade")');
  const aviso = (await page.locator('.notice.error').first().textContent({ timeout: 10000 })) ?? '';
  if (!aviso.includes('Escala do Mapa inválida')) {
    throw new Error(`esperava aviso de escala inválida, veio "${aviso.trim()}"`);
  }
  await shot(`${SHOTS}/12b-previa-celula.png`);

  // Restaura o cenário do próximo passo (escala vazia = 1:1)
  await page.fill('#analysis-grid-scale', '');
  return 'unidade única, prévia e escala em formato pt-BR corretas';
});

await step('Cria as feições de índice da grade (365000 × 270000 cm)', async () => {
  await page.fill('#analysis-grid-width', '365000');
  await page.fill('#analysis-grid-height', '270000');
  await page.fill('#analysis-grid-start-page', '1');
  await page.click('button:has-text("Criar feições de índice da grade")');
  await page.waitForSelector('.layer-item:has-text("GridIndexFeatures")', { timeout: 25000 });
  await page.waitForSelector('.badge:has-text("OK")', { timeout: 15000 });
  const meta = (await layerByName('GridIndexFeatures').locator('.layer-meta').textContent()) ?? '';
  if (!meta.includes('1 feições')) throw new Error(`esperava 1 feição gerada, painel mostra "${meta}"`);
  await shot(`${SHOTS}/13-grade-gerada.png`);
  return meta.trim();
});

await step('Segunda geração ganha sufixo 2 (GridIndexFeatures2)', async () => {
  await page.click('button:has-text("Criar feições de índice da grade")');
  await page.waitForSelector('.layer-item:has-text("GridIndexFeatures2")', { timeout: 25000 });
  await shot(`${SHOTS}/14-grade-gerada-2.png`);
  return 'GridIndexFeatures2 criada';
});

await step('Recorte: entrada = camada gera escada (células vazias removidas)', async () => {
  await page.click('.tab:has-text("Análise")');
  const value = await page.evaluate((nome) => {
    const sel = document.querySelector('#analysis-grid-base');
    const opt = [...(sel?.options ?? [])].find((o) => o.textContent?.startsWith(nome));
    return opt?.value;
  }, NOME_PONTOS);
  if (!value) throw new Error('opção da camada de pontos não encontrada no select');
  await page.uncheck('#analysis-grid-pagescale');
  await page.fill('#analysis-grid-width', '50000');
  await page.fill('#analysis-grid-height', '50000');
  await page.selectOption('#analysis-grid-base', value);
  await page.fill('#analysis-grid-output', 'GradeRecorte');
  await page.click('button:has-text("Criar feições de índice da grade")');
  try {
    await page.waitForSelector('.layer-item:has-text("GradeRecorte")', { timeout: 20000 });
  } catch {
    const message = await page
      .locator('.notice.error')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(`camada não criada — ${message ?? 'sem mensagem de erro'}`);
  }
  const meta = (await page.locator('.layer-item:has-text("GradeRecorte") .layer-meta').textContent()) ?? '';
  const count = Number((meta.match(/(\d+)\s+feições/) ?? [])[1]);
  if (!(count >= 1 && count <= 90)) {
    throw new Error(`esperava de 1 a 90 células (só as que intersectam), veio ${count} :: ${meta}`);
  }
  const log = (await page.textContent('.tab-content')) ?? '';
  if (!log.includes('descartadas')) throw new Error('log não registrou células descartadas pelo recorte');
  await shot(`${SHOTS}/15-recorte-camada.png`);
  return `${count} células (de uma grade retangular maior)`;
});

await step('Menu da camada + Tabela de Atributos da grade (padrão ArcMap)', async () => {
  const item = layerByName('GradeRecorte');
  await item.click({ button: 'right' });
  await page.waitForSelector('.ctx-menu', { timeout: 5000 });
  const itens = (await page.locator('.ctx-item').allTextContents()).map((t) => t.trim());
  for (const esperado of ['Abrir Tabela de Atributos', 'Ligar e Relacionar']) {
    if (!itens.some((texto) => texto.includes(esperado))) {
      throw new Error(`opção "${esperado}" ausente no menu: ${itens.join(' | ')}`);
    }
  }
  await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table', { timeout: 5000 });

  const cabecalhos = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  for (const campo of ['OID', 'Shape', 'ShapeName', 'PageNumber', 'Shape_Length', 'Shape_Area']) {
    if (!cabecalhos.includes(campo)) {
      throw new Error(`coluna "${campo}" ausente na tabela: ${cabecalhos.join(', ')}`);
    }
  }
  const linhas = await page.locator('.attr-table tbody tr').count();
  const meta = (await item.locator('.layer-meta').textContent()) ?? '';
  const esperadas = Number((meta.match(/(\d+)\s+feições/) ?? [])[1]);
  if (linhas !== esperadas) throw new Error(`tabela com ${linhas} linhas, camada tem ${esperadas} feições`);
  const primeira = (await page.locator('.attr-table tbody tr').first().textContent()) ?? '';
  if (!primeira.includes('Polígono')) throw new Error(`coluna Shape deveria mostrar Polígono: ${primeira}`);
  await shot(`${SHOTS}/17-tabela-atributos.png`);
  return `${linhas} linhas com OID, Shape, ShapeName, PageNumber, Shape_Length e Shape_Area`;
});

await step('Ligar e Relacionar: liga CSV pela chave e depois desliga', async () => {
  const headers0 = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  const idx = headers0.indexOf('ShapeName');
  const chaves = await page.evaluate(
    (i) =>
      [...document.querySelectorAll('.attr-table tbody tr')]
        .slice(0, 3)
        .map((tr) => tr.children[i]?.textContent?.trim() ?? ''),
    idx,
  );
  if (chaves.length === 0 || chaves.some((chave) => chave === '')) {
    throw new Error('não consegui ler os ShapeName da tabela');
  }

  const csv = [
    'ShapeName;Observacao;Setor',
    ...chaves.map((chave, i) => `${chave};Ponto de interesse ${i + 1};Centro`),
    'Z999;Fora da grade;Norte',
  ].join('\n');
  const csvPath = join(tmpdir(), 'geodesk-join.csv');
  writeFileSync(csvPath, csv, 'utf8');

  const item = layerByName('GradeRecorte');
  await item.click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.setInputFiles('#join-file', csvPath);
  await page.waitForTimeout(400);
  await page.selectOption('#join-key-layer', 'ShapeName');
  await page.selectOption('#join-key-table', 'ShapeName');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 });
  await page.waitForTimeout(300);

  const headers1 = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  if (!headers1.includes('Observacao') || !headers1.includes('Setor')) {
    throw new Error(`colunas ligadas ausentes na tabela: ${headers1.join(', ')}`);
  }
  const meta = (await item.locator('.layer-meta').textContent()) ?? '';
  if (!meta.includes('ligada a')) throw new Error(`cartão não mostrou a tabela ligada: ${meta}`);
  await shot(`${SHOTS}/18-tabela-ligada.png`);

  await item.click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Desligar tabela")').click();
  await page.waitForTimeout(300);
  const headers2 = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  if (headers2.includes('Observacao')) throw new Error('coluna ligada continuou presente após desligar');
  return `chaves ${chaves.join(', ')} ligadas e depois desligadas`;
});

await step('Ligar Dados (espacial): ponto recebe a célula e célula conta os pontos', async () => {
  try {
    // 1) Destino = pontos, ligação = grade → cada ponto ganha ShapeName/PageNumber
    await layerByName(NOME_PONTOS).click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
  await page.waitForSelector('#join-kind', { timeout: 5000 });
  await page.selectOption('#join-kind', 'spatial');
  await page.waitForSelector('#join-space-layer', { timeout: 5000 });

  const gradeId = await page.evaluate(() => {
    const sel = document.querySelector('#join-space-layer');
    const opt = [...(sel?.options ?? [])].find((o) => o.textContent === 'GradeRecorte');
    return opt?.value ?? '';
  });
  if (!gradeId) throw new Error('GradeRecorte não apareceu na lista da ligação espacial');
  await page.selectOption('#join-space-layer', gradeId);

  const geo1 = ((await page.locator('.join-geo').textContent()) ?? '').replace(/\s+/g, ' ').trim();
  if (!geo1.includes('Polígonos para Pontos')) {
    throw new Error(`descrição geométrica inesperada: "${geo1}"`);
  }
  if (!(await page.locator('#join-space-mode-containment').isChecked())) {
    throw new Error('opção "ponto recebe o polígono que o contém" não veio marcada');
  }
  await page.fill('#join-space-output', 'TrafoPagina');
  await shot(`${SHOTS}/24-ligar-dados-pontos.png`);
  await page.click('.modal-actions .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 });
  await page.waitForSelector('.layer-item:has-text("TrafoPagina")', { timeout: 30000 });

  // A tabela da nova camada traz os campos da grade ligados
  await layerByName('TrafoPagina').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
  const headers1 = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  const colShape = headers1.indexOf('ShapeName');
  const colPage = headers1.indexOf('PageNumber');
  if (colShape < 0 || colPage < 0) throw new Error(`campos da grade ausentes: ${headers1.join(', ')}`);
  if (headers1.includes('Shape_Length') || headers1.includes('Shape_Area')) {
    throw new Error(`Shape_Length/Shape_Area viajaram na ligação: ${headers1.join(', ')}`);
  }
  const preenchidos = await page.evaluate(
    (i) =>
      [...document.querySelectorAll('.attr-table tbody tr')].filter(
        (tr) => (tr.children[i]?.textContent ?? '').trim() !== '',
      ).length,
    colShape,
  );
  if (preenchidos === 0) throw new Error('nenhum ponto recebeu ShapeName do polígono');
  await shot(`${SHOTS}/25-tabela-ponto-pagina.png`);

  // 2) Destino = grade, ligação = pontos → contagem + estatísticas (Soma/Máximo)
  await layerByName('GradeRecorte').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
  await page.waitForSelector('#join-kind', { timeout: 5000 });
  await page.selectOption('#join-kind', 'spatial');
  await page.waitForSelector('#join-space-layer', { timeout: 5000 });
  const pontosId = await page.evaluate((nome) => {
    const sel = document.querySelector('#join-space-layer');
    const opt = [...(sel?.options ?? [])].find((o) => o.textContent === nome);
    return opt?.value ?? '';
  }, NOME_PONTOS);
  if (!pontosId) throw new Error(`${NOME_PONTOS} não apareceu na lista da ligação espacial`);
  await page.selectOption('#join-space-layer', pontosId);

  const geo2 = ((await page.locator('.join-geo').textContent()) ?? '').replace(/\s+/g, ' ').trim();
  if (!geo2.includes('Pontos para Polígonos')) {
    throw new Error(`descrição geométrica inesperada: "${geo2}"`);
  }
  await page.check('#join-space-mode-summary');
  await page.check('#join-stat-sum');
  await page.check('#join-stat-max');
  await page.fill('#join-space-output', 'CelulaContagem');
  await shot(`${SHOTS}/26-ligar-dados-resumo.png`);
  await page.click('.modal-actions .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 });
  await page.waitForSelector('.layer-item:has-text("CelulaContagem")', { timeout: 30000 });

  await layerByName('CelulaContagem').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
  const headers2 = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
  if (!headers2.includes('Join_Count')) throw new Error(`Join_Count ausente: ${headers2.join(', ')}`);
  const colSum = headers2.findIndex((h) => h.startsWith('SUM_'));
  const colMax = headers2.findIndex((h) => h.startsWith('MAX_'));
  if (colSum < 0 || colMax < 0) throw new Error(`colunas SUM_/MAX_ ausentes: ${headers2.join(', ')}`);
  const counts = await page.evaluate(
    (i) =>
      [...document.querySelectorAll('.attr-table tbody tr')]
        .map((tr) => Number((tr.children[i]?.textContent ?? '').replace(',', '.')))
        .filter((v) => Number.isFinite(v)),
    headers2.indexOf('Join_Count'),
  );
  const comPontos = counts.filter((v) => v > 0).length;
  if (comPontos === 0) throw new Error(`nenhuma célula registrou pontos (${counts.join(', ')})`);
    await shot(`${SHOTS}/27-tabela-contagem.png`);
    return `${preenchidos} pontos com ShapeName; ${comPontos} células com Join_Count > 0 (${counts.slice(0, 8).join(', ')}…); colunas ${headers2[colSum]}, ${headers2[colMax]}`;
  } finally {
    // Se a etapa falhou com o diálogo aberto, fecha para não travar as próximas.
    if ((await page.locator('.modal-overlay').count()) > 0) {
      await page
        .locator('.modal-actions .btn:text-is("Cancelar")')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
    }
  }
});

await step('Ligar e Relacionar: liga camada com camada por chave e orienta para a espacial', async () => {
  try {
    // 1) GradeRecorte ← GradeVista por campo em comum → nova camada consolidada
    await layerByName('GradeRecorte').click({ button: 'right' });
    await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
    await page.waitForSelector('#join-source', { timeout: 5000 });

    const vistaId = await page.evaluate(() => {
      const sel = document.querySelector('#join-source');
      const opt = [...(sel?.options ?? [])].find((o) => (o.textContent ?? '').startsWith('GradeVista'));
      return opt?.value ?? '';
    });
    if (!vistaId) throw new Error('GradeVista não apareceu na lista de origens');
    await page.selectOption('#join-source', vistaId);
    await page.waitForTimeout(400);

    if ((await page.locator('.join-notice').count()) > 0) {
      throw new Error('aviso de "sem chave em comum" apareceu para camadas com campos em comum');
    }
    const k1 = await page.inputValue('#join-key-layer');
    const k2 = await page.inputValue('#join-key-table');
    if (!k1 || !k2) throw new Error('chave não foi sugerida automaticamente');
    if (await page.locator('.modal-actions .btn.primary').isDisabled()) {
      throw new Error('botão Ligar continua desabilitado com camada de origem escolhida');
    }
    await shot(`${SHOTS}/28-ligar-camada-camada.png`);
    await page.click('.modal-actions .btn.primary');
    await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 });
    await page.waitForSelector('.layer-item:has-text("Ligação")', { timeout: 30000 });

    // A tabela da nova camada traz as colunas da origem renomeadas por conflito (_1)
    const nova = page
      .locator('.layer-item')
      .filter({ hasText: 'Ligação — GradeRecorte + GradeVista' })
      .first();
    await nova.click({ button: 'right' });
    await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
    await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
    const headers = (await page.locator('.attr-table thead th').allTextContents()).map((t) => t.trim());
    if (!headers.includes('ShapeName_1') || !headers.includes('PageNumber_1')) {
      throw new Error(`colunas da origem renomeadas ausentes: ${headers.join(', ')}`);
    }
    if (headers.includes('Shape_Length_1') || headers.includes('Shape_Area_1')) {
      throw new Error(`Shape_Length/Area da origem viajaram na ligação: ${headers.join(', ')}`);
    }
    const col = headers.indexOf('ShapeName_1');
    const preenchidas = await page.evaluate(
      (i) =>
        [...document.querySelectorAll('.attr-table tbody tr')].filter(
          (tr) => (tr.children[i]?.textContent ?? '').trim() !== '',
        ).length,
      col,
    );
    if (preenchidas === 0) throw new Error('coluna ShapeName_1 veio vazia em todas as linhas');
    const linhas = await page.locator('.attr-table tbody tr').count();
    const metaRecorte = (await layerByName('GradeRecorte').locator('.layer-meta').textContent()) ?? '';
    const esperadas = Number((metaRecorte.match(/(\d+)\s+feições/) ?? [])[1]);
    if (linhas !== esperadas) {
      throw new Error(`a nova camada deveria manter ${esperadas} feições, a tabela tem ${linhas}`);
    }

    // 2) Sem chave em comum (pontos ← grade): o aviso oferece a ligação espacial
    await layerByName(NOME_PONTOS).click({ button: 'right' });
    await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
    await page.waitForSelector('#join-source', { timeout: 5000 });
    const gradeId = await page.evaluate(() => {
      const sel = document.querySelector('#join-source');
      const opt = [...(sel?.options ?? [])].find((o) => (o.textContent ?? '').startsWith('GradeRecorte'));
      return opt?.value ?? '';
    });
    if (!gradeId) throw new Error('GradeRecorte não apareceu na lista de origens');
    await page.selectOption('#join-source', gradeId);
    await page.waitForSelector('.join-notice', { timeout: 5000 });
    await shot(`${SHOTS}/29-sem-chave-orienta-espacial.png`);
    await page.locator('.join-notice .btn').click();
    await page.waitForSelector('#join-space-layer', { timeout: 5000 });
    const valorEspacial = await page.inputValue('#join-space-layer');
    if (valorEspacial !== gradeId) throw new Error(`a opção espacial não herdou a camada: ${valorEspacial}`);
    await page.locator('.modal-actions .btn:text-is("Cancelar")').click();
    await page.waitForSelector('.modal', { state: 'detached', timeout: 5000 });

    return `chave sugerida ${k1} = ${k2}; ${preenchidas} de ${linhas} linhas com ShapeName_1; aviso guiou para a espacial`;
  } finally {
    if ((await page.locator('.modal-overlay').count()) > 0) {
      await page
        .locator('.modal-actions .btn:text-is("Cancelar")')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
    }
  }
});

await step('Ligar e Relacionar: carrega arquivo do disco direto no diálogo', async () => {
  try {
    const discoPath = join(tmpdir(), 'geodesk-disco.geojson');
    writeFileSync(
      discoPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { codigo: 'X1', valor: 10 },
            geometry: { type: 'Point', coordinates: [-47, -22.5] },
          },
          {
            type: 'Feature',
            properties: { codigo: 'X2', valor: 20 },
            geometry: { type: 'Point', coordinates: [-50, -23] },
          },
        ],
      }),
      'utf8'
    );

    // 1) Modo espacial: carrega o GeoJSON e ele já vem selecionado como camada de ligação
    await layerByName('GradeRecorte').click({ button: 'right' });
    await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
    await page.waitForSelector('#join-kind', { timeout: 5000 });
    await page.selectOption('#join-kind', 'spatial');
    await page.waitForSelector('#join-space-layer', { timeout: 5000 });
    const totalAntes = await page.locator('.layer-item').count();
    await page.setInputFiles('#join-geojson-input', discoPath);
    await page.waitForFunction(
      (n) => document.querySelectorAll('.layer-item').length > n,
      totalAntes,
      { timeout: 30000 }
    );
    const ligacao = await page
      .locator('#join-space-layer')
      .evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
    if (!ligacao.startsWith('geodesk-disco')) {
      throw new Error(`camada carregada não veio selecionada como ligação: "${ligacao}"`);
    }
    await shot(`${SHOTS}/31-carregar-disco-na-ligacao.png`);
    await page.locator('.modal-actions .btn:text-is("Cancelar")').click();
    await page.waitForSelector('.modal', { state: 'detached', timeout: 5000 });

    // 2) Modo tabela: o arquivo carregado já vira a origem dos dados
    await layerByName('GradeRecorte').click({ button: 'right' });
    await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
    await page.waitForSelector('#join-source', { timeout: 5000 });
    await page.setInputFiles('#join-geojson-input', discoPath);
    await page.waitForFunction(
      () =>
        (document.querySelector('#join-source')?.selectedOptions[0]?.textContent ?? '').startsWith(
          'geodesk-disco'
        ),
      undefined,
      { timeout: 30000 }
    );
    const origem = await page
      .locator('#join-source')
      .evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
    await page.locator('.modal-actions .btn:text-is("Cancelar")').click();
    await page.waitForSelector('.modal', { state: 'detached', timeout: 5000 });

    return `espacial: ligação = ${ligacao}; tabela: origem = ${origem}`;
  } finally {
    if ((await page.locator('.modal-overlay').count()) > 0) {
      await page
        .locator('.modal-actions .btn:text-is("Cancelar")')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
    }
  }
});

await step('Ligação espacial conta ponto sobre a borda da célula (padrão ArcMap)', async () => {
  const dir = join(tmpdir(), 'geodesk-borda-e2e');
  mkdirSync(dir, { recursive: true });
  // Célula retangular e 4 pontos: dentro, na aresta leste, no canto e fora (~1 m).
  writeFileSync(
    join(dir, 'celula.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { celula: 'C1' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-47.1, -22.6],
                [-47.0, -22.6],
                [-47.0, -22.5],
                [-47.1, -22.5],
                [-47.1, -22.6],
              ],
            ],
          },
        },
      ],
    }),
    'utf8',
  );
  writeFileSync(
    join(dir, 'pontos-borda.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { nome: 'DENTRO' }, geometry: { type: 'Point', coordinates: [-47.05, -22.55] } },
        { type: 'Feature', properties: { nome: 'ARESTA' }, geometry: { type: 'Point', coordinates: [-47.0, -22.55] } },
        { type: 'Feature', properties: { nome: 'CANTO' }, geometry: { type: 'Point', coordinates: [-47.1, -22.6] } },
        { type: 'Feature', properties: { nome: 'FORA' }, geometry: { type: 'Point', coordinates: [-46.99999, -22.55] } },
      ],
    }),
    'utf8',
  );

  const geojsonInput =
    'input[accept=".geojson,.json,application/geo+json,application/json"]:not(#join-geojson-input)';
  await page.setInputFiles(geojsonInput, join(dir, 'celula.geojson'));
  await layerByName('celula').waitFor({ timeout: 20000 });
  await page.setInputFiles(geojsonInput, join(dir, 'pontos-borda.geojson'));
  await layerByName('pontos-borda').waitFor({ timeout: 20000 });

  // Destino = pontos; ligação = célula (modo "contém" é o único para pontos ← polígonos)
  await layerByName('pontos-borda').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
  await page.waitForSelector('#join-kind', { timeout: 5000 });
  await page.selectOption('#join-kind', 'spatial');
  await page.waitForSelector('#join-space-layer', { timeout: 5000 });
  await page.selectOption('#join-space-layer', { label: 'celula' });
  await page.waitForSelector('#join-space-mode-containment', { timeout: 5000 });
  await page.fill('#join-space-output', 'BordaJoin');
  await page.click('.modal-actions .btn.primary');
  await page.waitForSelector('.layer-item:has-text("BordaJoin")', { timeout: 30000 });

  await layerByName('BordaJoin').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
  const porNome = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.attr-table thead th')].map((th) => th.textContent.trim());
    const colNome = headers.indexOf('nome');
    const colCelula = headers.indexOf('celula');
    const out = {};
    for (const tr of document.querySelectorAll('.attr-table tbody tr')) {
      out[(tr.children[colNome]?.textContent ?? '').trim()] = (tr.children[colCelula]?.textContent ?? '').trim();
    }
    return out;
  });
  if (porNome.DENTRO !== 'C1') throw new Error(`ponto dentro não recebeu a célula: ${JSON.stringify(porNome)}`);
  if (porNome.ARESTA !== 'C1') throw new Error(`ponto na aresta não foi contado: ${JSON.stringify(porNome)}`);
  if (porNome.CANTO !== 'C1') throw new Error(`ponto no canto não foi contado: ${JSON.stringify(porNome)}`);
  if (porNome.FORA === 'C1') throw new Error(`ponto fora da célula contado indevidamente: ${JSON.stringify(porNome)}`);

  // Raio de busca (ArcGIS Pro): com 2 m, o ponto ~1 m fora também conta.
  await layerByName('pontos-borda').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Ligar e Relacionar")').click();
  await page.waitForSelector('#join-kind', { timeout: 5000 });
  await page.selectOption('#join-kind', 'spatial');
  await page.waitForSelector('#join-space-layer', { timeout: 5000 });
  await page.selectOption('#join-space-layer', { label: 'celula' });
  await page.waitForSelector('#join-space-radius', { timeout: 5000 });
  await page.fill('#join-space-radius', '2');
  await page.fill('#join-space-output', 'BordaJoinRaio');
  await page.click('.modal-actions .btn.primary');
  await page.waitForSelector('.layer-item:has-text("BordaJoinRaio")', { timeout: 30000 });

  await layerByName('BordaJoinRaio').click({ button: 'right' });
  await page.locator('.ctx-item:has-text("Abrir Tabela de Atributos")').click();
  await page.waitForSelector('.attr-table thead th', { timeout: 10000 });
  const porNomeRaio = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.attr-table thead th')].map((th) => th.textContent.trim());
    const colNome = headers.indexOf('nome');
    const colCelula = headers.indexOf('celula');
    const out = {};
    for (const tr of document.querySelectorAll('.attr-table tbody tr')) {
      out[(tr.children[colNome]?.textContent ?? '').trim()] = (tr.children[colCelula]?.textContent ?? '').trim();
    }
    return out;
  });
  if (porNomeRaio.FORA !== 'C1') {
    throw new Error(`raio de 2 m não alcançou o ponto fora: ${JSON.stringify(porNomeRaio)}`);
  }
  await shot(`${SHOTS}/34-ponto-sobre-borda.png`);
  return (
    `sem raio: dentro, aresta e canto = C1, fora = ${porNome.FORA || 'sem célula'}; ` +
    `com raio 2 m: fora = ${porNomeRaio.FORA}`
  );
});

await step('Rótulos da grade: rótulo liga/desliga no mapa e vem no padrão', async () => {
  await page.click('.tab:has-text("Análise")');

  // Origem = camada de pontos (várias células) para o teste de rótulos
  const value = await page.evaluate((nome) => {
    const sel = document.querySelector('#analysis-grid-base');
    const opt = [...(sel?.options ?? [])].find((o) => o.textContent?.startsWith(nome));
    return opt?.value;
  }, NOME_PONTOS);
  if (!value) throw new Error('opção da camada de pontos não encontrada no select');
  await page.uncheck('#analysis-grid-pagescale');
  await page.fill('#analysis-grid-width', '50000');
  await page.fill('#analysis-grid-height', '50000');
  await page.selectOption('#analysis-grid-base', value);

  // Grade sem rótulos (medição de base), com todas as outras camadas ocultas
  await page.uncheck('#analysis-grid-labels');
  await page.fill('#analysis-grid-output', 'GradeSemRotulos');
  await page.click('button:has-text("Criar feições de índice da grade")');
  try {
    await page.waitForSelector('.layer-item:has-text("GradeSemRotulos")', { timeout: 25000 });
  } catch {
    const notice = await page.locator('.notice.error').first().textContent().catch(() => null);
    const status = await page.locator('.status-bar').textContent().catch(() => null);
    const origin = await page.locator('#analysis-grid-base').inputValue().catch(() => null);
    throw new Error(
      `grade sem rótulos não criada :: origem=${origin} status=${status} aviso=${notice ?? 'sem aviso'}`,
    );
  }
  await clickEnquantoExistir('Ocultar camada');
  await page.waitForTimeout(1200);
  const base = await countMapWhitePixels();

  // Grade com rótulos (padrão): é a única camada visível, então a máscara sai branca
  await page.check('#analysis-grid-labels');
  await page.fill('#analysis-grid-output', 'GradeComRotulos');
  await page.click('button:has-text("Criar feições de índice da grade")');
  await page.waitForSelector('.layer-item:has-text("GradeComRotulos")', { timeout: 25000 });
  await page.waitForTimeout(1500);
  const com = await countMapWhitePixels();
  await clickEnquantoExistir('Mostrar camada'); // reexibe tudo para os próximos passos

  if (com.count - base.count < 300) {
    throw new Error(
      `esperava rótulos no mapa, ganhou apenas ${com.count - base.count} pixels claros :: base ${JSON.stringify(base)} com ${JSON.stringify(com)}`,
    );
  }

  // A camada da grade vem com os rótulos ligados e no campo ShapeName
  const item = layerByName('GradeComRotulos');
  await item.locator('.layer-swatch-btn').click();
  await page.waitForSelector('.sym-panel', { timeout: 5000 });
  if (!(await page.locator('.sym-panel input[type="checkbox"]').isChecked())) {
    throw new Error('rótulos deveriam vir marcados na camada da grade');
  }
  const campo = await page.locator('.sym-panel select').first().inputValue();
  if (campo !== 'ShapeName') throw new Error(`campo do rótulo esperado ShapeName, veio "${campo}"`);
  await item.locator('.layer-swatch-btn').click();

  await shot(`${SHOTS}/19-rotulos-grade.png`);
  return `${com.count - base.count} pixels de rótulo a mais (base ${base.count} → ${com.count}), campo ShapeName`;
});

await step('Menu > Rótulos: diálogo estilo ArcMap aplica, cancela e liga/desliga', async () => {
  await page.click('.tab:has-text("Análise")');
  const item = layerByName('GradeComRotulos');
  await item.click({ button: 'right' });
  await page.waitForSelector('.ctx-menu', { timeout: 5000 });
  const menuTxt = (await page.locator('.ctx-menu').textContent()) ?? '';
  if (!menuTxt.includes('Rótulos')) throw new Error('item "Rótulos…" ausente do menu da camada');
  await page.click('.ctx-item:has-text("Rótulos")');
  await page.waitForSelector('#lbl-field', { timeout: 5000 });

  // O diálogo abre com o estado atual da camada e lista os campos (como o ArcMap)
  if (!(await page.locator('.lbl-enable input[type="checkbox"]').isChecked())) {
    throw new Error('diálogo deveria abrir com "Rotular feições nesta camada" marcado');
  }
  const campo = await page.locator('#lbl-field').inputValue();
  if (campo !== 'ShapeName') throw new Error(`campo inicial esperado ShapeName, veio "${campo}"`);
  const opcoes = await page.locator('#lbl-field option').count();
  if (opcoes < 3) throw new Error(`seleção de campo com apenas ${opcoes} opções`);
  await shot(`${SHOTS}/21-dialogo-rotulos.png`);

  // Cancelar desfaz a alteração (tamanho 24 volta a 12)
  await page.selectOption('#lbl-size', '24');
  await page.click('.lbl-modal .btn:text-is("Cancelar")');
  await page.waitForSelector('#lbl-field', { state: 'detached', timeout: 5000 });
  await item.click({ button: 'right' });
  await page.click('.ctx-item:has-text("Rótulos")');
  await page.waitForSelector('#lbl-field', { timeout: 5000 });
  const tamanho = await page.locator('#lbl-size').inputValue();
  if (tamanho !== '12') throw new Error(`Cancelar deveria manter o tamanho 12, veio ${tamanho}`);

  // Aplicar: negrito marcado e o diálogo continua aberto
  await page.click('.lbl-style[title="Negrito"]');
  const boldCls = (await page.locator('.lbl-style[title="Negrito"]').getAttribute('class')) ?? '';
  if (!boldCls.includes('active')) throw new Error('botão Negrito não marcou no diálogo');
  await page.click('.lbl-modal .btn:text-is("Aplicar")');
  await page.waitForTimeout(300);
  if ((await page.locator('#lbl-field').count()) !== 1) {
    throw new Error('Aplicar deveria manter o diálogo aberto');
  }
  await page.click('.lbl-modal .btn:text-is("Cancelar")');
  await page.waitForSelector('#lbl-field', { state: 'detached', timeout: 5000 });

  // Desliga os rótulos com OK e mede o mapa (só a grade visível, sem texto)
  await item.click({ button: 'right' });
  await page.click('.ctx-item:has-text("Rótulos")');
  await page.waitForSelector('#lbl-field');
  await page.uncheck('.lbl-enable input[type="checkbox"]');
  await page.click('.lbl-modal .btn:text-is("OK")');
  await page.waitForSelector('#lbl-field', { state: 'detached', timeout: 5000 });
  await clickEnquantoExistir('Ocultar camada');
  await layerByName('GradeComRotulos').locator('.icon-btn[title="Mostrar camada"]').click();
  await page.waitForTimeout(1200);
  const sem = await countMapWhitePixels();

  // Religa pelo mesmo diálogo e mede de novo
  const grid = layerByName('GradeComRotulos');
  await grid.click({ button: 'right' });
  await page.click('.ctx-item:has-text("Rótulos")');
  await page.waitForSelector('#lbl-field');
  await page.check('.lbl-enable input[type="checkbox"]');
  await page.click('.lbl-modal .btn:text-is("OK")');
  await page.waitForTimeout(1500);
  const com = await countMapWhitePixels();
  await clickEnquantoExistir('Mostrar camada');

  if (sem.count > 300) {
    throw new Error(`rótulos desligados deveriam sumir, restaram ${sem.count} pixels claros`);
  }
  if (com.count - sem.count < 300) {
    throw new Error(`rótulos religados não apareceram (${sem.count} → ${com.count})`);
  }
  await shot(`${SHOTS}/22-rotulos-religados.png`);
  return `${opcoes} campos, cancelar manteve ${tamanho}, pixels claros ${sem.count} → ${com.count}`;
});

await step('Simbologia: alterar ícone, cor e restaurar padrão', async () => {
  const item = layerByName(NOME_PONTOS);
  await item.locator('.layer-swatch-btn').click();
  await page.waitForSelector('.sym-panel', { timeout: 5000 });

  await page.locator('.shape-btn[title="Estrela"]').click();
  await page.locator('.sym-panel input[type="color"]').nth(1).fill('#ff0000');
  await page.waitForTimeout(400);

  const activeTitle = await page.locator('.shape-btn.active').getAttribute('title');
  if (activeTitle !== 'Estrela') throw new Error(`ícone ativo esperado Estrela, veio "${activeTitle}"`);
  const swatchFill = await item.locator('.layer-swatch-btn svg polygon').first().getAttribute('fill');
  const corOk =
    !!swatchFill && (swatchFill.includes('255, 0, 0') || swatchFill.toLowerCase() === '#ff0000');
  if (!corOk) {
    throw new Error(`cor do ícone não aplicada na miniatura: ${swatchFill}`);
  }
  await shot(`${SHOTS}/16-simbologia-estrela.png`);

  await page.locator('.sym-panel .btn:has-text("Restaurar padrão")').click();
  await page.waitForTimeout(300);
  const restoredTitle = await page.locator('.shape-btn.active').getAttribute('title');
  if (restoredTitle !== 'Círculo') {
    throw new Error(`após restaurar, ícone esperado Círculo, veio "${restoredTitle}"`);
  }
  await item.locator('.layer-swatch-btn').click();
  return 'ícone, cor e restauração ok';
});

await step('Cartões da aba Análise recolhem e voltam (seta no título)', async () => {
  try {
    await page.click('.tab:has-text("Análise")');
    const toggleGrade = page.locator('.card-toggle:has-text("Feições de Índice da Grade")');
    const toggles = await page.locator('.card-toggle').count();
    if (toggles < 6) throw new Error(`esperava 6 cartões recolhíveis, achei ${toggles}`);

    // Estado de execuções anteriores pode ter ficado recolhido (preferência salva) — reabre.
    if ((await page.locator('#analysis-grid-output:visible').count()) === 0) {
      await toggleGrade.click();
      await page.waitForSelector('#analysis-grid-output', { state: 'visible', timeout: 5000 });
    }

    // Recolhe: o conteúdo some e a seta vira para cima
    await toggleGrade.click();
    await page.waitForSelector('#analysis-grid-output', { state: 'hidden', timeout: 5000 });
    const expandido = await toggleGrade.getAttribute('aria-expanded');
    if (expandido !== 'false') throw new Error(`aria-expanded deveria ser false, veio "${expandido}"`);
    await shot(`${SHOTS}/30-cartao-recolhido.png`);

    // Reabre: o conteúdo volta
    await toggleGrade.click();
    await page.waitForSelector('#analysis-grid-output', { state: 'visible', timeout: 5000 });
    return `${toggles} cartões com seta; grade recolhida e reaberta`;
  } finally {
    // Devolve o cartão da grade aberto para as próximas execuções.
    if ((await page.locator('#analysis-grid-output:visible').count()) === 0) {
      await page
        .locator('.card-toggle:has-text("Feições de Índice da Grade")')
        .click()
        .catch(() => {});
      await page.waitForTimeout(200);
    }
  }
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
