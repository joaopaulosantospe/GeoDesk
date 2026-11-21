import { addGeoJSONLayer, zoomToLayers } from '../map/mapContext';
import { useAppStore } from '../store';
import { detectGeoJSONCrs, deriveFeatureMeta, errorMessage } from './geojsonLoader';
import { loadGeoPackageBytes } from './gpkgLoader';
import { loadShapefileFromSource } from './shpLoader';
import { diskPathOf, readRelatedFile, readRelatedText } from './diskFiles';
import { baseNameOf, extensionOf } from './qgisPaths';

/**
 * Leitor e extrator de fontes de dados de projetos ArcGIS ArcMap (.mxd).
 *
 * Como o formato .mxd é um composto binário OLE proprietário da Esri, realizamos
 * a leitura e decodificação estruturada das streams binárias procurando os caminhos
 * e referências a arquivos vetoriais (.shp, .gpkg, .geojson, etc.) armazenados em
 * sequências UTF-16LE e ASCII/Latin-1, resolvendo arquivos relativos ou absolutos.
 */

export interface MxdLayerReference {
  name: string;
  path: string;
}

export function isMxdProjectFile(name: string): boolean {
  return /\.mxd$/i.test(name);
}

/**
 * Decodifica o arquivo .mxd (binário) e extrai referências a fontes de arquivos suportados.
 */
export function extractSourcesFromMxd(bytes: Uint8Array): MxdLayerReference[] {
  const references: MxdLayerReference[] = [];
  const seenPaths = new Set<string>();

  // Decodifica como UTF-16LE (comum para strings no ArcGIS/OLE COM) e Latin1 (ASCII raw)
  let utf16Str = '';
  try {
    utf16Str = new TextDecoder('utf-16le').decode(bytes);
  } catch {
    // fallback se falhar decodificação
  }

  let latin1Str = '';
  try {
    latin1Str = new TextDecoder('latin1').decode(bytes);
  } catch {
    // fallback
  }

  // Regex para encontrar caminhos de shapefile, gpkg, geojson
  // Ex: C:\pasta\camada.shp ou .\dados\camada.shp ou dados/camada.shp ou camada.shp
  const pathRegex = /(?:[A-Za-z]:[\\/][^:*?"<>|\r\n\x00-\x1f]+|[a-zA-Z0-9_\-./\\]+)\.(?:shp|gpkg|geojson|json)\b/gi;

  function collectFromText(text: string) {
    if (!text) return;
    const matches = text.match(pathRegex) || [];
    for (const raw of matches) {
      // Limpa caracteres nulos, aspas, espaços laterais
      let clean = raw.replace(/[\x00-\x1f"']/g, '').trim();
      // Remove barras invertidas ou normais iniciais desnecessárias
      clean = clean.replace(/^[\\/]+/, '');
      if (!clean) continue;

      const lower = clean.toLowerCase();
      // Ignora arquivos de esquema ou extensões não alvo
      if (!lower.endsWith('.shp') && !lower.endsWith('.gpkg') && !lower.endsWith('.geojson') && !lower.endsWith('.json')) {
        continue;
      }

      if (seenPaths.has(lower)) continue;
      seenPaths.add(lower);

      const name = baseNameOf(clean);
      references.push({
        name,
        path: clean,
      });
    }
  }

  collectFromText(utf16Str);
  collectFromText(latin1Str);

  return references;
}

/**
 * Abre um projeto ArcGIS .mxd e carrega as camadas de dados referenciadas.
 */
export async function loadMxdProject(file: File, projectPathOverride?: string | null): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const sources = extractSourcesFromMxd(bytes);
  const projectPath = projectPathOverride ?? diskPathOf(file);

  if (sources.length === 0) {
    throw new Error(
      'Não foram encontradas referências a camadas de arquivos compatíveis (.shp, .gpkg, .geojson) dentro do projeto .mxd.',
    );
  }

  if (!projectPath) {
    throw new Error(
      'Para carregar as camadas vinculadas ao projeto .mxd, abra o arquivo utilizando o GeoDesk Desktop no Windows com acesso aos arquivos no disco.',
    );
  }

  const ids: string[] = [];
  const skipped: string[] = [];

  for (const source of sources) {
    try {
      const ext = extensionOf(source.path);
      switch (ext) {
        case '.shp': {
          const id = await loadProjectShapefile(source, projectPath);
          ids.push(id);
          break;
        }
        case '.gpkg': {
          const rel = await readRelatedFile(projectPath, source.path);
          if (!rel) throw new Error(`arquivo não encontrado: ${source.path}`);
          const gpkgIds = await loadGeoPackageBytes(rel.data, baseNameOf(source.path), undefined, source.name);
          ids.push(...gpkgIds);
          break;
        }
        case '.geojson':
        case '.json': {
          const id = await loadProjectGeoJSON(source, projectPath);
          ids.push(id);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      skipped.push(`${source.name} (${errorMessage(err)})`);
    }
  }

  if (ids.length === 0) {
    throw new Error(
      skipped.length > 0
        ? `Nenhuma camada do projeto .mxd pôde ser carregada — ${skipped.join('; ')}`
        : 'Nenhuma camada pôde ser carregada.',
    );
  }

  zoomToLayers(ids);
  const suffix = skipped.length > 0 ? ` — ignoradas: ${skipped.join('; ')}` : '';
  useAppStore
    .getState()
    .setStatus(
      `Projeto ArcMap "${file.name}" aberto: ${ids.length} ${ids.length === 1 ? 'camada carregada' : 'camadas carregadas'}${suffix}`,
    );

  return ids;
}

async function loadProjectShapefile(
  source: MxdLayerReference,
  projectPath: string,
): Promise<string> {
  const shp = await readRelatedFile(projectPath, source.path);
  if (!shp) throw new Error(`arquivo não encontrado: ${source.path}`);
  const base = source.path.replace(/\.shp$/i, '');
  const dbf = await readRelatedFile(projectPath, `${base}.dbf`);
  const prjText = await readRelatedText(projectPath, `${base}.prj`);
  const cpgText = await readRelatedText(projectPath, `${base}.cpg`);
  return await loadShapefileFromSource({
    name: source.name || baseNameOf(source.path),
    shp: shp.data,
    dbf: dbf?.data ?? null,
    prjText,
    cpgText,
    kind: 'arcgis',
    sourceLabel: 'Projeto ArcGIS (.mxd)',
  });
}

async function loadProjectGeoJSON(
  source: MxdLayerReference,
  projectPath: string,
): Promise<string> {
  const text = await readRelatedText(projectPath, source.path);
  if (!text) throw new Error(`arquivo não encontrado: ${source.path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('o conteúdo não é um JSON válido');
  }
  const detected = detectGeoJSONCrs(parsed);
  const id = addGeoJSONLayer({
    name: source.name || baseNameOf(source.path),
    geojson: parsed,
    crs: detected,
    kind: 'arcgis',
    sourceLabel: 'Projeto ArcGIS (.mxd)',
  });
  const meta = deriveFeatureMeta(parsed);
  useAppStore
    .getState()
    .updateLayer(id, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
  return id;
}
