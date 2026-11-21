import JSZip from 'jszip';
import type Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import type LineString from 'ol/geom/LineString.js';
import type MultiLineString from 'ol/geom/MultiLineString.js';
import type MultiPoint from 'ol/geom/MultiPoint.js';
import type MultiPolygon from 'ol/geom/MultiPolygon.js';
import type Point from 'ol/geom/Point.js';
import type Polygon from 'ol/geom/Polygon.js';
import { getLayerSource } from '../map/mapContext';
import { useAppStore } from '../store';
import type { LayerRecord } from '../types';
import { downloadBlob, downloadText } from './download';

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return base || 'camada';
}

function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converte cor hex (#RRGGBB) e opacidade (0..1) para o formato KML AABBGGRR.
 */
function hexToKmlColor(hex: string, alpha: number = 1): string {
  const clean = hex.replace('#', '').trim();
  let r = 'ff';
  let g = 'ff';
  let b = 'ff';
  if (clean.length === 6) {
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
  } else if (clean.length === 3) {
    r = clean[0] + clean[0];
    g = clean[1] + clean[1];
    b = clean[2] + clean[2];
  }
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  // KML usa AABBGGRR
  return `${a}${b}${g}${r}`.toLowerCase();
}

function findFeatureName(
  props: Record<string, unknown>,
  index: number,
  labelField?: string,
): string {
  if (labelField && props[labelField] !== null && props[labelField] !== undefined && String(props[labelField]).trim() !== '') {
    return String(props[labelField]).trim();
  }
  const candidates = [
    'placa',
    'nu_instala',
    'pagename',
    'shapename',
    'name',
    'nome',
    'id',
    'objectid',
    'fid_1',
    'fid',
  ];
  for (const c of candidates) {
    for (const [k, v] of Object.entries(props)) {
      if (k.toLowerCase() === c && v !== null && v !== undefined && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
  }
  return `Feição ${index + 1}`;
}

function buildHtmlDescription(props: Record<string, unknown>): string {
  const rows: string[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (key === 'geometry' || val === null || val === undefined || val === '') continue;
    rows.push(
      `<tr><td style="font-weight:600;padding:3px 6px;border:1px solid #ddd;background:#f8f9fa;">${escapeXml(key)}</td><td style="padding:3px 6px;border:1px solid #ddd;">${escapeXml(val)}</td></tr>`,
    );
  }
  if (rows.length === 0) return '';
  return `<![CDATA[
    <div style="font-family:sans-serif;font-size:12px;max-height:350px;overflow-y:auto;">
      <table style="border-collapse:collapse;width:100%;border:1px solid #ccc;">
        <thead>
          <tr style="background:#e9ecef;text-align:left;">
            <th style="padding:4px 6px;border:1px solid #ddd;">Campo</th>
            <th style="padding:4px 6px;border:1px solid #ddd;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    </div>
  ]]>`;
}

function buildExtendedData(props: Record<string, unknown>): string {
  const items: string[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (key === 'geometry' || val === null || val === undefined) continue;
    items.push(`      <Data name="${escapeXml(key)}"><value>${escapeXml(val)}</value></Data>`);
  }
  if (items.length === 0) return '';
  return `    <ExtendedData>\n${items.join('\n')}\n    </ExtendedData>`;
}

function formatCoordinates(coords: [number, number][]): string {
  return coords.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},0`).join(' ');
}

function geometryToKml(geom: Geometry): string {
  // Converte de EPSG:3857 (mapa) para EPSG:4326 (WGS84)
  const g = geom.clone();
  g.transform('EPSG:3857', 'EPSG:4326');
  const type = g.getType();

  switch (type) {
    case 'Point': {
      const coord = (g as Point).getCoordinates();
      return `<Point><coordinates>${coord[0].toFixed(7)},${coord[1].toFixed(7)},0</coordinates></Point>`;
    }
    case 'MultiPoint': {
      const coords = (g as MultiPoint).getCoordinates();
      const points = coords.map(
        (c) => `<Point><coordinates>${c[0].toFixed(7)},${c[1].toFixed(7)},0</coordinates></Point>`,
      );
      return `<MultiGeometry>${points.join('')}</MultiGeometry>`;
    }
    case 'LineString': {
      const coords = (g as LineString).getCoordinates() as [number, number][];
      return `<LineString><tessellate>1</tessellate><coordinates>${formatCoordinates(coords)}</coordinates></LineString>`;
    }
    case 'MultiLineString': {
      const lineList = (g as MultiLineString).getCoordinates() as [number, number][][];
      const lines = lineList.map(
        (coords) => `<LineString><tessellate>1</tessellate><coordinates>${formatCoordinates(coords)}</coordinates></LineString>`,
      );
      return `<MultiGeometry>${lines.join('')}</MultiGeometry>`;
    }
    case 'Polygon': {
      const rings = (g as Polygon).getCoordinates() as [number, number][][];
      if (rings.length === 0) return '';
      const outer = `<outerBoundaryIs><LinearRing><coordinates>${formatCoordinates(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
      const inners = rings
        .slice(1)
        .map((r) => `<innerBoundaryIs><LinearRing><coordinates>${formatCoordinates(r)}</coordinates></LinearRing></innerBoundaryIs>`)
        .join('');
      return `<Polygon><tessellate>1</tessellate>${outer}${inners}</Polygon>`;
    }
    case 'MultiPolygon': {
      const polyList = (g as MultiPolygon).getCoordinates() as [number, number][][][];
      const polys = polyList.map((rings) => {
        if (rings.length === 0) return '';
        const outer = `<outerBoundaryIs><LinearRing><coordinates>${formatCoordinates(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
        const inners = rings
          .slice(1)
          .map((r) => `<innerBoundaryIs><LinearRing><coordinates>${formatCoordinates(r)}</coordinates></LinearRing></innerBoundaryIs>`)
          .join('');
        return `<Polygon><tessellate>1</tessellate>${outer}${inners}</Polygon>`;
      });
      return `<MultiGeometry>${polys.join('')}</MultiGeometry>`;
    }
    default:
      return '';
  }
}

function getIconForLayer(layer: LayerRecord): string {
  const shape = layer.style.pointShape;
  switch (shape) {
    case 'square':
      return 'http://maps.google.com/mapfiles/kml/shapes/placemark_square.png';
    case 'diamond':
      return 'http://maps.google.com/mapfiles/kml/shapes/diamond.png';
    case 'triangle':
    case 'triangle-down':
      return 'http://maps.google.com/mapfiles/kml/shapes/triangle.png';
    case 'star':
      return 'http://maps.google.com/mapfiles/kml/shapes/star.png';
    case 'pin':
    case 'pin-outline':
    case 'pin-dot':
    case 'pin-solid':
      return 'http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png';
    case 'bullseye':
      return 'http://maps.google.com/mapfiles/kml/shapes/target.png';
    case 'cross':
    case 'x':
      return 'http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png';
    case 'hexagon':
    case 'pentagon':
    case 'circle':
    default:
      return 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png';
  }
}

function buildLayerStyle(layer: LayerRecord): string {
  const styleId = `style_${layer.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const strokeColor = hexToKmlColor(layer.style.strokeColor || '#3388ff', 1);

  // Se for polígono ou delimitação, preenchimento suave e semitransparente (35%)
  const isPolygon = /municipio|delimitacao|bairro|area|zone|grid|poligono/i.test(layer.name);
  const fillAlpha = isPolygon ? Math.min(layer.opacity ?? 0.35, 0.45) : (layer.opacity ?? 0.6);
  const fillColor = hexToKmlColor(layer.style.fillColor || '#3388ff', fillAlpha);
  const width = layer.style.strokeWidth || 2;
  const iconHref = getIconForLayer(layer);

  const hasLabels = layer.style.labels?.enabled && !!layer.style.labels?.field;
  const labelScale = hasLabels ? '0.85' : '0';
  const labelColor =
    hasLabels && layer.style.labels?.color
      ? hexToKmlColor(layer.style.labels.color, 1)
      : 'ffffffff';

  return `
    <Style id="${styleId}">
      <LineStyle>
        <color>${strokeColor}</color>
        <width>${width}</width>
      </LineStyle>
      <PolyStyle>
        <color>${fillColor}</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
      <IconStyle>
        <color>${strokeColor}</color>
        <scale>0.75</scale>
        <Icon>
          <href>${iconHref}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>${labelColor}</color>
        <scale>${labelScale}</scale>
      </LabelStyle>
      <BalloonStyle>
        <text><![CDATA[$[description]]]></text>
      </BalloonStyle>
    </Style>`;
}

function buildPlacemarks(
  features: Feature<Geometry>[],
  styleId: string,
  layer?: LayerRecord,
): string[] {
  const placemarks: string[] = [];
  const labelField = layer?.style.labels?.enabled ? layer.style.labels.field : undefined;

  features.forEach((feature, index) => {
    const geom = feature.getGeometry();
    if (!geom) return;
    const geomKml = geometryToKml(geom);
    if (!geomKml) return;

    const props = feature.getProperties();
    const name = findFeatureName(props, index, labelField);
    const desc = buildHtmlDescription(props);
    const ext = buildExtendedData(props);

    placemarks.push(`
    <Placemark>
      <name>${escapeXml(name)}</name>
      <styleUrl>#${styleId}</styleUrl>
      <description>${desc}</description>
${ext}
      ${geomKml}
    </Placemark>`);
  });

  return placemarks;
}

/**
 * Gera o documento KML completo para uma única camada.
 */
export function generateKmlForLayer(layer: LayerRecord): string {
  const source = getLayerSource(layer.id);
  if (!source) throw new Error(`Camada "${layer.name}" indisponível para exportação`);
  const features = source.getFeatures();

  const styleId = `style_${layer.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const styleDef = buildLayerStyle(layer);
  const placemarks = buildPlacemarks(features, styleId, layer);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(layer.name)}</name>
    <open>1</open>
${styleDef}
    <Folder>
      <name>${escapeXml(layer.name)}</name>
      <open>0</open>
${placemarks.join('')}
    </Folder>
  </Document>
</kml>`;
}

/**
 * Gera o documento KML consolidado com todas as camadas carregadas no mapa.
 * Organiza em pastas recolhidas com pontos no topo, linhas no meio e polígonos na base.
 */
/**
 * Gera o documento KML consolidado para uma lista específica de camadas.
 * Organiza em pastas recolhidas com pontos no topo, linhas no meio e polígonos na base.
 */
export function generateKmlForLayerList(layers: LayerRecord[], docName: string = 'Camadas'): string {
  if (layers.length === 0) throw new Error('Nenhuma camada selecionada para exportar');

  // Agrupa as camadas e define ordem: Pontos (1) -> Linhas (2) -> Polígonos (3)
  const entries: { layer: LayerRecord; features: Feature<Geometry>[]; order: number }[] = [];

  for (const layer of layers) {
    const source = getLayerSource(layer.id);
    if (!source) continue;
    const features = source.getFeatures();
    if (features.length === 0) continue;

    const firstType = features[0]?.getGeometry()?.getType() || '';
    let order = 2; // linha
    if (firstType.includes('Point')) {
      order = 1; // ponto
    } else if (firstType.includes('Polygon') || /municipio|delimitacao/i.test(layer.name)) {
      order = 3; // polígono
    }

    entries.push({ layer, features, order });
  }

  // Ordena para que os polígonos fiquem por último no KML (renderizados na base do mapa)
  entries.sort((a, b) => a.order - b.order);

  const styles: string[] = [];
  const folders: string[] = [];

  for (const { layer, features } of entries) {
    const styleId = `style_${layer.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    styles.push(buildLayerStyle(layer));
    const placemarks = buildPlacemarks(features, styleId, layer);

    // <open>0</open> mantém as pastas compactas e organizadas na árvore lateral
    folders.push(`
    <Folder>
      <name>${escapeXml(layer.name)}</name>
      <visibility>${layer.visible ? 1 : 0}</visibility>
      <open>0</open>
${placemarks.join('')}
    </Folder>`);
  }

  if (folders.length === 0) {
    throw new Error('Nenhuma das camadas selecionadas contém feições para exportar');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docName)}</name>
    <open>1</open>
${styles.join('\n')}
${folders.join('\n')}
  </Document>
</kml>`;
}

/**
 * Gera o documento KML consolidado com todas as camadas carregadas no mapa.
 */
export function generateKmlForAllLayers(): string {
  const state = useAppStore.getState();
  return generateKmlForLayerList(state.layers, 'Camadas');
}

/**
 * Exporta uma única camada para KML ou KMZ.
 */
export async function exportLayerKML(layerId: string, format: 'kmz' | 'kml' = 'kmz'): Promise<void> {
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  if (!layer) throw new Error('Camada não encontrada');

  const kmlString = generateKmlForLayer(layer);
  const baseFilename = slug(layer.name || 'camada');

  if (format === 'kmz') {
    const zip = new JSZip();
    zip.file('doc.kml', kmlString);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(`${baseFilename}.kmz`, blob);
  } else {
    downloadText(`${baseFilename}.kml`, kmlString, 'application/vnd.google-earth.kml+xml');
  }
}

/**
 * Exporta uma seleção arbitrária de camadas para KMZ ou KML.
 */
export async function exportSelectedLayersKML(
  layerIds: string[],
  format: 'kmz' | 'kml' = 'kmz',
  filename?: string,
): Promise<void> {
  if (layerIds.length === 0) throw new Error('Selecione pelo menos uma camada para exportar');
  if (layerIds.length === 1) {
    return exportLayerKML(layerIds[0], format);
  }

  const allLayers = useAppStore.getState().layers;
  const selected = allLayers.filter((l) => layerIds.includes(l.id));
  const kmlString = generateKmlForLayerList(selected, 'Camadas');
  const baseFilename = filename || (selected.length === allLayers.length ? 'geodesk_projeto_completo' : 'camadas_selecionadas');

  if (format === 'kmz') {
    const zip = new JSZip();
    zip.file('doc.kml', kmlString);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(`${baseFilename}.kmz`, blob);
  } else {
    downloadText(`${baseFilename}.kml`, kmlString, 'application/vnd.google-earth.kml+xml');
  }
}

/**
 * Exporta todas as camadas abertas para um único arquivo KMZ ou KML.
 */
export async function exportAllLayersKML(format: 'kmz' | 'kml' = 'kmz'): Promise<void> {
  const allLayers = useAppStore.getState().layers;
  return exportSelectedLayersKML(
    allLayers.map((l) => l.id),
    format,
    'geodesk_projeto_completo',
  );
}
