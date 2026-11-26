/**
 * Seleção de região por polígono.
 *
 * Ferramenta que permite desenhar um polígono livre no mapa para delimitar
 * qualquer região e, em seguida:
 *  - conta quantos pontos das camadas de pontos visíveis estão dentro;
 *  - destaca esses pontos na seleção magenta do mapa;
 *  - expõe o resultado (área, contagem por camada e feições) para o painel
 *    flutuante exportar em Excel (.xlsx) e KML.
 *
 * O polígono e o resultado permanecem no mapa ao trocar de ferramenta;
 * `clearRegion()` remove tudo.
 */
import { useSyncExternalStore } from 'react';
import Draw from 'ol/interaction/Draw.js';
import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { transform } from 'ol/proj.js';
import type Map from 'ol/Map.js';
import type { EventsKey } from 'ol/events.js';
import type Feature from 'ol/Feature.js';
import type Point from 'ol/geom/Point.js';
import type MultiPoint from 'ol/geom/MultiPoint.js';
import type { Geometry } from 'ol/geom.js';
import type { Feature as GeoJsonFeature, Polygon as GeoJsonPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { clearSelection, getLayerSource, setSelection } from '../map/mapContext';
import { useAppStore } from '../store';
import { layerGeometryKind } from './spatialJoin';
import { formatArea } from './measure';

/** Contagem de pontos de uma camada dentro do polígono. */
export interface RegionLayerCount {
  layerId: string;
  layerName: string;
  count: number;
}

/** Um ponto dentro do polígono, com a camada de origem. */
export interface RegionItem {
  feature: Feature<Geometry>;
  layerId: string;
  layerName: string;
}

/** Resultado da seleção de região. */
export interface RegionResult {
  /** Área do polígono em m². */
  areaSqM: number;
  /** Total de pontos dentro do polígono. */
  total: number;
  /** Camadas de pontos visíveis avaliadas (mesmo as com 0 pontos). */
  layers: RegionLayerCount[];
  /** Pontos dentro do polígono, com a camada de origem. */
  items: RegionItem[];
  /** Camadas de pontos ocultas (não consideradas na contagem). */
  hiddenPointLayers: number;
  /** Polígono desenhado em EPSG:4326. */
  polygon: GeoJsonFeature<GeoJsonPolygon>;
}

type RegionSource = VectorSource<Feature<Geometry>>;

let mapRef: Map | null = null;
let source: RegionSource | null = null;
let layer: VectorLayer<RegionSource> | null = null;
let overlay: Overlay | null = null;
let labelEl: HTMLElement | null = null;
let interaction: Draw | null = null;
let changeKey: EventsKey | null = null;
let currentResult: RegionResult | null = null;
const listeners = new Set<() => void>();

export function getRegionResult(): RegionResult | null {
  return currentResult;
}

export function subscribeRegionResult(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRegionResult(): RegionResult | null {
  return useSyncExternalStore(subscribeRegionResult, getRegionResult, getRegionResult);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function sketchStyle(): Style {
  return new Style({
    stroke: new Stroke({ color: '#c026d3', width: 3 }),
    fill: new Fill({ color: 'rgba(192, 38, 211, 0.15)' }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: '#c026d3' }),
      stroke: new Stroke({ color: '#0a0c10', width: 1.5 }),
    }),
  });
}

function layerStyle(): Style {
  return new Style({
    stroke: new Stroke({ color: '#c026d3', width: 3 }),
    fill: new Fill({ color: 'rgba(192, 38, 211, 0.12)' }),
    image: new CircleStyle({
      radius: 4.5,
      fill: new Fill({ color: '#c026d3' }),
      stroke: new Stroke({ color: '#0a0c10', width: 1.5 }),
    }),
  });
}

function ensure(map: Map): void {
  mapRef = map;
  if (!source) {
    source = new VectorSource<Feature<Geometry>>();
    layer = new VectorLayer<RegionSource>({
      source,
      style: layerStyle(),
      zIndex: 900,
      declutter: false,
    });
    map.addLayer(layer);
  }
  if (!overlay) {
    labelEl = document.createElement('div');
    labelEl.className = 'overlay-label';
    overlay = new Overlay({
      element: labelEl,
      positioning: 'bottom-center',
      offset: [0, -12],
      stopEvent: false,
    });
    map.addOverlay(overlay);
  }
}

/**
 * Desativa a ferramenta (remove a interação de desenho), mantendo o polígono
 * já desenhado e o resultado no mapa — a seleção persiste até `clearRegion()`.
 */
export function deactivate(): void {
  if (mapRef) {
    const vp = mapRef.getViewport();
    if (vp) vp.style.cursor = '';
  }
  if (changeKey) {
    unByKey(changeKey);
    changeKey = null;
  }
  if (mapRef && interaction) mapRef.removeInteraction(interaction);
  interaction = null;
  if (mapRef && overlay) mapRef.removeOverlay(overlay);
  overlay = null;
  labelEl = null;
}

/** Remove o polígono, o resultado e o destaque dos pontos selecionados. */
export function clearRegion(silent = false): void {
  source?.clear(true);
  if (labelEl) labelEl.textContent = '';
  overlay?.setPosition(undefined);
  if (currentResult) {
    currentResult = null;
    notify();
  }
  clearSelection();
  if (!silent) useAppStore.getState().setStatus('Seleção por região removida');
}

function toWgs84(feature: Feature<Geometry>): GeoJsonFeature<GeoJsonPolygon> | null {
  const object = new GeoJSON().writeFeatureObject(feature, {
    featureProjection: 'EPSG:3857',
    dataProjection: 'EPSG:4326',
  }) as GeoJsonFeature<GeoJsonPolygon>;
  return object.geometry ? object : null;
}

function areaText(feature: Feature<Geometry>): string | null {
  const object = toWgs84(feature);
  if (!object) return null;
  const ring = object.geometry.coordinates[0];
  if (!ring || ring.length < 4) return null;
  return `Área: ${formatArea(turf.area(object))}`;
}

/**
 * Varre as camadas de pontos visíveis e devolve quem está dentro do polígono.
 * Pré-filtro por bounding box acelera muito camadas grandes.
 */
function computeRegion(polygonFeature: Feature<Geometry>): RegionResult | null {
  const polygon = toWgs84(polygonFeature);
  if (!polygon) return null;

  const ring = polygon.geometry.coordinates[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const contains = (coord: number[]): boolean => {
    const [lon, lat] = transform(coord, 'EPSG:3857', 'EPSG:4326');
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
    return turf.booleanPointInPolygon(turf.point([lon, lat]), polygon);
  };

  const items: RegionItem[] = [];
  const layerCounts: RegionLayerCount[] = [];
  let hiddenPointLayers = 0;

  for (const record of useAppStore.getState().layers) {
    const isPointLayer = layerGeometryKind(record.id) === 'points';
    if (!record.visible) {
      if (isPointLayer) hiddenPointLayers += 1;
      continue;
    }
    const layerSource = getLayerSource(record.id);
    if (!layerSource) continue;

    let count = 0;
    for (const feature of layerSource.getFeatures()) {
      const geometry = feature.getGeometry();
      if (!geometry) continue;
      const type = geometry.getType();
      let inside = false;
      if (type === 'Point') {
        inside = contains((geometry as Point).getCoordinates());
      } else if (type === 'MultiPoint') {
        inside = (geometry as MultiPoint).getCoordinates().some(contains);
      } else {
        continue;
      }
      if (inside) {
        count += 1;
        items.push({ feature, layerId: record.id, layerName: record.name });
      }
    }

    if (count > 0 || isPointLayer) {
      layerCounts.push({ layerId: record.id, layerName: record.name, count });
    }
  }

  return {
    areaSqM: turf.area(polygon),
    total: items.length,
    layers: layerCounts,
    items,
    hiddenPointLayers,
    polygon,
  };
}

function watch(draw: Draw): void {
  draw.on('drawstart', () => {
    source?.clear(true);
    if (changeKey) unByKey(changeKey);
    changeKey = null;
    if (currentResult) {
      currentResult = null;
      notify();
    }
    clearSelection();
    if (labelEl) labelEl.textContent = '';
    overlay?.setPosition(undefined);
  });

  draw.on('drawend', (evt) => {
    if (changeKey) {
      unByKey(changeKey);
      changeKey = null;
    }
    const result = computeRegion(evt.feature);
    overlay?.setPosition(undefined);
    if (!result) return;

    currentResult = result;
    notify();
    setSelection(result.items.map((item) => item.feature));

    const setStatus = useAppStore.getState().setStatus;
    if (result.layers.length === 0) {
      setStatus('Região delimitada, mas nenhuma camada de pontos visível foi encontrada.');
    } else if (result.total === 0) {
      setStatus(
        `Região delimitada: nenhum ponto dentro do polígono (${formatArea(result.areaSqM)}).`,
      );
    } else {
      setStatus(
        `Região delimitada: ${result.total} ponto(s) dentro do polígono (${formatArea(result.areaSqM)}).`,
      );
    }
  });
}

export function activateRegionSelect(map: Map): void {
  deactivate();
  ensure(map);
  const vp = map.getViewport();
  if (vp) vp.style.cursor = 'crosshair';
  const draw = new Draw({ type: 'Polygon', source: source!, style: sketchStyle() });
  interaction = draw;
  watch(draw);
  map.addInteraction(draw);
}
