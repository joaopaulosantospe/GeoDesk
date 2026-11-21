import { addGeoJSONLayer, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import { deriveFeatureMeta, detectGeoJSONCrs, errorMessage } from './geojsonLoader';

export type SampleId = 'brasil-estados' | 'paises-mundo' | 'pontos-monitoramento';

export interface SampleOption {
  id: SampleId;
  label: string;
}

export const samples: SampleOption[] = [
  { id: 'brasil-estados', label: 'Brasil — Estados' },
  { id: 'paises-mundo', label: 'Países (mundo)' },
  { id: 'pontos-monitoramento', label: 'Pontos de monitoramento (sintéticos)' },
];

interface ViteImportMeta extends ImportMeta {
  env: { BASE_URL: string };
}

export async function loadSample(id: SampleId): Promise<void> {
  const label = samples.find((sample) => sample.id === id)?.label ?? id;
  try {
    useAppStore.getState().setStatus(`Carregando amostra "${label}"…`);
    const response = await fetch(sampleUrl(id));
    if (!response.ok) {
      throw new Error(`o servidor respondeu HTTP ${response.status}`);
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error('a resposta não é um GeoJSON válido');
    }
    const crs = detectGeoJSONCrs(parsed);
    const layerId = addGeoJSONLayer({ name: label, geojson: parsed, crs, kind: 'sample', sourceLabel: 'Amostra' });
    const meta = deriveFeatureMeta(parsed);
    useAppStore
      .getState()
      .updateLayer(layerId, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
    zoomToLayer(layerId);
    useAppStore.getState().setStatus(`Amostra "${label}" carregada (${meta.featureCount} feições)`);
  } catch (error) {
    const message = `Falha ao carregar a amostra "${label}": ${errorMessage(error)}`;
    useAppStore.getState().setStatus(message);
    throw new Error(message);
  }
}

function sampleUrl(id: SampleId): string {
  const baseUrl = (import.meta as ViteImportMeta).env.BASE_URL;
  return `${baseUrl}samples/${id}.geojson`;
}
