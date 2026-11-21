// E2E: abrir GeoPackage (.gpkg) e projeto do QGIS (.qgz) no aplicativo.
//
//   node scripts/e2e-gpkg-qgis.mjs
//
// Gera os arquivos de amostra numa pasta temporária, abre o GeoDesk empacotado
// (dist/) com Electron + Playwright e dispara o seletor de arquivos de cada
// formato, conferindo as camadas que aparecem no Gerenciador de Camadas e a
// mensagem da barra de status.

import { _electron as electron } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { writeShapefileFixture } from './lib/fixture-shp.mjs';
import { writeGeoPackageFixture } from './lib/fixture-gpkg.mjs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const tmp = join(tmpdir(), 'geodesk-e2e-gpkg-qgis');
mkdirSync(tmp, { recursive: true });

// --- Amostra 1: GeoPackage solto ------------------------------------------
const gpkgPath = await writeGeoPackageFixture(join(tmp, 'estados.gpkg'));

// --- Amostra 2: projeto QGIS (.qgz) com shapefile, GeoJSON e GeoPackage ----
const dadosDir = join(tmp, 'projeto-qgis', 'dados');
writeShapefileFixture(dadosDir, 'estacoes');
writeFileSync(
  join(dadosDir, 'bairros.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nome: 'Centro' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-47.95, -15.77],
              [-47.94, -15.77],
              [-47.94, -15.78],
              [-47.95, -15.78],
              [-47.95, -15.77],
            ],
          ],
        },
      },
    ],
  }),
);
await writeGeoPackageFixture(join(dadosDir, 'camadas.gpkg'));

const qgs = `<?xml version="1.0" encoding="UTF-8"?>
<qgis projectname="Amostra GeoDesk">
  <projectlayers>
    <maplayer type="vector" geometry="point">
      <datasource>./dados/estacoes.shp</datasource>
      <layername>Estações</layername>
      <provider>ogr</provider>
      <srs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></srs>
    </maplayer>
    <maplayer type="vector" geometry="polygon">
      <datasource>./dados/bairros.geojson</datasource>
      <layername>Bairros</layername>
      <provider>ogr</provider>
      <srs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></srs>
    </maplayer>
    <maplayer type="vector" geometry="polygon">
      <datasource>GPKG:./dados/camadas.gpkg:estados</datasource>
      <layername>Estados do GPKG</layername>
      <provider>ogr</provider>
      <srs><spatialrefsys><authid>EPSG:4674</authid></spatialrefsys></srs>
    </maplayer>
    <maplayer type="raster">
      <datasource>./dados/matriz.tif</datasource>
      <layername>Matriz</layername>
      <provider>gdal</provider>
    </maplayer>
    <maplayer type="vector">
      <datasource>dbname='sig' host=localhost table=sig.cidades</datasource>
      <layername>Cidades (PostGIS)</layername>
      <provider>postgres</provider>
    </maplayer>
  </projectlayers>
</qgis>`;

const zip = new JSZip();
zip.file('projeto-amostra.qgs', qgs);
// O .qgz fica na mesma pasta de "dados/", como num projeto QGIS de verdade.
const qgzPath = join(tmp, 'projeto-qgis', 'projeto-amostra.qgz');
writeFileSync(qgzPath, await zip.generateAsync({ type: 'nodebuffer' }));

// --- Aplicativo ------------------------------------------------------------

const results = [];
let anyFail = false;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) anyFail = true;
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
const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

/**
 * A primeira janela do app é a splash (electron/main.cjs); esperamos a
 * janela principal carregar o dist/index.html.
 */
async function waitForMainWindow(application) {
  for (let i = 0; i < 60; i++) {
    const main = application.windows().find((w) => !w.url().includes('splash.html'));
    if (main) return main;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('a janela principal do GeoDesk não abriu');
}

const page = await waitForMainWindow(app);
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

await step('App abre e renderiza a interface', async () => {
  await page.waitForSelector('.app-shell', { timeout: 25000 });
  await page.waitForTimeout(800);
});

await step('GeoPackage (.gpkg) carrega a camada de feições', async () => {
  await page.setInputFiles('input[accept=".gpkg"]', gpkgPath);
  await page.waitForSelector('.layer-name:text-is("estados")', { timeout: 90000 });
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('GeoPackage estados carregado')) {
    throw new Error(`status inesperado: ${status.slice(0, 160)}`);
  }
  const card = page.locator('.layer-item').filter({ hasText: 'estados' }).first();
  const subTag = (await card.locator('.layer-sub-tag').first().textContent()) ?? '';
  if (!subTag.includes('4 feições')) throw new Error(`contagem inesperada: ${subTag}`);
  return status.slice(0, 120);
});

await step('Camada do GeoPackage abre a aba de atributos com os campos', async () => {
  await page.click('.right-panel-segmented-strip button:has-text("Atributos")');
  const content = (await page.textContent('.tab-content')) ?? '';
  for (const field of ['OID', 'nome', 'populacao']) {
    if (!content.includes(field)) throw new Error(`campo "${field}" ausente na tabela`);
  }
  await page.screenshot({ path: `${SHOTS}/e2e-gpkg-aberto.png` });
});

await step('Projeto QGIS (.qgz) carrega shapefile, GeoJSON e camada do GeoPackage', async () => {
  await page.setInputFiles('input[accept=".qgs,.qgz"]', qgzPath);
  for (const layer of ['Estações', 'Bairros', 'Estados do GPKG']) {
    await page.waitForSelector(`.layer-name:text-is("${layer}")`, { timeout: 90000 });
  }
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('3 camadas carregadas')) {
    throw new Error(`status inesperado: ${status.slice(0, 200)}`);
  }
  return status.slice(0, 160);
});

await step('Camadas não suportadas são informadas como ignoradas', async () => {
  const status = (await page.textContent('.status-bar')) ?? '';
  if (!status.includes('ignoradas')) throw new Error(`status sem "ignoradas": ${status.slice(0, 200)}`);
  if (!status.includes('Matriz') || !status.includes('Cidades (PostGIS)')) {
    throw new Error(`camadas ignoradas não listadas: ${status.slice(0, 240)}`);
  }
  await page.screenshot({ path: `${SHOTS}/e2e-projeto-qgis-aberto.png` });
});

await step('Nenhum erro de console inesperado', async () => {
  const relevant = consoleErrors.filter((line) => !/favicon|404 \(File not found\)/i.test(line));
  if (relevant.length > 0) throw new Error(relevant.slice(0, 3).join(' | '));
});

await app.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nTodos os testes passaram.' : `\n${failed} teste(s) falharam.`);
process.exit(anyFail ? 1 : 0);
