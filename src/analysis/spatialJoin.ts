import Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import type { FeatureCollection } from 'geojson';
import { addGeoJSONLayer, featuresToGeoJSON, getLayerSource, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import type { FieldDef } from '../types';
import { shapeOf, shapesDistance, type Shape } from './geom2d';
import { uniqueLayerName } from './grid';

/** Como a feição de destino recebe os dados da camada de ligação. */
export type SpatialJoinMode = 'summary' | 'nearest' | 'containment' | 'first';

/** Estatísticas do resumo (ArcMap: "Como deseja que os atributos sejam resumidos?"). */
export type SpatialJoinStat = 'mean' | 'min' | 'std' | 'sum' | 'max' | 'var';

/** Família de geometria de uma camada, para descrever a ligação. */
export type GeometryKind = 'points' | 'lines' | 'polygons' | 'other';

export interface SpatialJoinOptions {
  /** Camada de destino (a que recebe os dados — clique direito). */
  destId: string;
  /** Camada de ligação (a outra camada). */
  joinId: string;
  mode: SpatialJoinMode;
  /** Estatísticas pedidas no modo resumo. */
  stats: SpatialJoinStat[];
  /** Nome da nova camada (padrão ArcMap: "Join_Output"). */
  outputName: string;
  /**
   * Raio de busca opcional em metros (como no ArcGIS Pro): além de quem está
   * dentro/na borda, casam as feições a até esta distância. 0 = só interseção.
   */
  searchRadius?: number;
}

export type SpatialJoinResult = { count: number; name: string } | { error: string };

/**
 * Campos internos de geometria da camada ligada que NÃO viajam para a nova
 * camada (não são úteis quando vem de outra camada — pedido do usuário).
 */
export function shouldSkipJoinField(name: string): boolean {
  const value = name.toLowerCase();
  return (
    value === 'shape_length' ||
    value === 'shape_area' ||
    value === 'shapename' ||
    value === 'join_count'
  );
}

const STAT_PREFIX: Record<SpatialJoinStat, string> = {
  sum: 'SUM',
  mean: 'MEAN',
  min: 'MIN',
  std: 'STD',
  max: 'MAX',
  var: 'VAR',
};

const SINGULAR: Record<GeometryKind, string> = {
  points: 'ponto',
  lines: 'linha',
  polygons: 'polígono',
  other: 'feição',
};

const PLURAL: Record<GeometryKind, string> = {
  points: 'pontos',
  lines: 'linhas',
  polygons: 'polígonos',
  other: 'feições',
};

/** Família de geometria da camada (declarada ou pela primeira feição). */
export function layerGeometryKind(layerId: string): GeometryKind {
  const record = useAppStore.getState().layers.find((layer) => layer.id === layerId);
  if (!record) return 'other';
  const classify = (text: string): GeometryKind => {
    const value = text.toLowerCase();
    if (value.includes('point')) return 'points';
    if (value.includes('line')) return 'lines';
    if (value.includes('polygon') || value.includes('circle')) return 'polygons';
    return 'other';
  };
  const declared = classify(record.geometryTypes.join(','));
  if (declared !== 'other') return declared;
  const first = getLayerSource(layerId)?.getFeatures()[0]?.getGeometry()?.getType() ?? '';
  return classify(first);
}

export function geometryKindLabel(kind: GeometryKind, plural: boolean): string {
  return plural ? PLURAL[kind] : SINGULAR[kind];
}

/** Opções de ligação oferecidas para cada combinação de geometrias (como no ArcMap). */
export function availableJoinModes(dest: GeometryKind, join: GeometryKind): SpatialJoinMode[] {
  if (dest === 'polygons') {
    if (join === 'points' || join === 'lines') return ['summary', 'nearest'];
    if (join === 'polygons') return ['first'];
    return ['first'];
  }
  if (dest === 'points') {
    if (join === 'polygons') return ['containment'];
    return ['nearest'];
  }
  if (dest === 'lines') return ['summary', 'first'];
  return ['first'];
}

/** Texto da opção, no formato da janela "Ligar Dados" do ArcMap. */
export function joinModeDescription(
  mode: SpatialJoinMode,
  dest: GeometryKind,
  join: GeometryKind,
): string {
  switch (mode) {
    case 'summary':
      return `Cada ${SINGULAR[dest]} receberá um resumo dos atributos numéricos dos ${PLURAL[join]} que caem dentro dele e um campo de contagem (Join_Count) mostrando quantos caíram dentro.`;
    case 'nearest':
      return `Cada ${SINGULAR[dest]} receberá todos os atributos do ${SINGULAR[join]} mais próximo e um campo de distância (DIST, em metros) até ele.`;
    case 'containment':
      return `Cada ${SINGULAR[dest]} receberá os atributos do ${SINGULAR[join]} que o contém.`;
    case 'first':
      return `Cada ${SINGULAR[dest]} receberá os atributos da primeira feição de ligação com a qual intersectar, mais um campo de contagem (Join_Count).`;
  }
}

/** Executa a ligação espacial e cria a nova camada com o resultado. */
export function spatialJoin(options: SpatialJoinOptions): SpatialJoinResult {
  const state = useAppStore.getState();
  const destRecord = state.layers.find((layer) => layer.id === options.destId);
  const joinRecord = state.layers.find((layer) => layer.id === options.joinId);
  if (!destRecord || !joinRecord) {
    return { error: 'A camada de destino ou a camada de ligação não foi encontrada.' };
  }
  const destFeatures = getLayerSource(destRecord.id)?.getFeatures() ?? [];
  const joinFeatures = getLayerSource(joinRecord.id)?.getFeatures() ?? [];
  if (destFeatures.length === 0) return { error: `A camada "${destRecord.name}" não possui feições.` };
  if (joinFeatures.length === 0) return { error: `A camada "${joinRecord.name}" não possui feições.` };
  if (destFeatures.length * joinFeatures.length > 8_000_000) {
    return { error: 'Muitas feições para cruzar (máximo de 8 milhões de comparações). Reduza uma das camadas.' };
  }

  const joinShapes: (Shape | null)[] = joinFeatures.map((feature) =>
    feature.getGeometry() ? shapeOf(feature.getGeometry()!) : null,
  );
  // Raio de busca (metros); 0 mantém o comportamento clássico: só quem toca.
  const radius = Math.max(0, Number(options.searchRadius) || 0);
  const joinProperties = joinFeatures.map((feature) => plainProperties(feature));
  const numericFields = Object.entries(joinProperties[0] ?? {}).filter(
    ([, value]) => typeof value === 'number' && Number.isFinite(value),
  );
  const wantedStats = options.mode === 'summary' ? options.stats : [];
  const outFeatures: Feature<Geometry>[] = [];

  for (const destFeature of destFeatures) {
    const destGeometry = destFeature.getGeometry();
    if (!destGeometry) continue;
    const destShape = shapeOf(destGeometry);
    const properties: Record<string, unknown> = plainProperties(destFeature);

    // Como no ArcMap: preserva ou gera o identificador da feição de destino (FID_1)
    if (properties.FID_1 === undefined) {
      const fid = destFeature.get('FID_1') ?? destFeature.get('FID');
      if (fid !== undefined && fid !== '') {
        properties.FID_1 = fid;
      } else {
        const rawId = destFeature.getId();
        const match = rawId != null ? String(rawId).match(/(\d+)\s*$/) : null;
        if (match) properties.FID_1 = Number(match[1]);
      }
    }

    const taken = new Set(Object.keys(properties));

    // Feições de ligação dentro da feição de destino — ou a até o raio de busca
    // (shapesDistance devolve 0 para quem toca/intersecta; com raio 0 o teste
    // equivale exatamente à interseção).
    const matches: number[] = [];
    for (let index = 0; index < joinShapes.length; index++) {
      const joinShape = joinShapes[index];
      if (joinShape && shapesDistance(destShape, joinShape) <= radius) matches.push(index);
    }

    if (options.mode === 'summary') {
      properties.Join_Count = matches.length;
      taken.add('Join_Count');
      for (const stat of wantedStats) {
        for (const [field] of numericFields) {
          const values = matches
            .map((index) => joinProperties[index][field])
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
          if (values.length === 0) continue;
          properties[uniquePropName(`${STAT_PREFIX[stat]}_${field}`, taken)] = round6(computeStat(stat, values));
        }
      }
    } else if (options.mode === 'nearest') {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      for (let index = 0; index < joinShapes.length; index++) {
        const joinShape = joinShapes[index];
        if (!joinShape) continue;
        const distance = shapesDistance(destShape, joinShape);
        // Com raio de busca, só quem está ao alcance disputa (ArcGIS Pro).
        if (radius > 0 && distance > radius) continue;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      if (nearestIndex >= 0) {
        for (const [key, value] of Object.entries(joinProperties[nearestIndex])) {
          if (shouldSkipJoinField(key)) continue;
          properties[uniquePropName(key, taken)] = value;
        }
        properties.DIST = round6(nearestDistance);
      } else {
        properties.DIST = '';
      }
    } else {
      // containment / first: atributos da primeira feição encontrada.
      const first = matches[0];
      if (first !== undefined) {
        const joinProp = joinProperties[first];
        // Atribui o identificador do polígono como OID_1 (padrão ArcMap)
        if (properties.OID_1 === undefined) {
          const oidVal = joinProp.OID_1 ?? joinProp.OID ?? joinProp.PageNumber;
          if (oidVal !== undefined) {
            properties.OID_1 = oidVal;
            taken.add('OID_1');
          }
        }
        for (const [key, value] of Object.entries(joinProp)) {
          if (shouldSkipJoinField(key)) continue;
          if (key === 'OID' && properties.OID_1 !== undefined) continue;
          properties[uniquePropName(key, taken)] = value;
        }
      }
    }

    outFeatures.push(new Feature({ ...properties, geometry: destGeometry.clone() }));
  }

  if (outFeatures.length === 0) {
    return { error: 'Nenhuma feição de destino pôde ser processada.' };
  }

  const name = uniqueLayerName((options.outputName ?? '').trim() || 'Join_Output');
  const geojson = featuresToGeoJSON(outFeatures) as FeatureCollection;
  const id = addGeoJSONLayer({
    name,
    geojson,
    crs: 'EPSG:4326',
    kind: 'analysis',
    sourceLabel: joinRecord.name,
  });
  const geometryTypes =
    destRecord.geometryTypes.length > 0
      ? destRecord.geometryTypes
      : [...new Set(outFeatures.map((feature) => feature.getGeometry()?.getType()).filter(Boolean))] as string[];
  useAppStore.getState().updateLayer(id, {
    featureCount: outFeatures.length,
    geometryTypes,
    fields: summarizeFields(geojson),
  });
  zoomToLayer(id);
  return { count: outFeatures.length, name };
}

/** Propriedades simples de uma feição (sem a geometria). */
export function plainProperties(feature: Feature<Geometry>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(feature.getProperties())) {
    if (key === 'geometry' || value === undefined) continue;
    properties[key] = value;
  }
  return properties;
}

/** Estatística escolhida (população), como no ArcMap. */
function computeStat(stat: SpatialJoinStat, values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / count;
  switch (stat) {
    case 'sum':
      return sum;
    case 'mean':
      return mean;
    case 'min':
      return sorted[0];
    case 'max':
      return sorted[count - 1];
    case 'var':
      return variance;
    case 'std':
      return Math.sqrt(variance);
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Nome de propriedade único (renomeia com sufixo _1, _2… em caso de choque). */
export function uniquePropName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let suffix = 1; suffix < 200; suffix++) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const fallback = `${base}_${taken.size}`;
  taken.add(fallback);
  return fallback;
}

/** Campos da nova camada, inferidos das feições de saída. */
export function summarizeFields(collection: FeatureCollection): FieldDef[] {
  const fields: FieldDef[] = [];
  const seen = new Set<string>();
  for (const feature of collection.features.slice(0, 5000)) {
    for (const [name, value] of Object.entries(feature.properties ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      const type =
        typeof value === 'number'
          ? Number.isInteger(value)
            ? 'integer'
            : 'real'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'string';
      fields.push({ name, type });
      if (fields.length >= 60) return fields;
    }
  }
  return fields;
}
