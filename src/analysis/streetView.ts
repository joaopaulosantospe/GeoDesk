import type Map from 'ol/Map.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Style, Icon } from 'ol/style.js';
import { transform } from 'ol/proj.js';
import type { EventsKey } from 'ol/events.js';
import { unByKey } from 'ol/Observable.js';
import { useAppStore } from '../store';

let mapRef: Map | null = null;
let clickKey: EventsKey | null = null;
let pegmanLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
let pegmanSource: VectorSource<Feature<Point>> | null = null;

const PEGMAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
  </filter>
  <g filter="url(#shadow)">
    <!-- Cabeça Pegman -->
    <circle cx="17" cy="8" r="6" fill="#f59e0b" stroke="#78350f" stroke-width="1.8"/>
    <!-- Corpo Pegman -->
    <path d="M11 15c-2 0-3.5 1.5-3.5 3.5v9h3.5v12h4v-12h2v12h4v-12h3.5v-9c0-2-1.5-3.5-3.5-3.5h-10z" fill="#f59e0b" stroke="#78350f" stroke-width="1.8" stroke-linejoin="round"/>
    <!-- Detalhe central -->
    <circle cx="17" cy="22" r="2" fill="#78350f"/>
  </g>
</svg>`;

function getPegmanLayer(map: Map): VectorLayer<VectorSource<Feature<Point>>> {
  if (!pegmanLayer) {
    pegmanSource = new VectorSource<Feature<Point>>();
    pegmanLayer = new VectorLayer({
      source: pegmanSource,
      zIndex: 9999,
      style: new Style({
        image: new Icon({
          src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PEGMAN_SVG),
          anchor: [0.5, 0.95],
          scale: 0.9,
        }),
      }),
    });
    map.addLayer(pegmanLayer);
  }
  return pegmanLayer;
}

export function activateStreetView(map: Map): void {
  deactivateStreetView();
  mapRef = map;

  const vp = map.getViewport();
  if (vp) vp.style.cursor = 'crosshair';

  getPegmanLayer(map);

  clickKey = map.on('singleclick', (evt) => {
    if (!evt.coordinate) return;
    const [lon, lat] = transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');

    // Atualiza marcador visual no mapa
    if (pegmanSource) {
      pegmanSource.clear();
      pegmanSource.addFeature(new Feature(new Point(evt.coordinate)));
    }

    useAppStore.getState().setStreetViewLocation({ lat, lon });
    useAppStore
      .getState()
      .setStatus(`Street View aberto em: ${lat.toFixed(5)}°, ${lon.toFixed(5)}° (clique em outra via para mover)`);
  });
}

export function deactivateStreetView(): void {
  if (clickKey) {
    unByKey(clickKey);
    clickKey = null;
  }
  if (mapRef) {
    const vp = mapRef.getViewport();
    if (vp) vp.style.cursor = '';
  }
  mapRef = null;
}

export function clearStreetViewMarker(): void {
  if (pegmanSource) {
    pegmanSource.clear();
  }
}
