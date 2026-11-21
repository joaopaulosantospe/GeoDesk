import Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import type { FeatureCollection } from 'geojson';
import { addGeoJSONLayer, featuresToGeoJSON, getLayerSource, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import type { ParsedTable } from '../import/tableJoin';
import { plainProperties, shouldSkipJoinField, summarizeFields, uniquePropName } from './spatialJoin';
import { uniqueLayerName } from './grid';

export interface LayerJoinOptions {
  /** Camada de destino (a que foi clicada com o botão direito). */
  destId: string;
  /** Camada de origem (a "tabela" que será ligada). */
  sourceId: string;
  /** Campo-chave da camada de destino. */
  keyLayer: string;
  /** Campo-chave da camada de origem. */
  keyTable: string;
}

export type LayerJoinResult = { name: string; count: number; matched: number } | { error: string };

/** Par de campos com valores em comum (sugestão de chave). */
export interface KeyOverlap {
  keyLayer: string;
  keyTable: string;
  /** Quantidade de valores distintos em comum. */
  matched: number;
}

/** Normalização de chave igual à do Join de tabela (sem acentos/caixa, como texto). */
function normalizeKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Liga a tabela de atributos de outra camada pela chave e cria uma NOVA camada
 * com as feições de destino + as colunas da origem (como o "Ligar Dados" do ArcMap).
 */
export function layerAttributeJoin(options: LayerJoinOptions): LayerJoinResult {
  const state = useAppStore.getState();
  const destRecord = state.layers.find((layer) => layer.id === options.destId);
  const sourceRecord = state.layers.find((layer) => layer.id === options.sourceId);
  if (!destRecord || !sourceRecord) {
    return { error: 'A camada de destino ou a camada de origem não foi encontrada.' };
  }
  const destFeatures = getLayerSource(destRecord.id)?.getFeatures() ?? [];
  const sourceFeatures = getLayerSource(sourceRecord.id)?.getFeatures() ?? [];
  if (destFeatures.length === 0) return { error: `A camada "${destRecord.name}" não possui feições.` };
  if (sourceFeatures.length === 0) return { error: `A camada "${sourceRecord.name}" não possui feições.` };

  // Índice da origem pela chave (primeira correspondência, como no ArcMap).
  const index = new Map<string, Record<string, unknown>>();
  for (const feature of sourceFeatures) {
    const properties = plainProperties(feature);
    const key = normalizeKey(properties[options.keyTable]);
    if (key === '' || index.has(key)) continue;
    index.set(key, properties);
  }
  if (index.size === 0) {
    return { error: `O campo "${options.keyTable}" de "${sourceRecord.name}" não tem valores para combinar.` };
  }

  let matched = 0;
  const outFeatures: Feature<Geometry>[] = [];
  for (const destFeature of destFeatures) {
    const geometry = destFeature.getGeometry();
    if (!geometry) continue;
    const properties: Record<string, unknown> = plainProperties(destFeature);
    const taken = new Set(Object.keys(properties));
    const sourceProperties = index.get(normalizeKey(properties[options.keyLayer]));
    if (sourceProperties) {
      matched += 1;
      for (const [key, value] of Object.entries(sourceProperties)) {
        if (shouldSkipJoinField(key)) continue;
        properties[uniquePropName(key, taken)] = value;
      }
    }
    outFeatures.push(new Feature({ ...properties, geometry: geometry.clone() }));
  }

  if (matched === 0) {
    return {
      error: `Nenhuma feição combinada: nenhum valor de "${options.keyLayer}" corresponde a "${options.keyTable}" em "${sourceRecord.name}". Se as tabelas não têm chave em comum, use a ligação espacial (campo "O que você deseja ligar à camada?").`,
    };
  }

  const name = uniqueLayerName(`Ligação — ${destRecord.name} + ${sourceRecord.name}`);
  const geojson = featuresToGeoJSON(outFeatures) as FeatureCollection;
  const id = addGeoJSONLayer({
    name,
    geojson,
    crs: 'EPSG:4326',
    kind: 'analysis',
    sourceLabel: sourceRecord.name,
  });
  const geometryTypes =
    destRecord.geometryTypes.length > 0
      ? destRecord.geometryTypes
      : ([
          ...new Set(
            outFeatures.map((feature) => feature.getGeometry()?.getType()).filter(Boolean),
          ),
        ] as string[]);
  useAppStore.getState().updateLayer(id, {
    featureCount: outFeatures.length,
    geometryTypes,
    fields: summarizeFields(geojson),
  });
  zoomToLayer(id);
  return { name, count: outFeatures.length, matched };
}

/**
 * Procura o melhor par de campos com valores em comum entre as duas camadas
 * (prefere campos de mesmo nome, depois a maior quantidade de valores).
 */
export function findKeyOverlap(destId: string, sourceId: string): KeyOverlap | null {
  const destFeatures = getLayerSource(destId)?.getFeatures() ?? [];
  const sourceFeatures = getLayerSource(sourceId)?.getFeatures() ?? [];
  if (destFeatures.length === 0 || sourceFeatures.length === 0) return null;
  const destProps = destFeatures.slice(0, 5000).map((feature) => plainProperties(feature));
  const sourceProps = sourceFeatures.slice(0, 5000).map((feature) => plainProperties(feature));
  const destFields = unionFieldNames(destProps);
  const sourceFields = unionFieldNames(sourceProps);

  let best: KeyOverlap | null = null;
  let bestSameName = false;
  for (const keyLayer of destFields) {
    const destValues = new Set(
      destProps.map((properties) => normalizeKey(properties[keyLayer])).filter((value) => value !== ''),
    );
    if (destValues.size === 0) continue;
    for (const keyTable of sourceFields) {
      const shared = new Set<string>();
      for (const properties of sourceProps) {
        const value = normalizeKey(properties[keyTable]);
        if (value !== '' && destValues.has(value)) shared.add(value);
      }
      if (shared.size === 0) continue;
      const sameName = keyLayer.toLowerCase() === keyTable.toLowerCase();
      const better =
        !best ||
        (sameName && !bestSameName) ||
        (sameName === bestSameName && shared.size > best.matched);
      if (better) {
        best = { keyLayer, keyTable, matched: shared.size };
        bestSameName = sameName;
      }
    }
  }
  return best;
}

/** Campos com valores da camada (união das feições, com limites). */
export function layerValueFields(layerId: string): string[] {
  const features = getLayerSource(layerId)?.getFeatures() ?? [];
  const props = features.slice(0, 200).map((feature) => plainProperties(feature));
  return unionFieldNames(props);
}

/** Converte a tabela de atributos de uma camada em ParsedTable (para Relacionar). */
export function layerAsTable(layerId: string): ParsedTable | null {
  const features = getLayerSource(layerId)?.getFeatures() ?? [];
  if (features.length === 0) return null;
  const headers = layerValueFields(layerId);
  if (headers.length === 0) return null;
  const rows: Record<string, string>[] = features.map((feature) => {
    const properties = plainProperties(feature);
    const row: Record<string, string> = {};
    for (const header of headers) {
      const value = properties[header];
      row[header] = value === null || value === undefined ? '' : String(value);
    }
    return row;
  });
  return { headers, rows };
}

function unionFieldNames(props: Record<string, unknown>[]): string[] {
  const fields: string[] = [];
  for (const properties of props) {
    for (const key of Object.keys(properties)) {
      if (!fields.includes(key)) {
        if (fields.length >= 60) return fields;
        fields.push(key);
      }
    }
  }
  return fields;
}
