import Feature from 'ol/Feature.js';
import { unByKey } from 'ol/Observable.js';
import type Map from 'ol/Map.js';
import type { EventsKey } from 'ol/events.js';
import type { Geometry } from 'ol/geom.js';
import type BaseLayer from 'ol/layer/Base.js';
import type Layer from 'ol/layer/Layer.js';
import type Source from 'ol/source/Source.js';
import { useAppStore } from '../store';
import { clearSelection, getSelection, getVectorLayer, setSelection, zoomToFeatures } from '../map/mapContext';

const MAX_PROPS = 12;

let mapRef: Map | null = null;
let clickKey: EventsKey | null = null;
let popupEl: HTMLElement | null = null;
let lastPos: { x: number; y: number } | null = null;

function registryLayers(): Set<BaseLayer> {
  const allowed = new Set<BaseLayer>();
  for (const record of useAppStore.getState().layers) {
    if (record.visible !== false) {
      const vector = getVectorLayer(record.id);
      if (vector) allowed.add(vector);
    }
  }
  return allowed;
}

function layerNameOf(target: BaseLayer): string {
  const record = useAppStore
    .getState()
    .layers.find((candidate) => {
      const vector = getVectorLayer(candidate.id);
      return vector !== undefined && (vector as BaseLayer) === target;
    });
  return record?.name ?? 'Camada';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'Verdadeiro' : 'Falso';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[objeto]';
    }
  }
  return String(value);
}

export function closePopup(): void {
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
}

function buildPopup(feature: Feature<Geometry>, layerName: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'popup-card';
  el.style.position = 'fixed';
  el.style.zIndex = '930';
  el.style.width = '350px';
  el.style.maxWidth = 'calc(100vw - 32px)';
  el.style.padding = '12px 14px';
  el.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '10px';

  // ── Barra de título arrastável ──
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.cursor = 'grab';
  header.style.userSelect = 'none';
  header.style.paddingBottom = '8px';
  header.style.borderBottom = '1px solid var(--border-soft)';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '7px';
  left.style.flex = '1';
  left.style.minWidth = '0';
  left.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; flex-shrink: 0;"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
    <span style="font-weight: 600; font-size: 12.5px; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${layerName}">${layerName}</span>
  `;
  header.appendChild(left);

  const closeIcon = document.createElement('button');
  closeIcon.type = 'button';
  closeIcon.className = 'icon-btn';
  closeIcon.title = 'Fechar';
  closeIcon.style.padding = '2px';
  closeIcon.style.display = 'grid';
  closeIcon.style.placeItems = 'center';
  closeIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeIcon.addEventListener('click', () => {
    clearSelection();
    closePopup();
    lastPos = null;
  });
  header.appendChild(closeIcon);
  el.appendChild(header);

  // ── Drag & Drop da janela ──
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let originX = 0;
  let originY = 0;

  header.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    originX = el.offsetLeft;
    originY = el.offsetTop;
    header.setPointerCapture(e.pointerId);
    header.style.cursor = 'grabbing';
  });

  header.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newX = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, originX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, originY + dy));
    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;
    lastPos = { x: newX, y: newY };
  });

  const stopDrag = (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    header.style.cursor = 'grab';
    try {
      header.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  header.addEventListener('pointerup', stopDrag);
  header.addEventListener('pointercancel', stopDrag);

  // ── Conteúdo dos atributos ──
  const properties = feature.getProperties();
  const keys = Object.keys(properties).filter((key) => key !== 'geometry');

  const scroll = document.createElement('div');
  scroll.style.maxHeight = '200px';
  scroll.style.overflow = 'auto';
  scroll.style.border = '1px solid var(--border-soft)';
  scroll.style.borderRadius = 'var(--radius-sm)';
  scroll.style.background = 'var(--bg-0)';

  const table = document.createElement('table');
  table.className = 'kv-table';
  const shown = keys.slice(0, MAX_PROPS);
  if (shown.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = 'Sem atributos';
    row.appendChild(cell);
    table.appendChild(row);
  } else {
    shown.forEach((key) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = key;
      const valueCell = document.createElement('td');
      valueCell.textContent = formatValue(properties[key]);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      table.appendChild(row);
    });
  }
  scroll.appendChild(table);
  el.appendChild(scroll);

  if (keys.length > MAX_PROPS) {
    const more = document.createElement('div');
    more.className = 'muted';
    more.style.fontSize = '11px';
    more.textContent = `+${keys.length - MAX_PROPS} atributo(s) não exibido(s)`;
    el.appendChild(more);
  }

  // ── Botões de Ação ──
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'flex-end';
  row.style.gap = '8px';
  row.style.marginTop = '2px';

  const center = document.createElement('button');
  center.type = 'button';
  center.className = 'btn';
  center.textContent = 'Centralizar';
  center.title = 'Centralizar mapa nesta feição';
  center.addEventListener('click', () => {
    zoomToFeatures([feature]);
  });
  row.appendChild(center);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn';
  dismiss.textContent = 'Fechar';
  dismiss.addEventListener('click', () => {
    clearSelection();
    closePopup();
    lastPos = null;
  });
  row.appendChild(dismiss);

  el.appendChild(row);
  return el;
}

export function activateIdentify(map: Map): void {
  deactivate();
  mapRef = map;

  const vp = map.getViewport();
  if (vp) vp.style.cursor = 'crosshair';

  clickKey = map.on('singleclick', (evt) => {
    const additive =
      evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey;
    const allowed = registryLayers();
    const hit = map.forEachFeatureAtPixel<{ feature: Feature<Geometry>; layer: Layer<Source> } | null>(
      evt.pixel,
      (candidate, candidateLayer) => {
        if (!candidateLayer || !allowed.has(candidateLayer)) return null;
        if (!(candidate instanceof Feature)) return null;
        return { feature: candidate, layer: candidateLayer };
      },
      {
        hitTolerance: 6,
        layerFilter: (candidateLayer) => allowed.has(candidateLayer),
      },
    );

    if (!hit) {
      if (!additive) clearSelection();
      closePopup();
      return;
    }

    const current = getSelection();
    if (additive) {
      if (!current.includes(hit.feature)) setSelection([...current, hit.feature]);
    } else {
      setSelection([hit.feature]);
    }

    closePopup();
    const element = buildPopup(hit.feature, layerNameOf(hit.layer));
    popupEl = element;
    document.body.appendChild(element);

    // Posicionamento centralizado na tela ou no último ponto arrastado
    const width = element.offsetWidth || 350;
    const height = element.offsetHeight || 300;
    if (lastPos) {
      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, lastPos.x));
      const clampedY = Math.max(60, Math.min(window.innerHeight - height - 10, lastPos.y));
      element.style.left = `${clampedX}px`;
      element.style.top = `${clampedY}px`;
    } else {
      const centerX = Math.max(10, Math.round((window.innerWidth - width) / 2));
      const centerY = Math.max(60, Math.round((window.innerHeight - height) / 2));
      element.style.left = `${centerX}px`;
      element.style.top = `${centerY}px`;
      lastPos = { x: centerX, y: centerY };
    }
  });
}

export function deactivate(): void {
  if (mapRef) {
    const vp = mapRef.getViewport();
    if (vp) vp.style.cursor = '';
  }
  if (clickKey) {
    unByKey(clickKey);
    clickKey = null;
  }
  closePopup();
  lastPos = null;
  mapRef = null;
}
