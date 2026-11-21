/**
 * Decodificação de geometrias espaciais — puro, sem dependência do app, para
 * poder ser testado fora do navegador (scripts/diag-gpkg.mjs).
 *
 * Fontes:
 *  - GeoPackage Binary: cabeçalho "GP" + flags + envelope + WKB
 *    (http://www.geopackage.org/spec/#gpa_format)
 *  - WKB OGC/ISO e EWKB (bit 0x80000000 = Z, 0x40000000 = M, 0x20000000 = SRID)
 */

export type JsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'GeometryCollection'; geometries: JsonGeometry[] };

interface WkbReader {
  view: DataView;
  offset: number;
  little: boolean;
}

/** Decodifica um BLOB de geometria do GeoPackage. */
export function decodeGpkgGeometry(blob: Uint8Array): JsonGeometry | null {
  if (blob.length < 8) return null;
  const magic = (blob[0] << 8) | blob[1];
  // Sem cabeçalho GPKG (raro) o conteúdo já é WKB puro.
  if (magic !== 0x4750) return decodeWkb(blob);

  const flags = blob[2];
  if ((flags & 0x10) !== 0) return null; // bit "empty geometry"
  // Tamanho do envelope em bytes por indicador (0 = sem envelope).
  const envelopeIndicator = (flags >> 1) & 0x07;
  const envelopeSize = [0, 32, 48, 48, 64][envelopeIndicator] ?? 0;
  const start = 8 + envelopeSize;
  if (start > blob.length) return null;
  return decodeWkb(blob.subarray(start));
}

/** lê apenas o srs_id gravado no cabeçalho do GeoPackage. */
export function readGpkgSrsId(blob: Uint8Array): number | null {
  if (blob.length < 8) return null;
  const magic = (blob[0] << 8) | blob[1];
  if (magic !== 0x4750) return null;
  const littleEndian = (blob[2] & 0x01) === 1;
  return new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getInt32(3, littleEndian);
}

/** Converte WKB (ISO/OGC ou EWKB do PostGIS) em geometria GeoJSON. */
export function decodeWkb(bytes: Uint8Array): JsonGeometry | null {
  const reader = {
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    offset: 0,
    little: true,
  };
  try {
    return readGeometry(reader);
  } catch {
    return null;
  }
}

function readGeometry(r: WkbReader): JsonGeometry | null {
  const byteOrder = r.view.getUint8(r.offset);
  r.offset += 1;
  r.little = byteOrder === 1;

  let type = r.view.getUint32(r.offset, r.little);
  r.offset += 4;

  // EWKB: bits de Z (0x80000000), M (0x40000000) e SRID (0x20000000).
  let extra = 0;
  if (type & 0x80000000) {
    extra = 1;
    type &= ~0x80000000;
  }
  if (type & 0x40000000) {
    extra = Math.max(extra, 1);
    type &= ~0x40000000;
  }
  if (type & 0x20000000) {
    type &= ~0x20000000;
    r.offset += 4; // SRS embutido, ignorado (o GeoPackage já traz o srs_id)
  }
  if (extra === 0) {
    // WKB ISO: tipo = forma + 1000 * dimensão (1 = Z, 2 = M, 3 = ZM).
    const iso = Math.floor(type / 1000);
    extra = iso === 1 || iso === 2 ? 1 : iso === 3 ? 2 : 0;
  }
  const base = type % 1000;

  switch (base) {
    case 1:
      return { type: 'Point', coordinates: readPoint(r, extra) };
    case 2:
      return { type: 'LineString', coordinates: readLine(r, extra) };
    case 3:
      return { type: 'Polygon', coordinates: readPolygon(r, extra) };
    case 4: {
      const count = readCount(r);
      const coordinates: number[][] = [];
      for (let i = 0; i < count; i++) {
        const nested = readGeometry(r);
        if (nested?.type === 'Point') coordinates.push(nested.coordinates);
      }
      return { type: 'MultiPoint', coordinates };
    }
    case 5: {
      const count = readCount(r);
      const coordinates: number[][][] = [];
      for (let i = 0; i < count; i++) {
        const nested = readGeometry(r);
        if (nested?.type === 'LineString') coordinates.push(nested.coordinates);
      }
      return { type: 'MultiLineString', coordinates };
    }
    case 6: {
      const count = readCount(r);
      const coordinates: number[][][][] = [];
      for (let i = 0; i < count; i++) {
        const nested = readGeometry(r);
        if (nested?.type === 'Polygon') coordinates.push(nested.coordinates);
      }
      return { type: 'MultiPolygon', coordinates };
    }
    case 7: {
      const count = readCount(r);
      const geometries: JsonGeometry[] = [];
      for (let i = 0; i < count; i++) {
        const nested = readGeometry(r);
        if (nested) geometries.push(nested);
      }
      return { type: 'GeometryCollection', geometries };
    }
    default:
      return null;
  }
}

function readCount(r: WkbReader): number {
  const count = r.view.getUint32(r.offset, r.little);
  r.offset += 4;
  return count;
}

function readPoint(r: WkbReader, extra: number): number[] {
  const coordinates: number[] = [];
  for (let i = 0; i < 2 + extra; i++) {
    coordinates.push(r.view.getFloat64(r.offset, r.little));
    r.offset += 8;
  }
  return coordinates;
}

function readLine(r: WkbReader, extra: number): number[][] {
  const count = readCount(r);
  const line: number[][] = [];
  for (let i = 0; i < count; i++) line.push(readPoint(r, extra));
  return line;
}

function readPolygon(r: WkbReader, extra: number): number[][][] {
  const ringCount = readCount(r);
  const polygon: number[][][] = [];
  for (let i = 0; i < ringCount; i++) polygon.push(readLine(r, extra));
  return polygon;
}
