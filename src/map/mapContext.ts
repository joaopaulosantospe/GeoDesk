import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Graticule from 'ol/layer/Graticule.js';
import { fromLonLat } from 'ol/proj.js';
import { Style, Stroke, Fill, Circle as CircleStyle, RegularShape, Text, Icon } from 'ol/style.js';
import { defaults as defaultControls, ScaleLine } from 'ol/control.js';
import type BaseLayer from 'ol/layer/Base.js';
import type Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import type { GeoJSON as GeoJsonRoot } from 'geojson';
import { basemaps } from './basemaps';
import { fontStack } from '../labels';
import { nextLayerStyle, uid, useAppStore } from '../store';
import type { BasemapId, LayerRecord, LayerSourceKind, LayerStyle } from '../types';

let map: OlMap | null = null;
let basemapLayer: TileLayer<XYZ> | null = null;
let labelsLayer: TileLayer<XYZ> | null = null;
let graticule: Graticule | null = null;
let selectionSource: VectorSource<Feature<Geometry>> | null = null;
let selectionLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
let contextSource: VectorSource<Feature<Geometry>> | null = null;
let contextLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
let currentBasemap: BasemapId = 'light';
const graticuleStroke = new Stroke({ color: 'rgba(15, 23, 42, 0.08)', width: 1 });
const vectorRegistry = new Map<string, VectorLayer<VectorSource<Feature<Geometry>>>>();
let readyResolve: ((m: OlMap) => void) | null = null;
const readyPromise = new Promise<OlMap>((resolve) => {
  readyResolve = resolve;
});

const BRAZIL_LONLAT: [number, number] = [-51.9, -14.2];

export function initMap(container: HTMLElement): OlMap {
  if (map) {
    if (map.getTarget() !== container) {
      map.setTarget(container);
    }
    map.updateSize();
    return map;
  }

  container.innerHTML = '';

  basemapLayer = new TileLayer({
    source: new XYZ({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 }),
    visible: false,
    zIndex: 0,
  });

  labelsLayer = new TileLayer({
    source: new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 }),
    visible: false,
    zIndex: 0,
  });

  graticule = new Graticule({
    strokeStyle: graticuleStroke,
    showLabels: false,
    zIndex: 1,
  });

  contextSource = new VectorSource<Feature<Geometry>>();
  contextLayer = new VectorLayer({
    source: contextSource,
    zIndex: 2,
  });

  selectionSource = new VectorSource<Feature<Geometry>>();
  selectionLayer = new VectorLayer({
    source: selectionSource,
    style: selectionStyle(),
    zIndex: 1000,
    declutter: false,
  });

  map = new OlMap({
    target: container,
    layers: [basemapLayer, labelsLayer, graticule, contextLayer, selectionLayer],
    view: new View({
      center: fromLonLat(BRAZIL_LONLAT),
      zoom: 4,
      minZoom: 2,
      maxZoom: 24,
    }),
    controls: defaultControls({ zoom: true, rotate: false, attribution: true }).extend([
      new ScaleLine({ units: 'metric' }),
    ]),
  });

  setBasemap(useAppStore.getState().basemapId);
  void loadContextGeometries();

  readyResolve?.(map);
  return map;
}

export function updateMapSize(): void {
  map?.updateSize();
}

export function whenMapReady(): Promise<OlMap> {
  return readyPromise;
}

export function getMap(): OlMap | null {
  return map;
}

export function setBasemap(id: BasemapId): void {
  currentBasemap = id;
  const def = basemaps.find((b) => b.id === id);

  if (map) {
    const vp = map?.getViewport();
    if (vp) vp.style.backgroundColor = id === 'dark' ? '#0a0c10' : '#f8fafc';
  }

  if (basemapLayer && def?.online && def.url) {
    basemapLayer.setVisible(true);
    basemapLayer.setSource(
      new XYZ({
        url: def.url,
        attributions: def.attribution ?? '',
        maxZoom: def.maxZoom ?? 18,
        crossOrigin: 'anonymous',
      })
    );
  } else {
    basemapLayer?.setVisible(false);
  }

  if (labelsLayer) {
    if (def?.overlayUrl) {
      labelsLayer.setVisible(true);
      labelsLayer.setSource(
        new XYZ({
          url: def.overlayUrl,
          maxZoom: def.maxZoom ?? 18,
          crossOrigin: 'anonymous',
        })
      );
    } else {
      labelsLayer.setVisible(false);
    }
  }

  contextLayer?.setVisible(!def?.online);
  contextLayer?.setStyle(contextStyle(id));
  graticuleStroke.setColor(id === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)');
}

function contextStyle(id: BasemapId) {
  const light = id === 'light';
  return (feature: FeatureLike) => {
    const kind = feature.get('ctx');
    if (kind === 'states') {
      return new Style({
        stroke: new Stroke({
          color: light ? 'rgba(100, 116, 139, 0.45)' : 'rgba(148, 163, 184, 0.22)',
          width: 0.7,
        }),
      });
    }
    return new Style({
      stroke: new Stroke({
        color: light ? 'rgba(71, 85, 105, 0.55)' : 'rgba(148, 163, 184, 0.35)',
        width: 0.9,
      }),
      fill: new Fill({
        color: light ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.65)',
      }),
    });
  };
}

interface ViteMeta extends ImportMeta {
  env: { BASE_URL: string };
}

async function loadContextGeometries(): Promise<void> {
  if (!contextSource) return;
  const base = (import.meta as ViteMeta).env.BASE_URL;
  const defs = [
    { file: 'paises-mundo.geojson', tag: 'countries' },
    { file: 'brasil-estados.geojson', tag: 'states' },
  ];
  const format = new GeoJSON();
  for (const d of defs) {
    try {
      const res = await fetch(`${base}samples/${d.file}`);
      if (!res.ok) continue;
      const data: unknown = await res.json();
      const features = format.readFeatures(data as object, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      features.forEach((f) => f.set('ctx', d.tag));
      contextSource.addFeatures(features);
    } catch {
      continue;
    }
  }
  contextLayer?.setStyle(contextStyle(currentBasemap));
}

export function getVectorLayer(id: string): VectorLayer<VectorSource<Feature<Geometry>>> | undefined {
  return vectorRegistry.get(id);
}

export function getLayerSource(id: string): VectorSource<Feature<Geometry>> | undefined {
  return vectorRegistry.get(id)?.getSource() ?? undefined;
}

export function registerVectorLayer(id: string, layer: VectorLayer<VectorSource<Feature<Geometry>>>): void {
  vectorRegistry.set(id, layer);
  map?.addLayer(layer);
  syncStoreOrder();
}

export function unregisterVectorLayer(id: string): void {
  const layer = vectorRegistry.get(id);
  if (layer && map) map.removeLayer(layer);
  vectorRegistry.delete(id);
}

function syncStoreOrder(): void {
  if (!map) return;
  const order = useAppStore.getState().layers.map((l) => l.id);
  order.forEach((id, i) => {
    const layer = vectorRegistry.get(id);
    layer?.setZIndex(10 + i);
  });
}

export function applyLayerVisibility(id: string, visible: boolean): void {
  const layer = vectorRegistry.get(id);
  if (!layer) return;
  layer.setVisible(visible);
  layer.changed();
  map?.render();
}

export function applyLayerOpacity(id: string, opacity: number): void {
  vectorRegistry.get(id)?.setOpacity(opacity);
}

export function applyLayerStyle(id: string, style: LayerStyle): void {
  const layer = vectorRegistry.get(id);
  if (!layer) return;
  layer.setStyle(makeStyleFunction(style));
  layer.changed();
  const source = layer.getSource();
  if (source) {
    source.changed();
  }
  map?.render();
}

function declutterFor(_style: LayerStyle): boolean {
  return false;
}

function makeStyleFunction(style: LayerStyle) {
  return (feature: FeatureLike) => {
    const geomType = feature.getGeometry()?.getType();
    const text = labelText(style, feature, geomType);
    if (geomType === 'Point' || geomType === 'MultiPoint') {
      return new Style({ image: pointImage(style), text });
    }
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      return new Style({
        stroke: new Stroke({ color: style.strokeColor, width: style.strokeWidth + 0.6 }),
        text,
      });
    }
    return new Style({
      stroke: new Stroke({ color: style.strokeColor, width: style.strokeWidth }),
      fill: new Fill({ color: style.fillColor }),
      text,
    });
  };
}

/** Texto do rótulo da feição, como no ArcMap ("Rotular as feições nesta camada"). */
function labelText(style: LayerStyle, feature: FeatureLike, geomType?: string): Text | undefined {
  const config = style.labels;
  if (!config?.enabled) return undefined;

  // Busca flexível: get direto, properties e insensível a maiúsculas/minúsculas
  let raw: unknown = feature.get(config.field);
  if (raw === undefined || raw === null || raw === '') {
    const props = feature.getProperties();
    raw = props[config.field];
    if (raw === undefined || raw === null || raw === '') {
      const target = config.field.toLowerCase().trim();
      for (const [k, v] of Object.entries(props)) {
        if (k.toLowerCase().trim() === target) {
          raw = v;
          break;
        }
      }
    }
  }

  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (text === '') return undefined;
  const italic = config.italic ? 'italic ' : '';
  const bold = config.bold ? 'bold ' : '';
  const haloWidth = config.haloWidth ?? 3;

  const isPoint =
    geomType === 'Point' || geomType === 'MultiPoint' || (!geomType && (style.pointRadius ?? 0) > 0);
  const placement = config.placement || (isPoint ? 'top' : 'center');
  const radius = Math.max(2, style.pointRadius || 5);
  const pad = Math.max(5, Math.round(style.strokeWidth || 1) + 4);

  let offsetX = 0;
  let offsetY = 0;
  let textAlign: CanvasTextAlign = 'center';
  let textBaseline: CanvasTextBaseline = 'middle';

  if (isPoint) {
    switch (placement) {
      case 'top':
        offsetY = -(radius + pad);
        textBaseline = 'bottom';
        textAlign = 'center';
        break;
      case 'bottom':
        offsetY = radius + pad;
        textBaseline = 'top';
        textAlign = 'center';
        break;
      case 'right':
        offsetX = radius + pad;
        textAlign = 'left';
        textBaseline = 'middle';
        break;
      case 'left':
        offsetX = -(radius + pad);
        textAlign = 'right';
        textBaseline = 'middle';
        break;
      case 'top-right':
        offsetX = radius + pad - 2;
        offsetY = -(radius + pad - 2);
        textAlign = 'left';
        textBaseline = 'bottom';
        break;
      case 'top-left':
        offsetX = -(radius + pad - 2);
        offsetY = -(radius + pad - 2);
        textAlign = 'right';
        textBaseline = 'bottom';
        break;
      case 'bottom-right':
        offsetX = radius + pad - 2;
        offsetY = radius + pad - 2;
        textAlign = 'left';
        textBaseline = 'top';
        break;
      case 'bottom-left':
        offsetX = -(radius + pad - 2);
        offsetY = radius + pad - 2;
        textAlign = 'right';
        textBaseline = 'top';
        break;
      case 'center':
      default:
        offsetX = 0;
        offsetY = 0;
        textAlign = 'center';
        textBaseline = 'middle';
        break;
    }
  }

  return new Text({
    text,
    font: `${italic}${bold}${config.fontSize}px ${fontStack(config.fontFamily)}`,
    fill: new Fill({ color: config.color }),
    // Máscara para o rótulo ficar legível sobre qualquer fundo.
    stroke:
      haloWidth > 0
        ? new Stroke({ color: config.haloColor ?? 'rgba(255, 255, 255, 0.92)', width: haloWidth })
        : undefined,
    offsetX,
    offsetY,
    textAlign,
    textBaseline,
    overflow: true,
  });
}

/** Ícone do ponto no formato escolhido (círculo, quadrado, losango, triângulo ou estrela). */
function pointImage(style: LayerStyle) {
  const fill = new Fill({ color: style.fillColor });
  const stroke = new Stroke({ color: style.strokeColor, width: Math.max(1, style.strokeWidth) });
  const radius = Math.max(1, style.pointRadius);
  const strokeW = Math.max(1, style.strokeWidth);

  switch (style.pointShape) {
    case 'square':
      return new RegularShape({ points: 4, radius, angle: Math.PI / 4, fill, stroke });
    case 'diamond':
      return new RegularShape({ points: 4, radius, fill, stroke });
    case 'triangle':
      return new RegularShape({ points: 3, radius, fill, stroke });
    case 'triangle-down':
      return new RegularShape({ points: 3, radius, angle: Math.PI, fill, stroke });
    case 'star':
      return new RegularShape({ points: 5, radius, radius2: radius * 0.45, fill, stroke });
    case 'hexagon':
      return new RegularShape({ points: 6, radius, angle: Math.PI / 6, fill, stroke });
    case 'pentagon':
      return new RegularShape({ points: 5, radius, fill, stroke });
    case 'cross': {
      const s = 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.5],
        scale: Math.max(0.3, radius / 9),
      });
    }
    case 'x': {
      const s = 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><g transform="rotate(45 12 12)"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/></g></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.5],
        scale: Math.max(0.3, radius / 9),
      });
    }
    case 'pin': {
      const w = 24;
      const h = 32;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 32"><path d="M 12 2 C 7.58 2 4 5.58 4 10 C 4 16.5 12 29.5 12 29.5 C 12 29.5 20 16.5 20 10 C 20 5.58 16.42 2 12 2 Z M 12 5.5 A 4.5 4.5 0 1 0 12 14.5 A 4.5 4.5 0 1 0 12 5.5 Z" fill-rule="evenodd" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.95],
        scale: Math.max(0.35, radius / 8),
      });
    }
    case 'pin-outline': {
      const w = 24;
      const h = 32;
      const color = style.strokeColor || style.fillColor || '#000000';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 32" fill="none"><path d="M 12 2 C 7.58 2 4 5.58 4 10 C 4 16.5 12 29.5 12 29.5 C 12 29.5 20 16.5 20 10 C 20 5.58 16.42 2 12 2 Z" stroke="${color}" stroke-width="${Math.max(1.8, strokeW * 1.3)}"/><circle cx="12" cy="10" r="4.5" stroke="${color}" stroke-width="${Math.max(1.8, strokeW * 1.3)}"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.95],
        scale: Math.max(0.35, radius / 8),
      });
    }
    case 'pin-dot': {
      const w = 24;
      const h = 32;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 32"><path d="M 12 2 C 7.58 2 4 5.58 4 10 C 4 16.5 12 29.5 12 29.5 C 12 29.5 20 16.5 20 10 C 20 5.58 16.42 2 12 2 Z" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/><circle cx="12" cy="10" r="3.5" fill="#ffffff" stroke="${style.strokeColor}" stroke-width="1"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.95],
        scale: Math.max(0.35, radius / 8),
      });
    }
    case 'pin-solid': {
      const w = 24;
      const h = 32;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 32"><path d="M 12 2 C 7.58 2 4 5.58 4 10 C 4 16.5 12 29.5 12 29.5 C 12 29.5 20 16.5 20 10 C 20 5.58 16.42 2 12 2 Z" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.95],
        scale: Math.max(0.35, radius / 8),
      });
    }
    case 'bullseye': {
      const s = 28;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${strokeW}"/><circle cx="14" cy="14" r="5" fill="${style.strokeColor}"/></svg>`;
      return new Icon({
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        anchor: [0.5, 0.5],
        scale: Math.max(0.3, radius / 10),
      });
    }
    default:
      return new CircleStyle({ radius, fill, stroke });
  }
}

function selectionStyle() {
  return (feature: FeatureLike) => {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'Point' || geomType === 'MultiPoint') {
      return new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: 'rgba(192, 38, 211, 0.28)' }),
          stroke: new Stroke({ color: '#c026d3', width: 2.5 }),
        }),
      });
    }
    return new Style({
      stroke: new Stroke({ color: '#c026d3', width: 2.5 }),
      fill: new Fill({ color: 'rgba(192, 38, 211, 0.18)' }),
    });
  };
}

export interface AddLayerOptions {
  name: string;
  geojson: unknown;
  crs?: string;
  kind: LayerSourceKind;
  style?: Partial<LayerStyle>;
  url?: string;
  sourceLabel?: string;
  makeActive?: boolean;
}

export function addGeoJSONLayer(opts: AddLayerOptions): string {
  const state = useAppStore.getState();
  const id = uid('layer');
  const record: LayerRecord = {
    id,
    name: opts.name,
    kind: opts.kind,
    visible: true,
    opacity: 1,
    crs: opts.crs ?? 'EPSG:4326',
    fields: [],
    featureCount: 0,
    geometryTypes: [],
    style: { ...nextLayerStyle(state.layers.length), ...opts.style },
    url: opts.url,
    sourceLabel: opts.sourceLabel,
  };

  const source = new VectorSource<Feature<Geometry>>();
  const layer = new VectorLayer({
    source,
    style: makeStyleFunction(record.style),
    declutter: declutterFor(record.style),
    zIndex: 10 + state.layers.length,
  });

  state.addLayer(record);
  registerVectorLayer(id, layer);
  setLayerFeatures(id, opts.geojson, record.crs);
  if (opts.makeActive !== false) useAppStore.getState().setActiveLayer(id);
  return id;
}

export function setLayerFeatures(layerId: string, geojson: unknown, dataProjection: string): void {
  const source = getLayerSource(layerId);
  if (!source) return;
  const format = new GeoJSON();
  const features = format.readFeatures(geojson as object, {
    dataProjection: dataProjection || 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  features.forEach((f, i) => {
    if (f.getId() == null) f.setId(`${layerId}-${i}`);
  });
  source.clear(true);
  source.addFeatures(features);
}

export function featuresToGeoJSON(features: Feature<Geometry>[]): GeoJsonRoot {
  if (features.length === 0) return { type: 'FeatureCollection', features: [] };
  const format = new GeoJSON();
  return JSON.parse(
    format.writeFeatures(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
      decimals: 7,
    }),
  ) as GeoJsonRoot;
}

export function getLayerGeoJSON(layerId: string): GeoJsonRoot {
  const source = getLayerSource(layerId);
  if (!source) return { type: 'FeatureCollection', features: [] };
  return featuresToGeoJSON(source.getFeatures());
}

export function getSelection(): Feature<Geometry>[] {
  return selectionSource?.getFeatures() ?? [];
}

export function setSelection(features: Feature<Geometry>[]): void {
  if (!selectionSource) return;
  selectionSource.clear(true);
  selectionSource.addFeatures(features);
}

export function clearSelection(): void {
  selectionSource?.clear(true);
}

export function zoomToFeatures(features: Feature<Geometry>[], maxZoom = 16): void {
  if (!map || features.length === 0) return;
  let extent: [number, number, number, number] | undefined;
  for (const f of features) {
    const e = f.getGeometry()?.getExtent();
    if (!e) continue;
    extent = extent
      ? [Math.min(extent[0], e[0]), Math.min(extent[1], e[1]), Math.max(extent[2], e[2]), Math.max(extent[3], e[3])]
      : [e[0], e[1], e[2], e[3]];
  }
  if (!extent) return;
  map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom, duration: 450 });
}

/** Ajusta a visão do mapa para a extensão conjunta de várias camadas. */
export function zoomToLayers(ids: string[], maxZoom = 16): boolean {
  const features = ids.flatMap((id) => vectorRegistry.get(id)?.getSource()?.getFeatures() ?? []);
  if (features.length === 0) return false;
  zoomToFeatures(features, maxZoom);
  return true;
}

/** Ajusta a visão do mapa para o conteúdo de uma camada recém-carregada. */
export function zoomToLayer(id: string, maxZoom = 16): boolean {
  return zoomToLayers([id], maxZoom);
}

export function whenRendered(): Promise<void> {
  return new Promise((resolve) => {
    if (!map) return resolve();
    map.once('rendercomplete', () => resolve());
  });
}

export function removeLayerEverywhere(id: string): void {
  unregisterVectorLayer(id);
  useAppStore.getState().removeLayer(id);
  if (getSelection().some((f) => String(f.getId() ?? '').startsWith(id))) clearSelection();
}

export function refreshAllZIndexes(): void {
  syncStoreOrder();
}

export function getBasemapLayer(): BaseLayer | null {
  return basemapLayer;
}
