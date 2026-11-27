import proj4 from 'proj4';
import * as turf from '@turf/turf';
import type {
  BBox,
  Feature,
  FeatureCollection,
  GeoJSON as GeoJsonRoot,
  Geometry as GeoJsonGeometry,
  Polygon,
} from 'geojson';
import {
  addGeoJSONLayer,
  featuresToGeoJSON,
  getLayerGeoJSON,
  getLayerSource,
  getMap,
  getSelection,
  refreshAllZIndexes,
  zoomToFeatures,
} from '../map/mapContext';
import { useAppStore } from '../store';
import type { LabelStyle, LayerStyle } from '../types';

const UTM_CRS = 'geodesk:utm';
const MAX_CELLS = 20000;
const MAX_INPUT_FEATURES = 50000;

/** Células no padrão ArcMap: preenchimento lavanda e borda fina escura. */
const GRID_STYLE: Partial<LayerStyle> = {
  strokeColor: '#4c3f8f',
  fillColor: 'rgba(170, 160, 235, 0.8)',
  strokeWidth: 1,
};

/** Rótulo de cada célula com o ShapeName (A, B, C…), com destaque nítido. */
const GRID_LABELS: LabelStyle = {
  enabled: true,
  field: 'ShapeName',
  color: '#0b0f17',
  fontFamily: 'Segoe UI',
  fontSize: 13,
  bold: true,
  haloColor: '#ffffff',
  haloWidth: 3,
};

export type GridUnit = 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft';
export type GridOrigin = 'view' | 'selection' | 'layer';
export type GridNaming = 'alpha' | 'matrix' | 'numeric';

export interface GridOptions {
  /** Classe de Feição de Saída (nome da camada gerada). */
  outputName: string;
  /** Feições de Entrada (opcional): mapa visível, seleção (trafo) ou camada. */
  origin: GridOrigin;
  layerId: string | null;
  /** Largura do Polígono, na unidade informada. */
  width: number;
  widthUnit: GridUnit;
  /** Altura do Polígono, na unidade informada. */
  height: number;
  heightUnit: GridUnit;
  /** "Utilizar Unidade da Página e Escala (opcional)". */
  pageScale: boolean;
  /** "Escala do Mapa (opcional)" — aceita "24000", "1:24000" ou "1/24000". */
  scaleText: string;
  /** Coordenadas de Origem da Grade do Polígono (opcional), em graus decimais WGS84. */
  originX: number | null;
  originY: number | null;
  /** Número de Linhas / Colunas (opcional). Quando ausente, calcula pela extensão. */
  rows: number | null;
  cols: number | null;
  /** Iniciando Número de Página (opcional). */
  startPage: number;
  /** "Gerar Grade de Polígono que intersecciona ... feições de entrada". */
  clipToInput: boolean;
  /** "Rotular as células com o ShapeName" (padrão: ligado). */
  labelCells?: boolean;
  /** Formato do ShapeName: 'alpha' (A, B, C...), 'matrix' (A1, A2...) ou 'numeric' (1, 2, 3...). Padrão: 'alpha'. */
  gridNaming?: GridNaming;
}

export type GridResult = { count: number; name: string; clipped: number } | { error: string };

type Extent = [number, number, number, number];

interface InputFeature {
  geometry: GeoJsonGeometry;
  bbox: BBox;
}

interface GridCell {
  row: number;
  col: number;
  ring: [number, number][];
}

interface GridGeometry {
  utm: string;
  x0: number;
  y0: number;
  widthM: number;
  heightM: number;
  rows: number;
  cols: number;
}

const METERS_PER_UNIT: Record<GridUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
};

export function generateGrid(options: GridOptions): GridResult {
  let scale = 1;
  if (options.pageScale) {
    const parsedScale = parseMapScale(options.scaleText);
    if (parsedScale == null) {
      return { error: 'Escala do Mapa inválida. Use algo como 25000, 1:25.000 ou 1/25000.' };
    }
    scale = parsedScale;
  }
  const widthM = toMeters(options.width, options.widthUnit) * scale;
  const heightM = toMeters(options.height, options.heightUnit) * scale;
  if (!Number.isFinite(widthM) || widthM <= 0 || !Number.isFinite(heightM) || heightM <= 0) {
    return { error: 'Informe uma Largura e uma Altura maiores que zero.' };
  }

  let extent3857: Extent | null = null;
  let baseName = 'mapa visível';
  let inputs: InputFeature[] = [];

  if (options.origin === 'view') {
    const map = getMap();
    const size = map?.getSize();
    if (!map || !size || size[0] === 0 || size[1] === 0) {
      return { error: 'O mapa ainda não está pronto para usar a extensão visível.' };
    }
    extent3857 = map.getView().calculateExtent(size) as Extent;
    // Sem Feições de Entrada explícitas, a interseção usa as camadas carregadas e visíveis.
    inputs = inputsFromVisibleLayers();
  } else if (options.origin === 'layer') {
    if (!options.layerId) return { error: 'Selecione uma camada de Feições de Entrada.' };
    const record = useAppStore.getState().layers.find((layer) => layer.id === options.layerId);
    const source = getLayerSource(options.layerId);
    if (!source || source.getFeatures().length === 0) {
      return { error: 'A camada de Feições de Entrada está vazia ou indisponível.' };
    }
    extent3857 = source.getExtent() as Extent;
    baseName = record?.name ?? 'camada';
    inputs = readInputs(getLayerGeoJSON(options.layerId));
  } else {
    const selected = getSelection();
    if (selected.length === 0) {
      return { error: 'Nenhuma feição selecionada. Selecione o trafo antes de criar a grade.' };
    }
    extent3857 = unionExtent(selected);
    baseName = selectionLayerName(selected);
    inputs = readInputs(featuresToGeoJSON(selected));
  }

  if (
    !extent3857 ||
    extent3857.some((value) => !Number.isFinite(value)) ||
    extent3857[0] > extent3857[2] ||
    extent3857[1] > extent3857[3]
  ) {
    return { error: 'Não foi possível determinar a extensão de origem.' };
  }

  const center = proj4('EPSG:3857', 'EPSG:4326', [
    (extent3857[0] + extent3857[2]) / 2,
    (extent3857[1] + extent3857[3]) / 2,
  ]);
  const utm = ensureUtm(center[0], center[1]);

  const sw = proj4('EPSG:3857', utm, [extent3857[0], extent3857[1]]);
  const ne = proj4('EPSG:3857', utm, [extent3857[2], extent3857[3]]);
  let minUx = Math.min(sw[0], ne[0]);
  let maxUx = Math.max(sw[0], ne[0]);
  let minUy = Math.min(sw[1], ne[1]);
  let maxUy = Math.max(sw[1], ne[1]);

  // Caixa de trabalho em UTM: calculada a partir das próprias feições de entrada, para a
  // grade ancorar exatamente no canto inferior esquerdo dos dados (como no ArcMap).
  // Apenas a origem "mapa visível" mantém a extensão do quadro de mapa.
  if (options.origin !== 'view' && inputs.length > 0) {
    let started = false;
    for (const input of inputs) {
      const [minLon, minLat, maxLon, maxLat] = input.bbox;
      const corners: [number, number][] = [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
      ];
      for (const corner of corners) {
        const point = proj4('EPSG:4326', utm, corner);
        if (!started) {
          minUx = maxUx = point[0];
          minUy = maxUy = point[1];
          started = true;
          continue;
        }
        if (point[0] < minUx) minUx = point[0];
        if (point[0] > maxUx) maxUx = point[0];
        if (point[1] < minUy) minUy = point[1];
        if (point[1] > maxUy) maxUy = point[1];
      }
    }
  }

  // Extensões degeneradas (ex.: um trafo pontual) ganham no mínimo uma célula ao redor do centro.
  const centerX = (minUx + maxUx) / 2;
  const centerY = (minUy + maxUy) / 2;
  if (maxUx - minUx < widthM) {
    minUx = centerX - widthM / 2;
    maxUx = centerX + widthM / 2;
  }
  if (maxUy - minUy < heightM) {
    minUy = centerY - heightM / 2;
    maxUy = centerY + heightM / 2;
  }

  let x0 = minUx;
  let y0 = minUy;
  if (
    options.originX != null &&
    options.originY != null &&
    Number.isFinite(options.originX) &&
    Number.isFinite(options.originY)
  ) {
    const anchor = proj4('EPSG:4326', utm, [options.originX, options.originY]);
    x0 = anchor[0];
    y0 = anchor[1];
  }

  const cols = positiveInt(options.cols) ?? Math.max(1, Math.ceil((maxUx - x0) / widthM));
  const rows = positiveInt(options.rows) ?? Math.max(1, Math.ceil((maxUy - y0) / heightM));
  const total = rows * cols;
  if (total > MAX_CELLS) {
    return {
      error: `A grade teria ${total.toLocaleString('pt-BR')} células (máximo ${MAX_CELLS.toLocaleString('pt-BR')}). Aumente a Largura/Altura ou reduza Linhas/Colunas.`,
    };
  }

  const clip = options.clipToInput && inputs.length > 0;
  const startPage = positiveInt(options.startPage) ?? 1;

  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellX0 = x0 + col * widthM;
      const cellY0 = y0 + row * heightM;
      const corners: [number, number][] = [
        [cellX0, cellY0],
        [cellX0 + widthM, cellY0],
        [cellX0 + widthM, cellY0 + heightM],
        [cellX0, cellY0 + heightM],
      ];
      const ring = corners.map(([x, y]) => proj4(utm, 'EPSG:4326', [x, y]) as [number, number]);
      ring.push(ring[0]);
      cells.push({ row, col, ring });
    }
  }

  // Como no ArcMap: mantém apenas as células que tocam as feições de entrada (formato em escada).
  const keep = clip
    ? markIntersectingCells(cells, inputs, { utm, x0, y0, widthM, heightM, rows, cols })
    : null;

  const naming: GridNaming = options.gridNaming ?? 'alpha';
  const features: Feature<Polygon>[] = [];
  let clipped = 0;
  let page = startPage;
  let alphaSeq = Math.max(0, startPage - 1);

  // Percorre as células na ordem de leitura cartográfica:
  // Do Norte para o Sul (linhas de cima para baixo) e do Oeste para o Leste (colunas da esquerda para a direita).
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const cell = cells[index];
      if (!cell) continue;

      if (keep && !keep[index]) {
        clipped += 1;
        continue;
      }

      let shapeName: string;
      if (naming === 'matrix') {
        const rowChar = rowLabel(rows - 1 - cell.row);
        shapeName = `${rowChar}${cell.col + 1}`;
      } else if (naming === 'numeric') {
        shapeName = String(page);
      } else {
        // 'alpha' (padrão): sequencial alfabético iniciando sempre em A, B, C...
        shapeName = rowLabel(alphaSeq);
      }

      features.push({
        type: 'Feature',
        properties: {
          // Atributos no padrão do ArcMap "Grid Index Features".
          OID: page,
          PageName: shapeName,
          ShapeName: shapeName,
          PageNumber: page,
          Shape_Length: round6(ringMetricsDeg(cell.ring).perimeter),
          Shape_Area: round6(ringMetricsDeg(cell.ring).area),
        },
        geometry: { type: 'Polygon', coordinates: [cell.ring] },
      });
      page += 1;
      alphaSeq += 1;
    }
  }

  if (features.length === 0) {
    return {
      error: 'Nenhuma célula da grade intersecta as Feições de Entrada. Ajuste a Largura/Altura ou desmarque a opção de interseção.',
    };
  }

  const name = uniqueLayerName(outputClassName(options.outputName));
  const geojson: FeatureCollection = { type: 'FeatureCollection', features };

  const id = addGeoJSONLayer({
    name,
    geojson,
    crs: 'EPSG:4326',
    kind: 'analysis',
    sourceLabel: baseName,
    style: options.labelCells === false ? GRID_STYLE : { ...GRID_STYLE, labels: GRID_LABELS },
  });
  useAppStore.getState().updateLayer(id, {
    fields: [
      { name: 'OID', type: 'integer' },
      { name: 'PageName', type: 'string' },
      { name: 'ShapeName', type: 'string' },
      { name: 'PageNumber', type: 'integer' },
      { name: 'Shape_Length', type: 'real' },
      { name: 'Shape_Area', type: 'real' },
    ],
    featureCount: features.length,
    geometryTypes: ['Polygon'],
  });

  // Como no ArcMap: a grade fica por baixo, com os pontos/trafos desenhados por cima.
  useAppStore.getState().sendLayerToBack(id);
  refreshAllZIndexes();

  const created = getLayerSource(id);
  if (created) zoomToFeatures(created.getFeatures());

  return { count: features.length, name, clipped };
}

/**
 * Converte "24000", "1:24000", "1/24000" ou "1:24.000" no fator de escala.
 * Vazio = 1:1. Retorna null quando o texto não é uma escala válida.
 */
function parseMapScale(text: string): number | null {
  const raw = (text ?? '').trim().replace(/\s+/g, '');
  if (!raw) return 1;
  const normalized = raw.replace(/[=/]/, ':');
  const separator = normalized.indexOf(':');
  const after = separator >= 0 ? normalized.slice(separator + 1) : normalized;
  // "24.000", "24,000" e "24 000" usam ponto/vírgula como separador de milhares.
  const value = /^\d{1,3}([.,\s]\d{3})+$/.test(after)
    ? Number(after.replace(/[.,\s]/g, ''))
    : Number(after);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function toMeters(value: number, unit: GridUnit): number {
  if (!Number.isFinite(value)) return NaN;
  return value * (METERS_PER_UNIT[unit] ?? 1);
}

/** Texto com o tamanho real da célula no terreno (ex.: "500 m", "1 km", "25 cm"). */
export function describeCellGroundSize(
  value: number,
  unit: GridUnit,
  pageScale: boolean,
  scaleText: string,
): string {
  const scale = (pageScale ? parseMapScale(scaleText) : 1) ?? 1;
  return formatGroundSize(toMeters(value, unit) * scale);
}

function formatGroundSize(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  const trim = (number: number) => number.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const km = meters / 1000;
  if (km >= 1) return `${trim(km)} km`;
  if (meters >= 1) return `${trim(meters)} m`;
  const cm = meters * 100;
  if (cm >= 1) return `${trim(cm)} cm`;
  return `${trim(meters * 1000)} mm`;
}

function positiveInt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  return truncated >= 1 ? truncated : null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Rótulo de linha no estilo ArcMap: A, B, … Z, AA, AB… */
function rowLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Perímetro e área do anel em unidades do CRS de saída (graus), como o
 * Shape_Length/Shape_Area que o ArcMap grava nas feições de índice da grade.
 */
function ringMetricsDeg(ring: [number, number][]): { perimeter: number; area: number } {
  let perimeter = 0;
  let shoelace = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    perimeter += Math.hypot(x2 - x1, y2 - y1);
    shoelace += x1 * y2 - x2 * y1;
  }
  return { perimeter, area: Math.abs(shoelace) / 2 };
}

function readInputs(collection: GeoJsonRoot, limit: number = MAX_INPUT_FEATURES): InputFeature[] {
  if (collection.type !== 'FeatureCollection') return [];
  const inputs: InputFeature[] = [];
  for (const feature of collection.features) {
    if (inputs.length >= limit) break;
    if (!feature.geometry) continue;
    try {
      inputs.push({ geometry: feature.geometry, bbox: turf.bbox(feature, { recompute: true }) });
    } catch {
      continue;
    }
  }
  return inputs;
}

/** Feições de todas as camadas carregadas e visíveis (usadas quando a origem é o mapa visível). */
function inputsFromVisibleLayers(): InputFeature[] {
  const inputs: InputFeature[] = [];
  for (const layer of useAppStore.getState().layers) {
    if (!layer.visible) continue;
    if (inputs.length >= MAX_INPUT_FEATURES) break;
    inputs.push(...readInputs(getLayerGeoJSON(layer.id), MAX_INPUT_FEATURES - inputs.length));
  }
  return inputs;
}

/**
 * Marca as células que intersectam alguma feição de entrada.
 * Cada feição só testa as células cobertas pela sua caixa delimitadora (bem mais rápido
 * do que testar todas as células contra todas as feições).
 */
function markIntersectingCells(
  cells: GridCell[],
  inputs: InputFeature[],
  grid: GridGeometry,
): Uint8Array {
  const hits = new Uint8Array(cells.length);
  const polygons = new Map<number, ReturnType<typeof turf.polygon>>();
  const gridMaxX = grid.x0 + grid.cols * grid.widthM;
  const gridMaxY = grid.y0 + grid.rows * grid.heightM;

  for (const input of inputs) {
    const [minLon, minLat, maxLon, maxLat] = input.bbox;
    const sw = proj4('EPSG:4326', grid.utm, [minLon, minLat]);
    const ne = proj4('EPSG:4326', grid.utm, [maxLon, maxLat]);
    const minUx = Math.min(sw[0], ne[0]);
    const maxUx = Math.max(sw[0], ne[0]);
    const minUy = Math.min(sw[1], ne[1]);
    const maxUy = Math.max(sw[1], ne[1]);
    if (maxUx < grid.x0 || minUx > gridMaxX || maxUy < grid.y0 || minUy > gridMaxY) continue;

    const colStart = clampInt(Math.floor((minUx - grid.x0) / grid.widthM) - 1, 0, grid.cols - 1);
    const colEnd = clampInt(Math.ceil((maxUx - grid.x0) / grid.widthM) + 1, 0, grid.cols - 1);
    const rowStart = clampInt(Math.floor((minUy - grid.y0) / grid.heightM) - 1, 0, grid.rows - 1);
    const rowEnd = clampInt(Math.ceil((maxUy - grid.y0) / grid.heightM) + 1, 0, grid.rows - 1);
    if (colStart > colEnd || rowStart > rowEnd) continue;

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const index = row * grid.cols + col;
        if (hits[index] === 1) continue;
        const cell = cells[index];
        if (!cell) continue;

        let polygon = polygons.get(index);
        if (!polygon) {
          try {
            polygon = turf.polygon([cell.ring]);
            polygons.set(index, polygon);
          } catch {
            hits[index] = 1;
            continue;
          }
        }

        try {
          if (turf.booleanIntersects(polygon, input.geometry)) hits[index] = 1;
        } catch {
          hits[index] = 1;
        }
      }
    }
  }

  return hits;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function unionExtent(features: ReturnType<typeof getSelection>): Extent | null {
  let extent: Extent | null = null;
  for (const feature of features) {
    const geometryExtent = feature.getGeometry()?.getExtent();
    if (!geometryExtent) continue;
    extent = extent
      ? [
          Math.min(extent[0], geometryExtent[0]),
          Math.min(extent[1], geometryExtent[1]),
          Math.max(extent[2], geometryExtent[2]),
          Math.max(extent[3], geometryExtent[3]),
        ]
      : [geometryExtent[0], geometryExtent[1], geometryExtent[2], geometryExtent[3]];
  }
  return extent;
}

function selectionLayerName(features: ReturnType<typeof getSelection>): string {
  const layers = useAppStore.getState().layers;
  for (const feature of features) {
    const id = String(feature.getId() ?? '');
    const layer = layers.find((candidate) => id.startsWith(`${candidate.id}-`));
    if (layer) return `${layer.name} (seleção)`;
  }
  return 'feições selecionadas';
}

/** Aceita um nome simples ou um caminho tipo "C:\...\GridIndexFeatures2". */
function outputClassName(value: string): string {
  const cleaned = (value ?? '').trim().replace(/[\\/]+$/, '');
  if (!cleaned) return 'GridIndexFeatures';
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || 'GridIndexFeatures';
}

export function uniqueLayerName(base: string): string {
  const existing = new Set(useAppStore.getState().layers.map((layer) => layer.name));
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix++) {
    const candidate = `${base}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

function ensureUtm(lon: number, lat: number): string {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const south = lat < 0;
  proj4.defs(UTM_CRS, `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`);
  return UTM_CRS;
}
