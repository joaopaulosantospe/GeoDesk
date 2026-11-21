import { addGeoJSONLayer, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import type { FieldDef } from '../types';

export interface FeatureMeta {
  fields: FieldDef[];
  featureCount: number;
  geometryTypes: string[];
}

export async function loadGeoJSONFile(file: File): Promise<void> {
  const name = file.name.replace(/\.(geojson|json)$/i, '') || file.name;
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('o conteúdo não é um JSON válido');
    }
    if (!isRecord(parsed) || parsed.type !== 'FeatureCollection') {
      throw new Error('o arquivo não contém um FeatureCollection GeoJSON');
    }
    const crs = detectGeoJSONCrs(parsed);
    const id = addGeoJSONLayer({ name, geojson: parsed, crs, kind: 'geojson', sourceLabel: 'GeoJSON' });
    const meta = deriveFeatureMeta(parsed);
    useAppStore
      .getState()
      .updateLayer(id, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
    zoomToLayer(id);
    useAppStore.getState().setStatus(`GeoJSON ${name} carregado (${meta.featureCount} feições)`);
  } catch (error) {
    const message = `Falha ao carregar ${file.name}: ${errorMessage(error)}`;
    useAppStore.getState().setStatus(message);
    throw new Error(message);
  }
}

export function detectGeoJSONCrs(geojson: unknown): string {
  if (!isRecord(geojson) || !isRecord(geojson.crs) || !isRecord(geojson.crs.properties)) {
    return 'EPSG:4326';
  }
  const name = geojson.crs.properties.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return 'EPSG:4326';
  }
  return normalizeCrsName(name.trim());
}

export function deriveFeatureMeta(geojson: unknown): FeatureMeta {
  const fields: FieldDef[] = [];
  const geometryTypes: string[] = [];
  const knownFields = new Set<string>();
  const knownGeometries = new Set<string>();
  let featureCount = 0;
  if (!isRecord(geojson) || !Array.isArray(geojson.features)) {
    return { fields, featureCount, geometryTypes };
  }
  for (const item of geojson.features) {
    if (!isRecord(item)) continue;
    featureCount += 1;
    const geometry = item.geometry;
    if (isRecord(geometry) && typeof geometry.type === 'string' && !knownGeometries.has(geometry.type)) {
      knownGeometries.add(geometry.type);
      geometryTypes.push(geometry.type);
    }
    const properties = item.properties;
    if (!isRecord(properties)) continue;
    for (const key of Object.keys(properties)) {
      if (knownFields.has(key)) continue;
      knownFields.add(key);
      fields.push({ name: key, type: jsonTypeOf(properties[key]) });
    }
  }
  return { fields, featureCount, geometryTypes };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCrsName(name: string): string {
  if (/CRS84|CRS:84/i.test(name)) return 'EPSG:4326';
  const epsg = name.match(/EPSG[:\s]*(\d{4,5})\s*$/i);
  if (epsg) return `EPSG:${epsg[1]}`;
  const code = name.match(/(\d{4,5})\s*$/);
  if (code) return `EPSG:${code[1]}`;
  return name;
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return 'nulo';
  if (Array.isArray(value)) return 'lista';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'objeto';
  return 'texto';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
