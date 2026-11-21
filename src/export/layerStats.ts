import { area as turfArea, length as turfLength, polygonToLine } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';
import { getLayerSource } from '../map/mapContext';

export interface LayerStats {
  count: number;
  types: Record<string, number>;
  fields: { name: string; nonNull: number }[];
  totalAreaM2?: number;
  totalPerimeterM?: number;
  extentWGS84?: [number, number, number, number];
}

const MAX_FIELDS = 40;

export function computeLayerStats(layerId: string): LayerStats {
  const stats: LayerStats = { count: 0, types: {}, fields: [] };
  const source = getLayerSource(layerId);
  if (!source) return stats;

  const features = source.getFeatures();
  stats.count = features.length;

  const format = new GeoJSON();
  const fieldIndex = new Map<string, number>();
  let extent: [number, number, number, number] | null = null;
  let totalAreaM2 = 0;
  let totalPerimeterM = 0;
  let hasPolygons = false;

  for (const feature of features) {
    const geometry = feature.getGeometry();
    if (geometry) {
      const type = geometry.getType();
      stats.types[type] = (stats.types[type] ?? 0) + 1;
      const bounds = geometry.getExtent();
      extent = extent
        ? [
            Math.min(extent[0], bounds[0]),
            Math.min(extent[1], bounds[1]),
            Math.max(extent[2], bounds[2]),
            Math.max(extent[3], bounds[3]),
          ]
        : [bounds[0], bounds[1], bounds[2], bounds[3]];

      if (type === 'Polygon' || type === 'MultiPolygon') {
        hasPolygons = true;
        const geojsonFeature = format.writeFeatureObject(feature, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        });
        totalAreaM2 += turfArea(geojsonFeature);
        const boundary = polygonToLine(geojsonFeature as Feature<Polygon>);
        totalPerimeterM += turfLength(boundary, { units: 'kilometers' }) * 1000;
      }
    }

    const properties = feature.getProperties();
    for (const key of Object.keys(properties)) {
      if (key === 'geometry') continue;
      let position = fieldIndex.get(key);
      if (position === undefined) {
        if (fieldIndex.size >= MAX_FIELDS) continue;
        position = fieldIndex.size;
        fieldIndex.set(key, position);
        stats.fields[position] = { name: key, nonNull: 0 };
      }
      const value = properties[key];
      if (value !== null && value !== undefined) stats.fields[position].nonNull += 1;
    }
  }

  if (hasPolygons) {
    stats.totalAreaM2 = totalAreaM2;
    stats.totalPerimeterM = totalPerimeterM;
  }
  if (extent) {
    const wgs = transformExtent(extent, 'EPSG:3857', 'EPSG:4326', 7);
    stats.extentWGS84 = [wgs[0], wgs[1], wgs[2], wgs[3]];
  }
  return stats;
}
