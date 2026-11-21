import { useSyncExternalStore } from 'react';
import Draw from 'ol/interaction/Draw.js';
import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import type Map from 'ol/Map.js';
import type { EventsKey } from 'ol/events.js';
import type Feature from 'ol/Feature.js';
import type LineString from 'ol/geom/LineString.js';
import type Polygon from 'ol/geom/Polygon.js';
import type { Geometry } from 'ol/geom.js';
import type { Coordinate } from 'ol/coordinate.js';
import type {
  Feature as GeoJsonFeature,
  LineString as GeoJsonLineString,
  Polygon as GeoJsonPolygon,
} from 'geojson';
import * as turf from '@turf/turf';

const kmFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const mFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const sqmFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const areFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters >= 1000) return `${kmFormatter.format(meters / 1000)} km`;
  return `${mFormatter.format(meters)} m`;
}

export function formatArea(squareMeters: number): string {
  if (!Number.isFinite(squareMeters)) return '—';
  if (squareMeters >= 1_000_000) return `${areFormatter.format(squareMeters / 1_000_000)} km²`;
  if (squareMeters >= 10_000) return `${areFormatter.format(squareMeters / 10_000)} ha`;
  return `${sqmFormatter.format(squareMeters)} m²`;
}

type MeasureSource = VectorSource<Feature<Geometry>>;

let mapRef: Map | null = null;
let source: MeasureSource | null = null;
let layer: VectorLayer<MeasureSource> | null = null;
let overlay: Overlay | null = null;
let labelEl: HTMLElement | null = null;
let interaction: Draw | null = null;
let changeKey: EventsKey | null = null;
let currentMeasurement: string | null = null;
const listeners = new Set<() => void>();

export function getMeasurement(): string | null {
  return currentMeasurement;
}

export function subscribeMeasurement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMeasurement(): string | null {
  return useSyncExternalStore(subscribeMeasurement, getMeasurement, getMeasurement);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function sketchStyle(): Style {
  return new Style({
    stroke: new Stroke({ color: '#fbbf24', width: 2.5 }),
    fill: new Fill({ color: 'rgba(251, 191, 36, 0.18)' }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: '#fbbf24' }),
      stroke: new Stroke({ color: '#0a0c10', width: 1.5 }),
    }),
  });
}

function layerStyle(): Style {
  return new Style({
    stroke: new Stroke({ color: '#fbbf24', width: 2.5 }),
    fill: new Fill({ color: 'rgba(251, 191, 36, 0.14)' }),
    image: new CircleStyle({
      radius: 4.5,
      fill: new Fill({ color: '#fbbf24' }),
      stroke: new Stroke({ color: '#0a0c10', width: 1.5 }),
    }),
  });
}

function ensure(map: Map): void {
  mapRef = map;
  if (!source) {
    source = new VectorSource<Feature<Geometry>>();
    layer = new VectorLayer<MeasureSource>({
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
  source?.clear(true);
  if (mapRef && layer) mapRef.removeLayer(layer);
  layer = null;
  source = null;
  mapRef = null;
}

function toWgs84(feature: Feature<Geometry>): GeoJsonFeature | null {
  const object = new GeoJSON().writeFeatureObject(feature, {
    featureProjection: 'EPSG:3857',
    dataProjection: 'EPSG:4326',
  });
  return object.geometry ? object : null;
}

function lastCoordinate(geometry: Geometry): Coordinate | undefined {
  const type = geometry.getType();
  if (type === 'LineString') {
    const coords = (geometry as LineString).getCoordinates();
    return coords.length > 0 ? coords[coords.length - 1] : undefined;
  }
  if (type === 'Polygon') {
    const rings = (geometry as Polygon).getCoordinates();
    const ring = rings[0];
    return ring && ring.length > 0 ? ring[ring.length - 1] : undefined;
  }
  return undefined;
}

function paint(text: string, coordinate: Coordinate | undefined, commit: boolean): void {
  if (labelEl) labelEl.textContent = text;
  overlay?.setPosition(coordinate);
  if (commit) {
    currentMeasurement = text;
    notify();
  }
}

function lineText(feature: Feature<Geometry>): string | null {
  const object = toWgs84(feature) as GeoJsonFeature<GeoJsonLineString> | null;
  if (!object) return null;
  const coords = object.geometry.coordinates;
  if (coords.length < 2) return null;
  const meters = turf.length(turf.lineString(coords), { units: 'kilometers' }) * 1000;
  return formatDistance(meters);
}

function areaText(feature: Feature<Geometry>): string | null {
  const object = toWgs84(feature) as GeoJsonFeature<GeoJsonPolygon> | null;
  if (!object) return null;
  const ring = object.geometry.coordinates[0];
  if (!ring || ring.length < 4) return null;
  const squareMeters = turf.area(object);
  const perimeter = turf.length(turf.lineString(ring), { units: 'meters' });
  return `Área: ${formatArea(squareMeters)} · Perímetro: ${formatDistance(perimeter)}`;
}

function watch(draw: Draw, compute: (feature: Feature<Geometry>) => string | null): void {
  draw.on('drawstart', (evt) => {
    source?.clear(true);
    if (changeKey) unByKey(changeKey);
    const feature = evt.feature;
    changeKey = feature.on('change', () => {
      const geometry = feature.getGeometry();
      if (!geometry) return;
      const text = compute(feature);
      if (text == null) return;
      paint(text, lastCoordinate(geometry), false);
    });
    if (labelEl) labelEl.textContent = '';
    overlay?.setPosition(undefined);
  });
  draw.on('drawend', (evt) => {
    if (changeKey) {
      unByKey(changeKey);
      changeKey = null;
    }
    const geometry = evt.feature.getGeometry();
    const text = compute(evt.feature);
    if (text == null) return;
    paint(text, geometry ? lastCoordinate(geometry) : undefined, true);
  });
}

export function activateDistance(map: Map): void {
  deactivate();
  ensure(map);
  const vp = map.getViewport();
  if (vp) vp.style.cursor = 'crosshair';
  const draw = new Draw({ type: 'LineString', source: source!, style: sketchStyle() });
  interaction = draw;
  watch(draw, lineText);
  map.addInteraction(draw);
}

export function activateArea(map: Map): void {
  deactivate();
  ensure(map);
  const vp = map.getViewport();
  if (vp) vp.style.cursor = 'crosshair';
  const draw = new Draw({ type: 'Polygon', source: source!, style: sketchStyle() });
  interaction = draw;
  watch(draw, areaText);
  map.addInteraction(draw);
}
