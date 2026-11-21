import JSZip from 'jszip';
import { addGeoJSONLayer, zoomToLayers } from '../map/mapContext';
import { useAppStore } from '../store';
import { detectGeoJSONCrs, deriveFeatureMeta, errorMessage } from './geojsonLoader';
import { loadGeoPackageBytes } from './gpkgLoader';
import { loadShapefileFromSource } from './shpLoader';
import { diskPathOf, readRelatedFile, readRelatedText } from './diskFiles';
import { baseNameOf, extensionOf, parseOgrSource } from './qgisPaths';

/**
 * Leitor de projetos do QGIS (.qgs e .qgz).
 *
 * O QGIS não embute os dados no projeto: o arquivo guarda apenas referências
 * (shapefile, GeoJSON, GeoPackage…) com caminhos relativos ou absolutos.
 * Aqui lemos o XML do projeto, identificamos as camadas e buscamos cada arquivo
 * na pasta do projeto — para isso é usada a API de disco do Electron.
 */

interface ProjectLayer {
  name: string;
  provider: string;
  datasource: string;
  authid: string;
}

const PROVIDER_HINTS: Record<string, string> = {
  postgres: 'banco de dados PostgreSQL/PostGIS',
  wms: 'serviço de imagens remoto (WMS)',
  wfs: 'serviço de feições remoto (WFS)',
  wcs: 'serviço de cobertura remoto (WCS)',
  gdal: 'camada de imagem (raster)',
  delimitedtext: 'tabela CSV delimitada',
  memory: 'camada temporária do QGIS (não gravada no disco)',
  virtual: 'camada virtual do QGIS',
  mssql: 'banco de dados SQL Server',
  oracle: 'banco de dados Oracle',
  spatialite: 'banco SpatiaLite',
};

export function isQgisProjectFile(name: string): boolean {
  return /\.qg[sz]$/i.test(name);
}

/**
 * Abre um projeto do QGIS e carrega as camadas vetoriais referenciadas.
 * `projectPathOverride` informa o caminho do projeto no disco quando o arquivo
 * não veio do diálogo (ex.: duplo clique no Windows).
 */
export async function loadQgisProject(file: File, projectPathOverride?: string | null): Promise<string[]> {
  const xml = await readProjectXml(file);
  const layers = parseProjectLayers(xml);
  if (layers.length === 0) {
    throw new Error('o projeto não contém camadas de feição');
  }

  const projectPath = projectPathOverride ?? diskPathOf(file);
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const layer of layers) {
    try {
      ids.push(...(await loadProjectLayer(layer, projectPath)));
    } catch (error) {
      skipped.push(`${layer.name}: ${errorMessage(error)}`);
    }
  }

  if (ids.length === 0) {
    throw new Error(
      skipped.length > 0
        ? `nenhuma camada pôde ser carregada — ${skipped.join('; ')}`
        : 'nenhuma camada pôde ser carregada',
    );
  }

  zoomToLayers(ids);
  const suffix = skipped.length > 0 ? ` — ignoradas: ${skipped.join('; ')}` : '';
  useAppStore
    .getState()
    .setStatus(
      `Projeto QGIS "${file.name}" aberto: ${ids.length} ${ids.length === 1 ? 'camada carregada' : 'camadas carregadas'}${suffix}`,
    );
  return ids;
}

// ---------------------------------------------------------------------------
// XML do projeto
// ---------------------------------------------------------------------------

async function readProjectXml(file: File): Promise<string> {
  if (/\.qgz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.keys(zip.files).find((path) => /\.qgs$/i.test(path));
    if (!entry) throw new Error('o .qgz não contém um projeto .qgs');
    return await zip.files[entry].async('text');
  }
  return await file.text();
}

function parseProjectLayers(xml: string): ProjectLayer[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('o arquivo não é um projeto QGIS válido (XML inválido)');
  }
  return Array.from(doc.getElementsByTagName('maplayer'))
    .map((node) => ({
      name: childText(node, 'layername') || childText(node, 'shortname'),
      provider: childText(node, 'provider').toLowerCase(),
      datasource: childText(node, 'datasource'),
      authid: childText(node, 'authid'),
    }))
    .filter((layer) => layer.datasource.trim() !== '' || layer.provider !== '');
}

function childText(node: Element, tag: string): string {
  const element = node.getElementsByTagName(tag)[0];
  return element?.textContent?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Carregamento das camadas
// ---------------------------------------------------------------------------

async function loadProjectLayer(layer: ProjectLayer, projectPath: string | null): Promise<string[]> {
  if (layer.provider !== '' && layer.provider !== 'ogr') {
    throw new Error(`${PROVIDER_HINTS[layer.provider] ?? `provedor "${layer.provider}"`} não suportado`);
  }
  if (!projectPath) {
    throw new Error('sem acesso à pasta do projeto — abra o .qgs/.qgz pelo menu do aplicativo');
  }

  const source = parseOgrSource(layer.datasource);
  if (!source) throw new Error('fonte de dados não reconhecida');

  switch (extensionOf(source.path)) {
    case '.shp':
      return [await loadProjectShapefile(layer, projectPath, source.path)];
    case '.gpkg': {
      const file = await readRelatedFile(projectPath, source.path);
      if (!file) throw new Error(`arquivo não encontrado: ${source.path}`);
      return await loadGeoPackageBytes(file.data, baseNameOf(source.path), source.table, layer.name);
    }
    case '.geojson':
    case '.json':
      return [await loadProjectGeoJSON(layer, projectPath, source.path)];
    default:
      throw new Error(`formato "${extensionOf(source.path) || 'desconhecido'}" não suportado`);
  }
}

async function loadProjectShapefile(
  layer: ProjectLayer,
  projectPath: string,
  reference: string,
): Promise<string> {
  const shp = await readRelatedFile(projectPath, reference);
  if (!shp) throw new Error(`arquivo não encontrado: ${reference}`);
  const base = reference.replace(/\.shp$/i, '');
  const dbf = await readRelatedFile(projectPath, `${base}.dbf`);
  const prjText = await readRelatedText(projectPath, `${base}.prj`);
  const cpgText = await readRelatedText(projectPath, `${base}.cpg`);
  return await loadShapefileFromSource({
    name: layer.name || baseNameOf(reference),
    shp: shp.data,
    dbf: dbf?.data ?? null,
    prjText,
    cpgText,
    kind: 'qgis',
    sourceLabel: 'Projeto QGIS',
  });
}

async function loadProjectGeoJSON(
  layer: ProjectLayer,
  projectPath: string,
  reference: string,
): Promise<string> {
  const text = await readRelatedText(projectPath, reference);
  if (!text) throw new Error(`arquivo não encontrado: ${reference}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('o conteúdo não é um JSON válido');
  }
  const detected = detectGeoJSONCrs(parsed);
  // Sem CRS no arquivo, vale o declarado no projeto (ex.: EPSG:4674 do IBGE).
  const crs =
    detected === 'EPSG:4326' && /^EPSG:\d{4,5}$/i.test(layer.authid) ? layer.authid.toUpperCase() : detected;
  const id = addGeoJSONLayer({
    name: layer.name || baseNameOf(reference),
    geojson: parsed,
    crs,
    kind: 'qgis',
    sourceLabel: 'Projeto QGIS',
  });
  const meta = deriveFeatureMeta(parsed);
  useAppStore
    .getState()
    .updateLayer(id, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
  return id;
}
