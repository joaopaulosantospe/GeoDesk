import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { addGeoJSONLayer, zoomToLayers } from '../map/mapContext';
import { useAppStore } from '../store';
import { deriveFeatureMeta } from './geojsonLoader';
import { decodeGpkgGeometry, type JsonGeometry } from './wkb';

/**
 * Leitor de GeoPackage (.gpkg) — formato vetorial usado pelo QGIS e pelo
 * ArcGIS Pro. O arquivo é um banco SQLite: abrimos com sql.js, lemos as
 * tabelas de metadados oficiais (gpkg_contents / gpkg_geometry_columns /
 * gpkg_spatial_ref_sys) e convertemos os BLOBs de geometria (cabeçalho GPKG
 * + WKB) para GeoJSON — a decodificação da geometria está em ./wkb.ts.
 */

type SqlJs = Awaited<ReturnType<typeof import('sql.js/dist/sql-wasm-inline.js').default>>;
type SqlDatabase = InstanceType<SqlJs['Database']>;
type SqlValue = string | number | Uint8Array | null;

interface FeatureTable {
  tableName: string;
  geometryColumn: string;
  srsId: number;
}

let sqlEngine: Promise<SqlJs> | null = null;

/**
 * O SQLite em WebAssembly é carregado só quando um GeoPackage é aberto, para
 * não pesar no início do aplicativo (chunk separado gerado pelo Vite).
 */
function getEngine(): Promise<SqlJs> {
  if (!sqlEngine) {
    sqlEngine = import('sql.js/dist/sql-wasm-inline.js').then((module) => module.default());
  }
  return sqlEngine;
}

export function isGeoPackageFile(name: string): boolean {
  return /\.gpkg$/i.test(name);
}

/** Abre um GeoPackage escolhido pelo usuário e carrega as camadas espaciais. */
export async function loadGeoPackage(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const baseName = file.name.replace(/\.gpkg$/i, '') || file.name;
  const ids = await loadGeoPackageBytes(bytes, baseName);
  zoomToLayers(ids);
  return ids;
}

/**
 * Carrega as camadas espaciais de um GeoPackage já em memória.
 * `onlyTable` carrega apenas a tabela indicada e `layerName` dá o nome da
 * camada — usado quando um projeto QGIS aponta para uma camada do banco.
 */
export async function loadGeoPackageBytes(
  bytes: Uint8Array,
  baseName: string,
  onlyTable?: string,
  layerName?: string,
): Promise<string[]> {
  const engine = await getEngine();
  const db = new engine.Database(bytes);
  try {
    if (!tableExists(db, 'gpkg_contents')) {
      throw new Error('o arquivo não é um GeoPackage válido (tabela gpkg_contents ausente)');
    }
    let tables = featureTables(db);
    if (onlyTable) {
      const wanted = onlyTable.trim().toLowerCase();
      tables = tables.filter((t) => t.tableName.toLowerCase() === wanted);
      if (tables.length === 0) {
        throw new Error(`a camada "${onlyTable}" não foi encontrada neste GeoPackage`);
      }
    }
    if (tables.length === 0) {
      throw new Error('o GeoPackage não contém camadas espaciais (tabelas de feições)');
    }
    const ids: string[] = [];
    for (const table of tables) {
      const name = layerName ?? (tables.length === 1 ? baseName : `${baseName} — ${table.tableName}`);
      const geojson = readTable(db, table);
      const id = addGeoJSONLayer({
        name,
        geojson,
        crs: resolveCrs(db, table.srsId),
        kind: 'gpkg',
        sourceLabel: 'GeoPackage',
      });
      const meta = deriveFeatureMeta(geojson);
      useAppStore
        .getState()
        .updateLayer(id, {
          fields: meta.fields,
          featureCount: meta.featureCount,
          geometryTypes: meta.geometryTypes,
        });
      ids.push(id);
    }
    useAppStore
      .getState()
      .setStatus(
        `GeoPackage ${baseName} carregado (${ids.length} ${ids.length === 1 ? 'camada' : 'camadas'})`,
      );
    return ids;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Metadados do GeoPackage
// ---------------------------------------------------------------------------

function tableExists(db: SqlDatabase, name: string): boolean {
  const rows = query(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`);
  return rows.length > 0;
}

function featureTables(db: SqlDatabase): FeatureTable[] {
  const rows = query(
    db,
    `SELECT c.table_name, g.column_name, c.srs_id
       FROM gpkg_contents c
       JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
      WHERE c.data_type = 'features'
      ORDER BY c.table_name`,
  );
  return rows
    .filter((row) => typeof row[0] === 'string' && typeof row[1] === 'string')
    .map((row) => ({
      tableName: row[0] as string,
      geometryColumn: row[1] as string,
      srsId: typeof row[2] === 'number' ? row[2] : 4326,
    }));
}

/** SRS do GeoPackage → código usado pelo app (EPSG:xxxx ou WKT registrado no proj4). */
function resolveCrs(db: SqlDatabase, srsId: number): string {
  if (!Number.isFinite(srsId) || srsId <= 0) return 'EPSG:4326';
  const rows = query(
    db,
    `SELECT organization, organization_coordsys_id, definition
       FROM gpkg_spatial_ref_sys WHERE srs_id = ${Math.trunc(srsId)}`,
  );
  const row = rows[0];
  if (!row) return 'EPSG:4326';
  const [organization, code, definition] = row;
  if (typeof organization === 'string' && /^EPSG$/i.test(organization) && typeof code === 'number') {
    return `EPSG:${code}`;
  }
  if (typeof definition === 'string' && /(PROJCS|GEOGCS|PROJCRS|GEOGCRS)/i.test(definition)) {
    const projCode = `geodesk:gpkg-${Math.trunc(srsId)}`;
    proj4.defs(projCode, definition);
    register(proj4);
    return projCode;
  }
  return 'EPSG:4326';
}

function query(db: SqlDatabase, sql: string): SqlValue[][] {
  try {
    const result = db.exec(sql);
    return result[0]?.values ?? [];
  } catch {
    return [];
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Tabela → FeatureCollection
// ---------------------------------------------------------------------------

function readTable(db: SqlDatabase, table: FeatureTable): unknown {
  const result = db.exec(`SELECT * FROM ${quoteIdent(table.tableName)}`);
  const columns = result[0]?.columns ?? [];
  const rows = result[0]?.values ?? [];
  const features: unknown[] = [];
  rows.forEach((row, index) => {
    const properties: Record<string, unknown> = {};
    let geometry: JsonGeometry | null = null;
    columns.forEach((column, position) => {
      const value = row[position];
      if (column === table.geometryColumn) {
        if (value instanceof Uint8Array) geometry = decodeGpkgGeometry(value);
        return;
      }
      // Binários (BLOBs) não têm representação tabular no app — descartados.
      if (value instanceof Uint8Array) return;
      properties[column] = value;
    });
    features.push({ type: 'Feature', id: index, properties, geometry });
  });
  return { type: 'FeatureCollection', features };
}
