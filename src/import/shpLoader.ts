import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import * as shapefile from 'shapefile';
import { addGeoJSONLayer, zoomToLayers } from '../map/mapContext';
import { useAppStore } from '../store';
import { deriveFeatureMeta, errorMessage } from './geojsonLoader';
import type { LayerSourceKind } from '../types';

const PRJ_CRS = 'geodesk:prj';

/** Um shapefile já lido (bytes), com os companions opcionais. */
export interface ShapefileSource {
  /** Nome da camada (sem extensão). */
  name: string;
  shp: ArrayBuffer | Uint8Array;
  dbf?: ArrayBuffer | Uint8Array | null;
  /** Texto WKT do .prj; null quando ausente. */
  prjText?: string | null;
  /** Conteúdo do .cpg (define a codificação dos atributos); null quando ausente. */
  cpgText?: string | null;
  /** Origem da camada (padrão: shapefile solto). */
  kind?: LayerSourceKind;
  sourceLabel?: string;
}

/**
 * Carrega um shapefile a partir de bytes — usado pelo diálogo de arquivos e
 * pelo leitor de projetos QGIS, que busca os arquivos irmãos no disco.
 */
export async function loadShapefileFromSource(src: ShapefileSource): Promise<string> {
  const warnings: string[] = [];
  if (!src.dbf) warnings.push('arquivo .dbf ausente, atributos não carregados');
  let crs = 'EPSG:4326';
  const prjText = (src.prjText ?? '').trim();
  if (prjText === '') {
    warnings.push('arquivo .prj ausente, coordenadas assumidas em EPSG:4326');
  } else {
    proj4.defs(PRJ_CRS, prjText);
    register(proj4);
    crs = PRJ_CRS;
  }
  const encoding = src.cpgText ? encodingFromCpg(src.cpgText.trim()) : 'windows-1252';
  const geojson = await shapefile.read(src.shp, src.dbf ?? undefined, { encoding });
  // Injeta o FID (número sequencial do registro do shapefile) como id e propriedade FID_1
  geojson.features.forEach((feature, index) => {
    feature.id = index;
    if (feature.properties) {
      if (feature.properties.FID_1 === undefined && feature.properties.FID === undefined) {
        feature.properties.FID_1 = index;
      }
    }
  });
  const id = addGeoJSONLayer({
    name: src.name,
    geojson,
    crs,
    kind: src.kind ?? 'shp',
    sourceLabel: src.sourceLabel ?? 'Shapefile',
  });
  const meta = deriveFeatureMeta(geojson);
  useAppStore
    .getState()
    .updateLayer(id, { fields: meta.fields, featureCount: meta.featureCount, geometryTypes: meta.geometryTypes });
  const loaded = `Shapefile ${src.name} carregado (${meta.featureCount} feições)`;
  useAppStore.getState().setStatus(warnings.length > 0 ? `${loaded} — ${warnings.join('; ')}` : loaded);
  return id;
}

export async function loadShapefile(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  const shpFiles = list.filter((file) => extensionOf(file.name) === '.shp');
  if (shpFiles.length === 0) {
    fail('Nenhum arquivo .shp foi selecionado.');
  }
  const loadedIds: string[] = [];
  for (const shpFile of shpFiles) {
    const name = baseNameOf(shpFile.name);
    const key = name.toLowerCase();
    const dir = dirOf(shpFile);
    const sameBase = (file: File, ext: string): boolean =>
      extensionOf(file.name) === ext &&
      baseNameOf(file.name).toLowerCase() === key &&
      (dir === '' || dirOf(file) === dir);
    const dbfFile = list.find((file) => sameBase(file, '.dbf'));
    const prjFile = list.find((file) => sameBase(file, '.prj'));
    const cpgFile = list.find((file) => sameBase(file, '.cpg'));
    loadedIds.push(await loadSingleShapefile(shpFile, dbfFile, prjFile, cpgFile, name));
  }
  // Enquadra o mapa no conteúdo carregado (todas as camadas do lote, se houver mais de uma).
  zoomToLayers(loadedIds);
}

async function loadSingleShapefile(
  shpFile: File,
  dbfFile: File | undefined,
  prjFile: File | undefined,
  cpgFile: File | undefined,
  name: string,
): Promise<string> {
  try {
    const shpBuffer = await readAsArrayBuffer(shpFile);
    // O usuário pode escolher só o .shp: os companions são buscados na mesma pasta do disco.
    const dbfBuffer = dbfFile ? await readAsArrayBuffer(dbfFile) : await readSidecar(shpFile, '.dbf');
    const cpgText = cpgFile ? await readAsText(cpgFile) : await readSidecarText(shpFile, '.cpg');
    const prjText = prjFile ? await readAsText(prjFile) : await readSidecarText(shpFile, '.prj');
    return await loadShapefileFromSource({ name, shp: shpBuffer, dbf: dbfBuffer, prjText, cpgText });
  } catch (error) {
    fail(`Falha ao carregar o shapefile ${name}: ${errorMessage(error)}`);
  }
}

function encodingFromCpg(raw: string): string {
  const value = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (value === 'UTF-8' || value === 'UTF8') return 'utf-8';
  if (value === 'ISO-8859-1' || value === 'ISO88591' || value === 'LATIN1') return 'windows-1252';
  if (value === '1252' || value === 'CP1252') return 'windows-1252';
  if (value === '850' || value === 'CP850') return 'ibm850';
  return 'windows-1252';
}

/**
 * Lê um arquivo companion (.dbf/.prj/.cpg) direto da pasta do .shp no disco,
 * para quando o usuário escolhe apenas o arquivo .shp no diálogo.
 * Sem acesso ao disco (ex.: navegador), devolve null e o aviso é emitido.
 */
async function readSidecar(shpFile: File, ext: '.dbf' | '.prj' | '.cpg'): Promise<Uint8Array | null> {
  const api = window.geodeskDisk;
  if (!api) return null;
  try {
    const shpPath = api.pathForFile(shpFile);
    if (!shpPath) return null;
    return await api.readSidecar(shpPath, ext);
  } catch {
    return null;
  }
}

/** Companions de texto (.prj/.cpg) a partir do disco. */
async function readSidecarText(shpFile: File, ext: '.prj' | '.cpg'): Promise<string | null> {
  const bytes = await readSidecar(shpFile, ext);
  if (!bytes) return null;
  return new TextDecoder('utf-8').decode(bytes);
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    reader.readAsArrayBuffer(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    reader.readAsText(file);
  });
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

function baseNameOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? name : name.slice(0, index);
}

function dirOf(file: File): string {
  const path = file.webkitRelativePath ?? '';
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function fail(message: string): never {
  useAppStore.getState().setStatus(message);
  throw new Error(message);
}
