import type {
  Feature,
  FeatureCollection,
  Geometry as GeoJsonGeometry,
  MultiPolygon,
  Polygon,
} from 'geojson';
import * as turf from '@turf/turf';
import { useAppStore } from '../store';
import { addGeoJSONLayer, getLayerGeoJSON, getLayerSource, zoomToLayer } from '../map/mapContext';
import type { FieldDef } from '../types';

export type SpatialResult = { count: number } | { error: string };

const BUFFER_CAP = 2000;
const INTERSECT_CAP = 300;

const valueFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

export function describeLayer(id: string): { name: string; count: number } | null {
  const record = useAppStore.getState().layers.find((layer) => layer.id === id);
  if (!record) return null;
  const source = getLayerSource(id);
  return { name: record.name, count: source ? source.getFeatures().length : record.featureCount };
}

function readCollection(id: string): Feature[] | null {
  const collection = getLayerGeoJSON(id);
  if (collection.type !== 'FeatureCollection') return null;
  return collection.features;
}

function normalizePolygonal(geometry: GeoJsonGeometry | null | undefined): Polygon | MultiPolygon | null {
  if (!geometry) return null;
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return geometry;
  if (geometry.type === 'GeometryCollection') {
    const parts: number[][][][] = [];
    for (const child of geometry.geometries) {
      const normalized = normalizePolygonal(child);
      if (!normalized) continue;
      if (normalized.type === 'Polygon') parts.push(normalized.coordinates);
      else parts.push(...normalized.coordinates);
    }
    if (parts.length === 0) return null;
    if (parts.length === 1) return { type: 'Polygon', coordinates: parts[0] };
    return { type: 'MultiPolygon', coordinates: parts };
  }
  return null;
}

function polygonalFeatures(
  features: Feature[],
  limit: number,
): { list: Feature<Polygon | MultiPolygon>[]; exceeded: boolean } {
  const list: Feature<Polygon | MultiPolygon>[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon' && geometry.type !== 'GeometryCollection') {
      continue;
    }
    const normalized = normalizePolygonal(geometry);
    if (!normalized) continue;
    list.push({ type: 'Feature', properties: feature.properties ?? {}, geometry: normalized });
    if (list.length > limit) return { list, exceeded: true };
  }
  return { list, exceeded: false };
}

function summarize(features: Feature[]): { count: number; geometryTypes: string[]; fields: FieldDef[] } {
  const geometryTypes = new Set<string>();
  const fields: FieldDef[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    if (feature.geometry) geometryTypes.add(feature.geometry.type);
    if (fields.length >= 40) continue;
    const properties = feature.properties ?? {};
    for (const [name, value] of Object.entries(properties)) {
      if (seen.has(name)) continue;
      seen.add(name);
      fields.push({
        name,
        type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      });
    }
  }
  return { count: features.length, geometryTypes: [...geometryTypes], fields };
}

function registerAnalysisLayer(options: {
  name: string;
  sourceLabel: string;
  features: Feature[];
}): SpatialResult {
  const geojson: FeatureCollection = { type: 'FeatureCollection', features: options.features };
  const id = addGeoJSONLayer({
    name: options.name,
    geojson,
    crs: 'EPSG:4326',
    kind: 'analysis',
    sourceLabel: options.sourceLabel,
  });
  const info = summarize(options.features);
  useAppStore.getState().updateLayer(id, {
    featureCount: info.count,
    geometryTypes: info.geometryTypes,
    fields: info.fields,
  });
  zoomToLayer(id);
  return { count: info.count };
}

export function bufferActiveLayer(distance: number, unit: 'm' | 'km'): SpatialResult {
  const state = useAppStore.getState();
  const id = state.activeLayerId;
  if (!id) return { error: 'Selecione uma camada ativa antes de executar o buffer.' };
  const record = state.layers.find((layer) => layer.id === id);
  if (!record) return { error: 'A camada ativa não foi encontrada.' };
  if (!Number.isFinite(distance) || distance <= 0) {
    return { error: 'Informe uma distância maior que zero.' };
  }
  if (!getLayerSource(id)) return { error: 'A fonte de dados da camada está indisponível.' };

  const features = readCollection(id);
  if (features === null) return { error: 'Não foi possível ler as geometrias da camada ativa.' };
  if (features.length === 0) return { error: 'A camada ativa não possui feições.' };

  const limited = features.slice(0, BUFFER_CAP);
  const truncated = features.length > BUFFER_CAP;
  const radiusKm = unit === 'm' ? distance / 1000 : distance;
  const label =
    unit === 'm' ? `${valueFormatter.format(distance)} m` : `${valueFormatter.format(distance)} km`;
  const out: Feature[] = [];
  let ignored = 0;

  for (const feature of limited) {
    try {
      if (!feature.geometry) {
        ignored += 1;
        continue;
      }
      const buffered = turf.buffer(feature, radiusKm, { units: 'kilometers', steps: 16 });
      if (!buffered) {
        ignored += 1;
        continue;
      }
      const polygonal = normalizePolygonal(buffered.geometry);
      if (!polygonal) {
        ignored += 1;
        continue;
      }
      out.push({ type: 'Feature', properties: feature.properties ?? {}, geometry: polygonal });
    } catch {
      ignored += 1;
    }
  }

  if (out.length === 0) {
    return { error: 'Nenhuma geometria pôde ser bufferizada nesta camada.' };
  }

  const result = registerAnalysisLayer({
    name: `Buffer ${label} — ${record.name}`,
    sourceLabel: record.name,
    features: out,
  });
  if ('error' in result) return result;

  const parts: string[] = [`Buffer gerado: ${result.count} feições a partir de "${record.name}".`];
  if (truncated) parts.push(`Processadas apenas as primeiras ${BUFFER_CAP} feições da camada.`);
  if (ignored > 0) parts.push(`${ignored} feição(ões) ignorada(s) por geometria inválida.`);
  useAppStore.getState().setStatus(parts.join(' '));
  return result;
}

export function intersectLayers(layerIdA: string, layerIdB: string): SpatialResult {
  const state = useAppStore.getState();
  const recordA = state.layers.find((layer) => layer.id === layerIdA);
  const recordB = state.layers.find((layer) => layer.id === layerIdB);
  if (!recordA || !recordB) return { error: 'Camadas de interseção inválidas.' };
  if (layerIdA === layerIdB) return { error: 'Escolha duas camadas diferentes.' };

  const collectedA = polygonalFeatures(readCollection(layerIdA) ?? [], INTERSECT_CAP);
  const collectedB = polygonalFeatures(readCollection(layerIdB) ?? [], INTERSECT_CAP);
  if (collectedA.exceeded || collectedB.exceeded) {
    return {
      error: `Limite de ${INTERSECT_CAP} × ${INTERSECT_CAP} pares de feições excedido. Divida ou filtre as camadas antes de tentar novamente.`,
    };
  }
  if (collectedA.list.length === 0) {
    return { error: `A camada "${recordA.name}" não possui feições poligonais.` };
  }
  if (collectedB.list.length === 0) {
    return { error: `A camada "${recordB.name}" não possui feições poligonais.` };
  }

  const out: Feature[] = [];
  for (const a of collectedA.list) {
    for (const b of collectedB.list) {
      try {
        const shared = turf.intersect(turf.featureCollection<Polygon | MultiPolygon>([a, b]));
        if (!shared) continue;
        const polygonal = normalizePolygonal(shared.geometry);
        if (!polygonal) continue;
        out.push({ type: 'Feature', properties: {}, geometry: polygonal });
      } catch {
        continue;
      }
    }
  }

  if (out.length === 0) {
    return { error: `As camadas "${recordA.name}" e "${recordB.name}" não possuem áreas em comum.` };
  }

  const result = registerAnalysisLayer({
    name: `Interseção — ${recordA.name} ∩ ${recordB.name}`,
    sourceLabel: `${recordA.name} ∩ ${recordB.name}`,
    features: out,
  });
  if ('error' in result) return result;
  useAppStore.getState().setStatus(`Interseção concluída: ${result.count} feições.`);
  return result;
}
