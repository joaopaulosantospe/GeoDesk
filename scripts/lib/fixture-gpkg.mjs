import { mkdirSync, writeFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

// ---------------------------------------------------------------------------
// Codificadores (o espelho do que o QGIS/ArcGIS gravam num GeoPackage)
// ---------------------------------------------------------------------------

export function wkbPoint(x, y, { little = true, isoZ = false } = {}) {
  const buffer = new ArrayBuffer(1 + 4 + 16 + (isoZ ? 8 : 0));
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, little ? 1 : 0);
  offset += 1;
  view.setUint32(offset, isoZ ? 1001 : 1, little);
  offset += 4;
  view.setFloat64(offset, x, little);
  offset += 8;
  view.setFloat64(offset, y, little);
  offset += 8;
  if (isoZ) view.setFloat64(offset, 850, little);
  return new Uint8Array(buffer);
}

export function wkbPolygon(rings) {
  const size = 1 + 4 + 4 + rings.reduce((acc, ring) => acc + 4 + ring.length * 16, 0);
  const view = new DataView(new ArrayBuffer(size));
  let offset = 0;
  view.setUint8(offset, 1);
  offset += 1;
  view.setUint32(offset, 3, true);
  offset += 4;
  view.setUint32(offset, rings.length, true);
  offset += 4;
  for (const ring of rings) {
    view.setUint32(offset, ring.length, true);
    offset += 4;
    for (const [x, y] of ring) {
      view.setFloat64(offset, x, true);
      offset += 8;
      view.setFloat64(offset, y, true);
      offset += 8;
    }
  }
  return new Uint8Array(view.buffer);
}

export function wkbMultiPolygon(polygons) {
  const parts = polygons.map(wkbPolygon);
  const size = 1 + 4 + 4 + parts.reduce((acc, part) => acc + part.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  out[offset] = 1;
  offset += 1;
  view.setUint32(offset, 6, true);
  offset += 4;
  view.setUint32(offset, parts.length, true);
  offset += 4;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Cabeçalho GeoPackage Binary: "GP" + flags + srs_id [+ envelope] + WKB. */
export function gpkgBlob(wkb, srsId, { envelope } = {}) {
  const headerSize = 8 + (envelope ? 32 : 0);
  const out = new Uint8Array(headerSize + wkb.length);
  const view = new DataView(out.buffer);
  out[0] = 0x47; // 'G'
  out[1] = 0x50; // 'P'
  out[2] = 0x01 | ((envelope ? 1 : 0) << 1); // little endian + indicador do envelope
  view.setInt32(3, srsId, true);
  if (envelope) {
    const [minX, minY, maxX, maxY] = envelope;
    view.setFloat64(8, minX, true);
    view.setFloat64(16, maxX, true);
    view.setFloat64(24, minY, true);
    view.setFloat64(32, maxY, true);
  }
  out.set(wkb, headerSize);
  return out;
}

/** Anel retangular (fechado) usado como contorno de teste. */
export const RING_TESTE = [
  [-73.99, -0.53],
  [-50.0, -0.53],
  [-50.0, -24.0],
  [-73.99, -24.0],
  [-73.99, -0.53],
];

/**
 * Grava um GeoPackage de amostra em `gpkgPath` (SIRGAS 2000 / EPSG:4674):
 * tabela "estados" com polígono, multipolígono com envelope, ponto e uma linha
 * sem geometria; mais uma tabela de atributos ("metadados") que o leitor deve
 * ignorar.
 */
export async function writeGeoPackageFixture(gpkgPath) {
  mkdirSync(path.dirname(gpkgPath), { recursive: true });
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE gpkg_spatial_ref_sys (
    srs_name TEXT, srs_id INTEGER NOT NULL PRIMARY KEY,
    organization TEXT, organization_coordsys_id INTEGER, definition TEXT);
  CREATE TABLE gpkg_contents (
    table_name TEXT NOT NULL, data_type TEXT, identifier TEXT, description TEXT,
    last_change DATETIME, min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
  CREATE TABLE gpkg_geometry_columns (
    table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT,
    srs_id INTEGER, z TINYINT, m TINYINT);
  CREATE TABLE estados (id INTEGER PRIMARY KEY, nome TEXT, populacao INTEGER, geom BLOB);
  CREATE TABLE metadados (chave TEXT, valor TEXT);`);

  db.run(`INSERT INTO gpkg_spatial_ref_sys VALUES
    ('undefined cartesian', -1, 'NONE', -1, 'undefined'),
    ('undefined geographic', 0, 'NONE', 0, 'undefined'),
    ('WGS 84 geografico', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'),
    ('SIRGAS 2000', 4674, 'EPSG', 4674, 'GEOGCS["SIRGAS 2000",DATUM["SIRGAS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]');
  INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id) VALUES
    ('estados', 'features', 'estados', 4674),
    ('metadados', 'attributes', 'metadados', NULL);
  INSERT INTO gpkg_geometry_columns VALUES
    ('estados', 'geom', 'POLYGON', 4674, 0, 0);`);

  const estados = [
    { id: 1, nome: 'Mato Grosso', populacao: 3658649, geom: gpkgBlob(wkbPolygon([RING_TESTE]), 4674) },
    {
      id: 2,
      nome: 'Amazonas',
      populacao: 3941613,
      geom: gpkgBlob(wkbMultiPolygon([[RING_TESTE]]), 4674, { envelope: [-73.99, -24.0, -50.0, -0.53] }),
    },
    { id: 3, nome: 'Distrito Federal', populacao: 2817068, geom: gpkgBlob(wkbPoint(-47.93, -15.78), 4674) },
    { id: 4, nome: 'Sem geometria', populacao: 0, geom: null },
  ];
  for (const estado of estados) {
    const statement = db.prepare('INSERT INTO estados (id, nome, populacao, geom) VALUES (?, ?, ?, ?)');
    statement.run([estado.id, estado.nome, estado.populacao, estado.geom]);
    statement.free();
  }
  db.run(`INSERT INTO metadados VALUES ('fonte', 'IBGE');`);

  await fs.writeFile(gpkgPath, Buffer.from(db.export()));
  db.close();
  return gpkgPath;
}
