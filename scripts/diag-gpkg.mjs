// Diagnóstico do leitor de GeoPackage (.gpkg) e do interpretador de caminhos
// do QGIS — roda fora do navegador, em Node:
//
//   node scripts/diag-gpkg.mjs
//
// Grava um GeoPackage de amostra (cabeçalho GPKG + WKB, como gravam QGIS e
// ArcGIS) e confere se a decodificação (src/import/wkb.ts) devolve o GeoJSON
// esperado. Também confere o parsing dos datasources do QGIS
// (src/import/qgisPaths.ts).

import esbuild from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { writeGeoPackageFixture, wkbPoint, gpkgBlob } from './lib/fixture-gpkg.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'geodesk-gpkg-'));

// ---------------------------------------------------------------------------
// Compila os módulos puros do app para ESM e carrega em memória
// ---------------------------------------------------------------------------

async function loadModule(relativeEntry) {
  const outfile = path.join(tmp, `${path.basename(relativeEntry, '.ts')}.mjs`);
  esbuild.buildSync({
    entryPoints: [path.join(root, relativeEntry)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
  });
  return import(pathToFileURL(outfile).href);
}

const { decodeGpkgGeometry, readGpkgSrsId } = await loadModule('src/import/wkb.ts');
const { parseOgrSource, extensionOf, baseNameOf } = await loadModule('src/import/qgisPaths.ts');

let failures = 0;
function check(label, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALHA'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// ---------------------------------------------------------------------------
// Grava o GeoPackage de amostra e reabre (mesmo caminho feito pelo aplicativo)
// ---------------------------------------------------------------------------

const gpkgPath = path.join(tmp, 'estados.gpkg');
await writeGeoPackageFixture(gpkgPath);

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(await fs.readFile(gpkgPath)));

const metadata = db.exec(
  `SELECT c.table_name, g.column_name, c.srs_id
     FROM gpkg_contents c
     JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
    WHERE c.data_type = 'features'`,
);
check('tabela de feições identificada', metadata[0]?.values?.[0]?.[0] === 'estados');
check('coluna de geometria identificada', metadata[0]?.values?.[0]?.[1] === 'geom');
check('srs_id lido dos metadados', metadata[0]?.values?.[0]?.[2] === 4674);
check(
  'tabelas sem geometria ficam de fora',
  db.exec("SELECT COUNT(*) FROM gpkg_contents WHERE data_type = 'features'")[0].values[0][0] === 1,
);

const rows = db.exec('SELECT id, nome, geom FROM estados ORDER BY id');
const features = rows[0].values.map(([id, nome, geom]) => ({
  id,
  nome,
  geom,
  geometry: geom instanceof Uint8Array ? decodeGpkgGeometry(geom) : null,
}));
db.close();

const [semEnvelope, comEnvelope, ponto, vazia] = features;

check('polígono sem envelope', semEnvelope.geometry?.coordinates?.[0]?.length === 5, JSON.stringify(semEnvelope.geometry));
check('polígono com envelope (cabeçalho pulado)', comEnvelope.geometry?.type === 'MultiPolygon', JSON.stringify(comEnvelope.geometry?.type));
check(
  'multipolígono preserva o anel',
  JSON.stringify(comEnvelope.geometry?.coordinates?.[0]?.[0]?.[0]) === '[-73.99,-0.53]',
  JSON.stringify(comEnvelope.geometry?.coordinates?.[0]?.[0]?.[0]),
);
check(
  'ponto decodificado',
  JSON.stringify(ponto.geometry?.coordinates) === '[-47.93,-15.78]',
  JSON.stringify(ponto.geometry),
);
check('linha em branco vira geometria nula', vazia.geometry === null);
check('srs_id do cabeçalho GPKG', readGpkgSrsId(comEnvelope.geom) === 4674, String(readGpkgSrsId(comEnvelope.geom)));

// Ponto 3D no padrão ISO (tipo 1001) — cobre a leitura de dimensão extra.
const pontoZ = decodeGpkgGeometry(gpkgBlob(wkbPoint(10, 20, { isoZ: true }), 4326));
check('ponto com Z (WKB ISO)', JSON.stringify(pontoZ?.coordinates) === '[10,20,850]', JSON.stringify(pontoZ));

// ---------------------------------------------------------------------------
// Datasources do QGIS
// ---------------------------------------------------------------------------

const casos = [
  ['./camadas/estados.shp', './camadas/estados.shp', undefined],
  ['./dados.gpkg|layername=estados', './dados.gpkg', 'estados'],
  ['GPKG:./dados.gpkg:estados', './dados.gpkg', 'estados'],
  ['GPKG:C:/projetos/dados.gpkg:limite_municipal', 'C:/projetos/dados.gpkg', 'limite_municipal'],
  ['C:/projetos/limite.shp', 'C:/projetos/limite.shp', undefined],
  ['file:///C:/projetos/bairros.geojson', 'C:/projetos/bairros.geojson', undefined],
  ['./rede.shp|layername=rede|subset=tipo = 1', './rede.shp', 'rede'],
  ["dbname='geo' host=localhost table=sig.cidades", null, undefined],
  ['', null, undefined],
];

for (const [entrada, esperadoPath, esperadoTabela] of casos) {
  const parsed = parseOgrSource(entrada);
  check(
    `datasource "${entrada}"`,
    (esperadoPath === null && parsed === null) ||
      (parsed !== null && parsed.path === esperadoPath && parsed.table === esperadoTabela),
    JSON.stringify(parsed),
  );
}

check('extensão de caminho', extensionOf('./a/b/estados.SHP') === '.shp' && extensionOf('semext') === '');
check('nome base de caminho', baseNameOf('C:/projetos/dados.gpkg') === 'dados' && baseNameOf('./a/b/estados.shp') === 'estados');

await fs.rm(tmp, { recursive: true, force: true });

console.log(failures === 0 ? '\nTodos os testes passaram.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
