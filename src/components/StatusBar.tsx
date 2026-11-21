import { useEffect, useState } from 'react';
import { transform } from 'ol/proj.js';
import type OlMap from 'ol/Map.js';
import { getMap, getSelection, whenMapReady } from '../map/mapContext';
import { useAppStore } from '../store';

export default function StatusBar() {
  const status = useAppStore((s) => s.status);
  const layers = useAppStore((s) => s.layers);
  const [coord, setCoord] = useState<string>('—');
  const [zoom, setZoom] = useState<string>('—');
  const [selCount, setSelCount] = useState(0);

  useEffect(() => {
    let m: OlMap | null = null;
    let handler: ((evt: { coordinate?: [number, number] }) => void) | null = null;

    whenMapReady().then((map) => {
      m = map;
      handler = (evt) => {
        if (!evt.coordinate || !m) return;
        const [lon, lat] = transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');
        setCoord(`${lon.toFixed(4)}°, ${lat.toFixed(4)}°`);
        setZoom(String(m.getView().getZoom()?.toFixed(1) ?? '—'));
        setSelCount(getSelection().length);
      };
      m.on('pointermove', handler as never);
      m.getView().on('change:resolution', () => {
        if (m) setZoom(String(m.getView().getZoom()?.toFixed(1) ?? '—'));
      });
    });

    return () => {
      if (m && handler) m.un('pointermove', handler as never);
      void getMap();
    };
  }, []);

  const totalFeatures = layers.reduce((acc, l) => acc + l.featureCount, 0);

  return (
    <footer className="status-bar">
      <span>
        <span className="status-dot" />
        {status}
      </span>
      <span>{layers.length} camadas</span>
      <span>{totalFeatures} feições</span>
      {selCount > 0 && <span style={{ color: 'var(--pink)' }}>{selCount} selecionadas</span>}
      <span className="status-spacer" />
      <span>EPSG:3857 · WGS 84 / Pseudo-Mercator</span>
      <span>Zoom {zoom}</span>
      <span style={{ minWidth: 150, textAlign: 'right' }}>{coord}</span>
    </footer>
  );
}
