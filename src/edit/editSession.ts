import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import type VectorSource from 'ol/source/Vector.js';
import type Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import {
  clearSelection,
  getLayerGeoJSON,
  getLayerSource,
  getMap,
  getSelection,
  getVectorLayer,
  setLayerFeatures,
  setSelection,
} from '../map/mapContext';
import { useAppStore } from '../store';

const HISTORY_LIMIT = 30;

type DrawGeometryType = 'Point' | 'LineString' | 'Polygon';

interface HistoryState {
  past: string[];
  future: string[];
}

const histories = new Map<string, HistoryState>();

let drawInteraction: Draw | null = null;
let modifyInteraction: Modify | null = null;
let selectInteraction: Select | null = null;
let editingLayerId: string | null = null;
let pendingDrawSnapshot: string | null = null;
let keyListener: ((event: KeyboardEvent) => void) | null = null;

function ensureHistory(layerId: string): HistoryState {
  let state = histories.get(layerId);
  if (!state) {
    state = { past: [], future: [] };
    histories.set(layerId, state);
  }
  return state;
}

function snapshot(layerId: string): string {
  return JSON.stringify(getLayerGeoJSON(layerId));
}

function pushHistory(layerId: string, before: string): void {
  const history = ensureHistory(layerId);
  history.past.push(before);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
}

function syncLayerCount(layerId: string): void {
  const source = getLayerSource(layerId);
  if (!source) return;
  source.changed();
  useAppStore.getState().updateLayer(layerId, { featureCount: source.getFeatures().length });
}

function afterMutation(layerId: string): void {
  syncLayerCount(layerId);
  useAppStore.getState().setStatus('Edição aplicada');
}

function detectDrawType(source: VectorSource<Feature<Geometry>>): DrawGeometryType {
  const first = source.getFeatures()[0];
  switch (first?.getGeometry()?.getType()) {
    case 'Point':
    case 'MultiPoint':
      return 'Point';
    case 'LineString':
    case 'MultiLineString':
      return 'LineString';
    case 'Polygon':
    case 'MultiPolygon':
      return 'Polygon';
    default:
      return 'Point';
  }
}

function restore(layerId: string, serialized: string, status: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    useAppStore.getState().setStatus('Estado de edição inválido');
    return;
  }
  setLayerFeatures(layerId, parsed, 'EPSG:4326');
  selectInteraction?.getFeatures().clear();
  clearSelection();
  syncLayerCount(layerId);
  useAppStore.getState().setStatus(status);
}

export function startEdit(layerId: string): { error: string } | null {
  const state = useAppStore.getState();
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return { error: 'Camada não encontrada' };
  if (layer.kind === 'arcgis-rest') return { error: 'Camadas de serviço não são editáveis' };
  if (editingLayerId === layerId) return null;
  if (editingLayerId) stopEdit();

  const map = getMap();
  const source = getLayerSource(layerId);
  const vectorLayer = getVectorLayer(layerId);
  if (!map || !source || !vectorLayer) return { error: 'Camada indisponível para edição' };

  const draw = new Draw({ source, type: detectDrawType(source) });
  const modify = new Modify({ source });
  const select = new Select({ style: null, layers: [vectorLayer] });

  draw.on('drawstart', () => {
    pendingDrawSnapshot = snapshot(layerId);
  });

  draw.on('drawend', () => {
    const before = pendingDrawSnapshot ?? snapshot(layerId);
    pendingDrawSnapshot = null;
    queueMicrotask(() => {
      if (editingLayerId !== layerId) return;
      pushHistory(layerId, before);
      afterMutation(layerId);
    });
  });

  modify.on('modifystart', () => {
    pushHistory(layerId, snapshot(layerId));
  });

  modify.on('modifyend', () => {
    if (editingLayerId !== layerId) return;
    afterMutation(layerId);
  });

  select.on('select', (event) => {
    setSelection(event.selected);
  });

  const onDeleteKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const active = document.activeElement;
    const tag = active?.tagName.toUpperCase() ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (active instanceof HTMLElement && active.isContentEditable) return;
    if (editingLayerId !== layerId) return;
    const layerSource = getLayerSource(layerId);
    if (!layerSource) return;
    const removable = getSelection().filter((feature) => layerSource.hasFeature(feature));
    if (removable.length === 0) return;
    event.preventDefault();
    pushHistory(layerId, snapshot(layerId));
    removable.forEach((feature) => layerSource.removeFeature(feature));
    clearSelection();
    afterMutation(layerId);
  };
  window.addEventListener('keydown', onDeleteKey);

  map.addInteraction(modify);
  map.addInteraction(select);
  map.addInteraction(draw);
  drawInteraction = draw;
  modifyInteraction = modify;
  selectInteraction = select;
  keyListener = onDeleteKey;
  editingLayerId = layerId;
  useAppStore.getState().setStatus('Modo de edição ativo');
  return null;
}

export function stopEdit(): void {
  const map = getMap();
  if (modifyInteraction) map?.removeInteraction(modifyInteraction);
  if (selectInteraction) {
    selectInteraction.getFeatures().clear();
    map?.removeInteraction(selectInteraction);
  }
  if (drawInteraction) map?.removeInteraction(drawInteraction);
  modifyInteraction = null;
  selectInteraction = null;
  drawInteraction = null;
  if (keyListener) {
    window.removeEventListener('keydown', keyListener);
    keyListener = null;
  }
  pendingDrawSnapshot = null;
  if (editingLayerId) {
    clearSelection();
    useAppStore.getState().setStatus('Edição encerrada');
  }
  editingLayerId = null;
}

export function undoEdit(layerId: string): void {
  const history = histories.get(layerId);
  if (!history || history.past.length === 0) {
    useAppStore.getState().setStatus('Nada para desfazer');
    return;
  }
  if (!getLayerSource(layerId)) {
    useAppStore.getState().setStatus('Camada indisponível');
    return;
  }
  const current = snapshot(layerId);
  const target = history.past.pop() as string;
  history.future.push(current);
  if (history.future.length > HISTORY_LIMIT) history.future.shift();
  restore(layerId, target, 'Edição desfeita');
}

export function redoEdit(layerId: string): void {
  const history = histories.get(layerId);
  if (!history || history.future.length === 0) {
    useAppStore.getState().setStatus('Nada para refazer');
    return;
  }
  if (!getLayerSource(layerId)) {
    useAppStore.getState().setStatus('Camada indisponível');
    return;
  }
  const current = snapshot(layerId);
  const target = history.future.pop() as string;
  history.past.push(current);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  restore(layerId, target, 'Edição refeita');
}

export function isEditing(): boolean {
  return editingLayerId !== null;
}
