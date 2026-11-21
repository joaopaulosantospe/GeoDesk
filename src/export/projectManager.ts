import { getMap, getBasemapLayer, getLayerGeoJSON, addGeoJSONLayer, unregisterVectorLayer, zoomToLayers, setBasemap as applyBasemap } from '../map/mapContext';
import { useAppStore } from '../store';
import { downloadText } from './download';
import type { BasemapId, LayerRecord, LayerStyle, JoinedTable } from '../types';

export interface SerializedLayer {
  record: LayerRecord;
  /** Geometrias gravadas SEMPRE em EPSG:4326 (ver featuresToGeoJSON). */
  geojson: unknown;
  /** CRS das geometrias acima. Presente desde a versão 1; assumido como EPSG:4326 se ausente. */
  geojsonCrs?: string;
}

export interface GeoDeskProject {
  format: 'geodesk-project';
  version: 1;
  name: string;
  savedAt: string;
  mapView: {
    center: [number, number];
    zoom: number;
  };
  basemapId: BasemapId;
  activeLayerId: string | null;
  layers: SerializedLayer[];
}

let currentProjectName = 'meu-projeto';
let currentProjectFilePath: string | null = null;

/** Nome amigável do projeto (sem extensão .geodesk). */
export function getCurrentProjectName(): string {
  return currentProjectName;
}

/** Nome do arquivo com extensão .geodesk para salvar no disco. */
export function getProjectFileName(): string {
  return `${currentProjectName}.geodesk`;
}

export function getCurrentProjectFilePath(): string | null {
  return currentProjectFilePath;
}

export function setCurrentProjectName(name: string): void {
  const clean = name.trim().replace(/\.geodesk$/i, '');
  currentProjectName = clean || 'meu-projeto';
}

export function setCurrentProjectFilePath(path: string | null): void {
  currentProjectFilePath = path;
  if (path) {
    const parts = path.split(/[/\\]/);
    const fileName = parts[parts.length - 1];
    if (fileName) {
      setCurrentProjectName(fileName);
    }
  }
}

/**
 * Cria o objeto serializado completo do estado atual do GeoDesk.
 */
export function serializeCurrentProject(name?: string): GeoDeskProject {
  const store = useAppStore.getState();
  const map = getMap();
  const view = map?.getView();
  const center = (view?.getCenter() as [number, number]) || [-5777494, -1596700];
  const zoom = view?.getZoom() ?? 4.2;

  const serializedLayers: SerializedLayer[] = store.layers.map((layer) => {
    const geojson = getLayerGeoJSON(layer.id);
    return {
      record: { ...layer },
      geojson,
      // getLayerGeoJSON grava em EPSG:4326, independentemente do CRS original da fonte.
      geojsonCrs: 'EPSG:4326',
    };
  });

  const projName = name || currentProjectName.replace(/\.geodesk$/i, '');

  return {
    format: 'geodesk-project',
    version: 1,
    name: projName,
    savedAt: new Date().toISOString(),
    mapView: {
      center,
      zoom,
    },
    basemapId: store.basemapId,
    activeLayerId: store.activeLayerId,
    layers: serializedLayers,
  };
}

/**
 * Salva o projeto diretamente no arquivo aberto (sem abrir tela de Salvar Como).
 * Se o projeto já tem um caminho no disco (aberto via Electron), grava diretamente no mesmo arquivo.
 */
export async function saveProject(): Promise<void> {
  const project = serializeCurrentProject();
  const jsonStr = JSON.stringify(project, null, 2);

  // Se estiver no Electron e já possuir o caminho do arquivo aberto no disco:
  if (currentProjectFilePath && window.geodeskDisk?.saveFile) {
    const ok = await window.geodeskDisk.saveFile(currentProjectFilePath, jsonStr);
    if (ok) {
      useAppStore.getState().setStatus(`Projeto salvo com sucesso em: ${currentProjectFilePath}`);
      return;
    }
  }

  // Fallback: download direto com o mesmo nome do projeto
  downloadText(getProjectFileName(), jsonStr, 'application/json');
  useAppStore.getState().setStatus(`Projeto "${currentProjectName}" salvo com sucesso`);
}

/**
 * Salva o projeto permitindo definir um novo nome / destino (Salvar Como...).
 */
export async function saveProjectAs(customName?: string): Promise<void> {
  // Se estiver no Electron e nenhuma especificação manual for passada, usa a caixa de diálogo nativa
  if (window.geodeskDisk?.showSaveDialog && (!customName || customName.trim() === '')) {
    const defaultName = getProjectFileName();
    const chosenPath = await window.geodeskDisk.showSaveDialog(defaultName);
    if (!chosenPath) return; // Usuário cancelou
    setCurrentProjectFilePath(chosenPath);
    const project = serializeCurrentProject(currentProjectName);
    const jsonStr = JSON.stringify(project, null, 2);
    const ok = await window.geodeskDisk.saveFile(chosenPath, jsonStr);
    if (ok) {
      useAppStore.getState().setStatus(`Projeto salvo como "${currentProjectName}"`);
    }
    return;
  }

  const cleanName = customName ? customName.trim() : currentProjectName;
  setCurrentProjectName(cleanName);
  currentProjectFilePath = null; // Reset de caminho para o novo nome caso seja web download
  const project = serializeCurrentProject(cleanName);
  const jsonStr = JSON.stringify(project, null, 2);
  downloadText(getProjectFileName(), jsonStr, 'application/json');
  useAppStore.getState().setStatus(`Projeto salvo como "${currentProjectName}"`);
}

/**
 * Carrega um arquivo de projeto .geodesk e restaura o estado do mapa e das camadas.
 */
export async function loadProjectFile(file: File, projectPathOverride?: string | null): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }

  const proj = parsed as Partial<GeoDeskProject>;
  if (!proj || proj.format !== 'geodesk-project' || !Array.isArray(proj.layers)) {
    throw new Error('O arquivo selecionado não é um projeto GeoDesk válido (.geodesk).');
  }

  const store = useAppStore.getState();
  store.setStatus('Restaurando projeto GeoDesk…');

  // Limpa todas as camadas atuais
  const currentLayers = [...store.layers];
  for (const l of currentLayers) {
    unregisterVectorLayer(l.id);
    store.removeLayer(l.id);
  }

  // Restaura o nome e o caminho do arquivo do projeto
  const diskPath =
    projectPathOverride ||
    (window.geodeskDisk?.pathForFile ? window.geodeskDisk.pathForFile(file) : null);
  if (diskPath) {
    setCurrentProjectFilePath(diskPath);
  } else {
    const baseName = file.name.replace(/\.geodesk$/i, '') || proj.name || 'meu-projeto';
    setCurrentProjectName(baseName);
    setCurrentProjectFilePath(null);
  }

  // Restaura Basemap
  if (proj.basemapId) {
    store.setBasemap(proj.basemapId);
    applyBasemap(proj.basemapId);
  }

  // Restaura cada camada
  const addedIds: string[] = [];
  for (const item of proj.layers) {
    const { record, geojson } = item;
    // As geometrias gravadas no projeto estão em EPSG:4326 (ver serializeCurrentProject).
    // Usar record.crs aqui reprojetaria de novo, jogando os pontos fora da vista —
    // além disso, definições proj4 de CRS como "geodesk:prj" não existem após reiniciar o app.
    const dataCrs = item.geojsonCrs || 'EPSG:4326';
    const newId = addGeoJSONLayer({
      name: record.name,
      geojson: geojson || { type: 'FeatureCollection', features: [] },
      crs: dataCrs,
      kind: record.kind || 'geojson',
      style: record.style,
      url: record.url,
      sourceLabel: record.sourceLabel,
      makeActive: false,
    });

    store.updateLayer(newId, {
      visible: record.visible !== undefined ? record.visible : true,
      opacity: record.opacity !== undefined ? record.opacity : 1,
      // Mantém o CRS original da fonte apenas como metadado (exibido nos relatórios),
      // já que as geometrias em memória agora estão em EPSG:4326.
      crs: record.crs || dataCrs,
      fields: record.fields || [],
      featureCount: record.featureCount || 0,
      geometryTypes: record.geometryTypes || [],
      style: record.style,
      join: record.join,
    });

    addedIds.push(newId);
  }

  // Restaura a camada ativa
  if (addedIds.length > 0) {
    store.setActiveLayer(addedIds[addedIds.length - 1]);
  } else {
    store.setActiveLayer(null);
  }

  // Restaura visão do mapa
  const map = getMap();
  if (map && proj.mapView) {
    map.getView().animate({
      center: proj.mapView.center,
      zoom: proj.mapView.zoom,
      duration: 350,
    });
  } else if (addedIds.length > 0) {
    zoomToLayers(addedIds);
  }

  store.setStatus(`Projeto "${currentProjectName}" carregado (${addedIds.length} camadas)`);
}
