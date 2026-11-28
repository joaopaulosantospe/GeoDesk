import { addGeoJSONLayer, zoomToLayer } from '../map/mapContext';
import { useAppStore } from '../store';
import { loadProjectFile, getCurrentProjectName, setCurrentProjectName } from '../export/projectManager';
import { detectGeoJSONCrs, deriveFeatureMeta, errorMessage } from './geojsonLoader';
import { loadGeoPackage } from './gpkgLoader';
import { loadQgisProject } from './qgisProject';
import { loadMxdProject } from './mxdProject';
import { loadShapefileFromSource } from './shpLoader';

/**
 * Abre o arquivo que o Windows passou ao iniciar o GeoDesk — duplo clique ou
 * "Abrir com GeoDesk", conforme as associações registradas pelo instalador
 * (installer.iss). Extensões aceitas: as mesmas do STARTUP_EXTENSIONS.
 */

export const STARTUP_EXTENSIONS = ['.shp', '.geojson', '.json', '.gpkg', '.qgs', '.qgz', '.mxd', '.geodesk'];

const setStatus = (message: string) => useAppStore.getState().setStatus(message);

export async function openStartupFile(): Promise<void> {
  const api = window.geodeskDisk;
  if (!api?.getStartupFile) return;
  const filePath = await api.getStartupFile();
  if (!filePath) return;
  await openPathFromDisk(filePath);
}

export async function openPathFromDisk(filePath: string): Promise<void> {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex === -1 ? '' : name.slice(dotIndex).toLowerCase();
  if (!STARTUP_EXTENSIONS.includes(extension)) return;

  try {
    const file = await readFromDisk(filePath, name);
    if (!file) {
      setStatus(`Não foi possível ler "${name}"`);
      return;
    }
    setStatus(`Abrindo ${name}…`);
    switch (extension) {
      case '.gpkg':
        await loadGeoPackage(file);
        if (getCurrentProjectName() === 'meu-projeto') {
          setCurrentProjectName(name.replace(/\.gpkg$/i, ''));
        }
        break;
      case '.qgs':
      case '.qgz':
        await loadQgisProject(file, filePath);
        if (getCurrentProjectName() === 'meu-projeto') {
          setCurrentProjectName(name.replace(/\.(qgs|qgz)$/i, ''));
        }
        break;
      case '.mxd':
        await loadMxdProject(file, filePath);
        if (getCurrentProjectName() === 'meu-projeto') {
          setCurrentProjectName(name.replace(/\.mxd$/i, ''));
        }
        break;
      case '.shp':
        zoomToLayer(await openShapefile(filePath, name, file));
        if (getCurrentProjectName() === 'meu-projeto') {
          setCurrentProjectName(name.replace(/\.shp$/i, ''));
        }
        break;
      case '.geojson':
      case '.json':
        zoomToLayer(await openGeoJSON(file));
        if (getCurrentProjectName() === 'meu-projeto') {
          setCurrentProjectName(name.replace(/\.(geojson|json)$/i, ''));
        }
        break;
      case '.geodesk':
        await loadProjectFile(file, filePath);
        break;
      default:
        return;
    }
  } catch (error) {
    setStatus(`Erro ao abrir "${name}": ${errorMessage(error)}`);
  }
}

/** Arquivo do disco → File sintético (o loader cuida do conteúdo). */
async function readFromDisk(filePath: string, name: string): Promise<File | null> {
  const content = await window.geodeskDisk?.readRelated?.(filePath, filePath);
  if (!content) return null;
  // Cópia com buffer ArrayBuffer (evita a variante SharedArrayBuffer no tipo).
  return new File([new Uint8Array(content.data)], name);
}

async function openShapefile(filePath: string, name: string, file: File): Promise<string> {
  const base = filePath.replace(/\.[^./\\]+$/, '');
  const readSidecar = (extension: string) =>
    window.geodeskDisk?.readRelated?.(filePath, `${base}${extension}`);
  const [dbf, prj, cpg] = await Promise.all([readSidecar('.dbf'), readSidecar('.prj'), readSidecar('.cpg')]);
  const decode = (bytes?: Uint8Array | null) => (bytes ? new TextDecoder('utf-8').decode(bytes) : null);
  const id = await loadShapefileFromSource({
    name: name.replace(/\.shp$/i, ''),
    shp: new Uint8Array(await file.arrayBuffer()),
    dbf: dbf?.data ?? null,
    prjText: decode(prj?.data),
    cpgText: decode(cpg?.data),
  });
  return id;
}

async function openGeoJSON(file: File): Promise<string> {
  const name = file.name.replace(/\.(geojson|json)$/i, '') || file.name;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('o conteúdo não é um JSON válido');
  }
  const id = addGeoJSONLayer({
    name,
    geojson: parsed,
    crs: detectGeoJSONCrs(parsed),
    kind: 'geojson',
    sourceLabel: 'GeoJSON',
  });
  const meta = deriveFeatureMeta(parsed);
  useAppStore
    .getState()
    .updateLayer(id, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
  setStatus(`GeoJSON ${name} carregado (${meta.featureCount} feições)`);
  return id;
}
