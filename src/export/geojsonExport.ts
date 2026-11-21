import { getLayerGeoJSON } from '../map/mapContext';
import { useAppStore } from '../store';
import { downloadText } from './download';

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'camada';
}

export function exportLayerGeoJSON(layerId: string): void {
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  if (!layer) throw new Error('Camada não encontrada');
  const geojson = getLayerGeoJSON(layerId);
  downloadText(`${slug(layer.name)}.geojson`, JSON.stringify(geojson, null, 2), 'application/geo+json');
}
