import type Feature from 'ol/Feature.js';
import EsriJSON from 'ol/format/EsriJSON.js';
import type { Geometry } from 'ol/geom';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { addGeoJSONLayer, getLayerSource, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import type { FieldDef } from '../types';

const PAGE_SIZE = 2000;
const MAX_FEATURES = 20000;
const AUTH_MESSAGE = 'Serviço indisponível ou exige autenticação.';

export interface ArcGISLayerRef {
  id: number;
  name: string;
  geometryType?: string;
}

export interface ArcGISServiceInfo {
  url: string;
  name: string;
  layers: ArcGISLayerRef[];
}

interface DownloadedFeatures {
  features: unknown[];
  fields: Record<string, unknown>[];
  wkid: number | undefined;
  note: string | null;
}

interface ProjectionInfo {
  crs: string;
  warning?: string;
}

export function isArcGISRootUrl(rawUrl: string): boolean {
  return /(MapServer|FeatureServer)\/?$/i.test(normalizeUrl(rawUrl));
}

function normalizeUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

export async function getArcGISServiceInfo(rawUrl: string): Promise<ArcGISServiceInfo> {
  const url = normalizeUrl(rawUrl);
  assertHttpUrl(url);
  if (!isArcGISRootUrl(url)) {
    return { url, name: nameFromUrl(url), layers: [] };
  }
  const data = await fetchJson(url);
  ensureNoServiceError(data);
  return {
    url,
    name: firstString(data.mapName) ?? firstString(data.name) ?? firstString(data.serviceDescription) ?? nameFromUrl(url),
    layers: toLayerRefs(data.layers),
  };
}

export async function addArcGISService(rawUrl: string): Promise<void> {
  try {
    const url = normalizeUrl(rawUrl);
    assertHttpUrl(url);
    setStatus('Consultando serviço ArcGIS…');
    let layerUrl = url;
    let layerName: string | undefined;
    if (isArcGISRootUrl(url)) {
      const info = await getArcGISServiceInfo(url);
      const chosen = info.layers.find((layer) => layer.geometryType !== undefined) ?? info.layers[0];
      if (chosen) {
        layerUrl = `${url}/${chosen.id}`;
        layerName = chosen.name;
      } else {
        layerName = info.name;
      }
    }
    if (!layerName) {
      const metadata = await fetchJson(`${layerUrl}?f=json`);
      ensureNoServiceError(metadata);
      layerName = firstString(metadata.name) ?? nameFromUrl(layerUrl);
    }
    const downloaded = await downloadFeatures(layerUrl);
    const projection = resolveProjection(downloaded.wkid);
    const features = readEsriFeatures(downloaded.features, projection.crs);
    const layerId = addGeoJSONLayer({
      name: layerName,
      geojson: { type: 'FeatureCollection', features: [] },
      crs: projection.crs,
      kind: 'arcgis-rest',
      url: layerUrl,
      sourceLabel: 'ArcGIS REST',
    });
    const source = getLayerSource(layerId);
    if (!source) {
      throw new Error('Não foi possível registrar a camada no mapa.');
    }
    features.forEach((feature, index) => feature.setId(`${layerId}-${index}`));
    source.addFeatures(features);
    const geometryTypes = deriveGeometryTypes(features);
    const fields = downloaded.fields.map(toFieldDef);
    const featureCount = source.getFeatures().length;
    useAppStore.getState().updateLayer(layerId, { fields, featureCount, geometryTypes });
    zoomToLayer(layerId);
    const notes = [projection.warning, downloaded.note].filter((note): note is string => typeof note === 'string' && note !== '');
    const summary = `Camada "${layerName}" adicionada via ArcGIS REST (${featureCount} feições)`;
    setStatus(notes.length > 0 ? `${summary} — ${notes.join('; ')}` : summary);
  } catch (error) {
    const message = errorMessage(error);
    setStatus(message);
    throw new Error(message);
  }
}

function readEsriFeatures(esriFeatures: unknown[], dataProjection: string): Feature<Geometry>[] {
  const format = new EsriJSON();
  try {
    return format.readFeatures({ features: esriFeatures }, { dataProjection, featureProjection: 'EPSG:3857' });
  } catch {
    throw new Error('Não foi possível interpretar as geometrias retornadas pelo serviço.');
  }
}

async function downloadFeatures(layerUrl: string): Promise<DownloadedFeatures> {
  const collected: unknown[] = [];
  const fields: Record<string, unknown>[] = [];
  let wkid: number | undefined;
  let offset = 0;
  let firstSignature: string | null = null;
  let note: string | null = null;

  while (collected.length < MAX_FEATURES) {
    setStatus(`Baixando feições… ${collected.length}`);
    const queryUrl = `${layerUrl}/query?where=1%3D1&outFields=*&returnGeometry=true&f=json&resultRecordCount=${PAGE_SIZE}&resultOffset=${offset}`;
    const payload = await fetchJson(queryUrl);
    if (isRecord(payload.error)) {
      if (offset === 0) ensureNoServiceError(payload);
      note = 'a paginação não foi concluída pelo serviço';
      break;
    }
    if (wkid === undefined) wkid = readWkid(payload.spatialReference);
    if (fields.length === 0 && Array.isArray(payload.fields)) {
      fields.push(...payload.fields.filter(isRecord));
    }
    const page = Array.isArray(payload.features) ? payload.features : [];
    if (page.length === 0) break;
    const signature = JSON.stringify(page[0]);
    if (firstSignature !== null) {
      if (signature === firstSignature) {
        note = 'o serviço não suporta paginação';
        break;
      }
    } else {
      firstSignature = signature;
    }
    collected.push(...page);
    offset += page.length;
    if (payload.exceededTransferLimit === false) break;
    if (collected.length >= MAX_FEATURES) {
      note = `limite de ${MAX_FEATURES} feições atingido`;
      break;
    }
  }

  return { features: collected, fields, wkid, note };
}

function resolveProjection(wkid: number | undefined): ProjectionInfo {
  if (wkid === undefined) {
    return { crs: 'EPSG:4326', warning: 'spatialReference ausente, coordenadas tratadas como EPSG:4326' };
  }
  if (wkid === 102100 || wkid === 102113 || wkid === 900913) {
    registerWebMercatorAlias();
    return { crs: 'EPSG:3857' };
  }
  if (wkid === 4326 || wkid === 3857) return { crs: `EPSG:${wkid}` };
  const code = `EPSG:${wkid}`;
  if (wkid === 4674 || wkid === 4258 || wkid === 4269) {
    proj4.defs(code, '+proj=longlat +ellps=GRS80 +no_defs');
    register(proj4);
    return { crs: code };
  }
  const definition = proj4.defs(code);
  if (definition) return { crs: code };
  return { crs: 'EPSG:4326', warning: `SRID ${wkid} não suportado, coordenadas tratadas como EPSG:4326` };
}

function registerWebMercatorAlias(): void {
  const definition = proj4.defs('EPSG:3857');
  if (definition) {
    proj4.defs('EPSG:102100', definition);
    register(proj4);
  }
}

function deriveGeometryTypes(features: Feature<Geometry>[]): string[] {
  const geometryTypes: string[] = [];
  const known = new Set<string>();
  for (const feature of features) {
    const type = feature.getGeometry()?.getType();
    if (type && !known.has(type)) {
      known.add(type);
      geometryTypes.push(type);
    }
  }
  return geometryTypes;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(AUTH_MESSAGE);
  }
  if (response.status === 401 || response.status === 403) throw new Error(AUTH_MESSAGE);
  if (!response.ok) throw new Error(`Serviço ArcGIS indisponível (HTTP ${response.status}).`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('O serviço ArcGIS não retornou JSON válido.');
  }
  if (!isRecord(payload)) throw new Error('O serviço ArcGIS não retornou JSON válido.');
  return payload;
}

function ensureNoServiceError(data: Record<string, unknown>): void {
  const error = data.error;
  if (!isRecord(error)) return;
  if (error.code === 401 || error.code === 403) throw new Error(AUTH_MESSAGE);
  const message = firstString(error.message) ?? 'resposta inválida';
  throw new Error(`Serviço ArcGIS: ${message}`);
}

function toLayerRefs(value: unknown): ArcGISLayerRef[] {
  if (!Array.isArray(value)) return [];
  const refs: ArcGISLayerRef[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = parseLayerId(item.id);
    if (id === undefined) continue;
    const name = firstString(item.name) ?? `Camada ${id}`;
    const geometryType = firstString(item.geometryType);
    refs.push(geometryType ? { id, name, geometryType } : { id, name });
  }
  return refs;
}

function toFieldDef(field: Record<string, unknown>): FieldDef {
  const name = firstString(field.name) ?? '';
  const alias = firstString(field.alias);
  const rawType = field.type;
  const type = typeof rawType === 'string' ? rawType : rawType === undefined || rawType === null ? '' : String(rawType);
  return { name, type: alias || type || 'texto' };
}

function readWkid(spatialReference: unknown): number | undefined {
  if (!isRecord(spatialReference)) return undefined;
  if (typeof spatialReference.latestWkid === 'number') return spatialReference.latestWkid;
  if (typeof spatialReference.wkid === 'number') return spatialReference.wkid;
  if (typeof spatialReference.wkid === 'string' && /^\d+$/.test(spatialReference.wkid)) {
    return Number(spatialReference.wkid);
  }
  return undefined;
}

function parseLayerId(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function assertHttpUrl(url: string): void {
  if (!/^https?:\/\/\S+$/i.test(url)) {
    throw new Error('Informe uma URL HTTP(S) válida do serviço ArcGIS.');
  }
}

function nameFromUrl(url: string): string {
  const parts = url.split('/').filter((part) => part !== '');
  const last = parts[parts.length - 1] ?? '';
  if (last === '') return 'Camada ArcGIS';
  if (/^\d+$/.test(last)) {
    const service = parts[parts.length - 2] ?? 'camada';
    return `${decodePart(service)} #${last}`;
  }
  return decodePart(last);
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function setStatus(text: string): void {
  useAppStore.getState().setStatus(text);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
