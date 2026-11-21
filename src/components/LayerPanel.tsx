import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  GripVertical,
  Layers,
  Link2,
  Maximize2,
  MoreVertical,
  Palette,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  SaveAll,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Unlink,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  applyLayerOpacity,
  applyLayerStyle,
  applyLayerVisibility,
  getLayerSource,
  refreshAllZIndexes,
  removeLayerEverywhere,
  zoomToFeatures,
  zoomToLayers,
} from '../map/mapContext';
import { nextLayerStyle, useAppStore } from '../store';
import { removeTableJoin } from '../import/tableJoin';
import { exportLayerExcel } from '../export/excelExport';
import { exportLayerKML } from '../export/kmlExport';
import { exportLayerGeoJSON } from '../export/geojsonExport';
import { loadSample } from '../import/samples';
import { defaultLabelStyle, layerFieldNames, parseHexColor, withAlpha } from '../labels';
import type { LayerRecord, LayerSourceKind, LayerStyle, PointShape } from '../types';
import JoinDialog from './JoinDialog';
import LabelDialog from './LabelDialog';

const kindBadge: Record<LayerSourceKind, string> = {
  shp: 'SHP',
  geojson: 'GEOJSON',
  gpkg: 'GPKG',
  qgis: 'QGIS',
  arcgis: 'MXD',
  'arcgis-rest': 'REST',
  sample: 'AMOSTRA',
  analysis: 'ANÁLISE',
};

const POINT_SHAPES: { value: PointShape; label: string }[] = [
  { value: 'circle', label: 'Círculo' },
  { value: 'square', label: 'Quadrado' },
  { value: 'diamond', label: 'Losango' },
  { value: 'triangle', label: 'Triângulo' },
  { value: 'triangle-down', label: 'Triângulo Invertido' },
  { value: 'star', label: 'Estrela' },
  { value: 'hexagon', label: 'Hexágono' },
  { value: 'pentagon', label: 'Pentágono' },
  { value: 'cross', label: 'Cruz (+)' },
  { value: 'x', label: 'Cruz (X)' },
  { value: 'pin', label: 'Pino Preenchido com Furo' },
  { value: 'pin-outline', label: 'Pino Contorno / Vazado' },
  { value: 'pin-dot', label: 'Pino com Ponto Central' },
  { value: 'pin-solid', label: 'Pino Totalmente Sólido' },
  { value: 'bullseye', label: 'Alvo / Marco Geodésico' },
];

function shapeGlyph(shape: PointShape, fill: string, stroke: string) {
  const common = { fill, stroke, strokeWidth: 1.2 };
  switch (shape) {
    case 'square':
      return <rect x="2" y="2" width="10" height="10" rx="1.5" {...common} />;
    case 'diamond':
      return <polygon points="7,1.5 12.5,7 7,12.5 1.5,7" {...common} />;
    case 'triangle':
      return <polygon points="7,1.5 12.5,12 1.5,12" {...common} />;
    case 'triangle-down':
      return <polygon points="7,12.5 12.5,2 1.5,2" {...common} />;
    case 'star':
      return (
        <polygon
          points="7,1.3 8.7,5.2 12.8,5.4 9.6,8.1 10.7,12.2 7,9.9 3.3,12.2 4.4,8.1 1.2,5.4 5.3,5.2"
          {...common}
        />
      );
    case 'hexagon':
      return <polygon points="7,1.5 12,4.3 12,9.7 7,12.5 2,9.7 2,4.3" {...common} />;
    case 'pentagon':
      return <polygon points="7,1.5 12.2,5.3 10.2,11.5 3.8,11.5 1.8,5.3" {...common} />;
    case 'cross':
      return (
        <path
          d="M5.5 1.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z"
          {...common}
        />
      );
    case 'x':
      return (
        <path
          d="M2.5 1.5L7 6l4.5-4.5 1 1L8 7l4.5 4.5-1 1L7 8l-4.5 4.5-1-1L6 7 1.5 2.5z"
          {...common}
        />
      );
    case 'pin':
      return (
        <path
          d="M 7 0.8 C 4.5 0.8 2.5 2.8 2.5 5.3 C 2.5 8.8 7 13.2 7 13.2 C 7 13.2 11.5 8.8 11.5 5.3 C 11.5 2.8 9.5 0.8 7 0.8 Z M 7 3.1 A 2.2 2.2 0 1 0 7 7.5 A 2.2 2.2 0 1 0 7 3.1 Z"
          fillRule="evenodd"
          {...common}
        />
      );
    case 'pin-outline':
      return (
        <g fill="none" stroke={stroke || fill} strokeWidth={1.2}>
          <path d="M 7 0.8 C 4.5 0.8 2.5 2.8 2.5 5.3 C 2.5 8.8 7 13.2 7 13.2 C 7 13.2 11.5 8.8 11.5 5.3 C 11.5 2.8 9.5 0.8 7 0.8 Z" />
          <circle cx="7" cy="5.3" r="2.2" />
        </g>
      );
    case 'pin-dot':
      return (
        <g>
          <path
            d="M 7 0.8 C 4.5 0.8 2.5 2.8 2.5 5.3 C 2.5 8.8 7 13.2 7 13.2 C 7 13.2 11.5 8.8 11.5 5.3 C 11.5 2.8 9.5 0.8 7 0.8 Z"
            {...common}
          />
          <circle cx="7" cy="5.3" r="1.8" fill="#ffffff" stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'pin-solid':
      return (
        <path
          d="M 7 0.8 C 4.5 0.8 2.5 2.8 2.5 5.3 C 2.5 8.8 7 13.2 7 13.2 C 7 13.2 11.5 8.8 11.5 5.3 C 11.5 2.8 9.5 0.8 7 0.8 Z"
          {...common}
        />
      );
    case 'bullseye':
      return (
        <g>
          <circle cx="7" cy="7" r="5.5" {...common} />
          <circle cx="7" cy="7" r="2.2" fill={stroke} />
        </g>
      );
    default:
      return <circle cx="7" cy="7" r="5" {...common} />;
  }
}

function layerGlyph(layer: LayerRecord) {
  const stroke = layer.style.strokeColor;
  const fill = parseHexColor(layer.style.fillColor);
  const size = 15;
  if (layer.geometryTypes.some((type) => type.includes('Point'))) {
    return (
      <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden>
        {shapeGlyph(
          layer.style.pointShape ?? 'circle',
          withAlpha(fill.hex, Math.max(0.65, fill.alpha)),
          stroke,
        )}
      </svg>
    );
  }
  if (layer.geometryTypes.some((type) => type.includes('LineString'))) {
    return (
      <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden>
        <line
          x1="1"
          y1="7"
          x2="13"
          y2="7"
          stroke={stroke}
          strokeWidth={Math.max(2, layer.style.strokeWidth)}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden>
      <rect
        x="1.5"
        y="3"
        width="11"
        height="8"
        rx="1.5"
        fill={layer.style.fillColor}
        stroke={stroke}
        strokeWidth="1.2"
      />
    </svg>
  );
}

function geometrySummary(layer: LayerRecord): string {
  if (layer.geometryTypes.some((t) => t.includes('Polygon'))) return 'Polígono';
  if (layer.geometryTypes.some((t) => t.includes('LineString'))) return 'Linha';
  if (layer.geometryTypes.some((t) => t.includes('Point'))) return 'Ponto';
  return 'Vetor';
}

function geometryPillClass(layer: LayerRecord): string {
  if (layer.geometryTypes.some((t) => t.includes('Polygon'))) return 'pill-polygon';
  if (layer.geometryTypes.some((t) => t.includes('LineString'))) return 'pill-line';
  if (layer.geometryTypes.some((t) => t.includes('Point'))) return 'pill-point';
  return 'pill-other';
}

interface SymbologyEditorProps {
  layer: LayerRecord;
  onStyle: (style: Partial<LayerStyle>) => void;
  onReset: () => void;
}

function SymbologyEditor({ layer, onStyle, onReset }: SymbologyEditorProps) {
  const stroke = parseHexColor(layer.style.strokeColor);
  const fill = parseHexColor(layer.style.fillColor);
  const shape = layer.style.pointShape ?? 'circle';
  const hasPoints = layer.geometryTypes.some((type) => type.includes('Point'));
  const hasLines = layer.geometryTypes.some((type) => type.includes('LineString'));
  const hasPolygons = layer.geometryTypes.some((type) => type.includes('Polygon'));
  const labelFields = layerFieldNames(layer);
  const labels = layer.style.labels ?? defaultLabelStyle(labelFields);

  return (
    <div className="sym-panel" onClick={(event) => event.stopPropagation()}>
      <div className="sym-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Palette size={12} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)' }}>
            Estilo e Simbologia
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost-sm"
          onClick={onReset}
          title="Restaurar estilo padrão desta camada"
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', fontSize: 10.5 }}
        >
          <RotateCcw size={11} />
          Restaurar
        </button>
      </div>

      {hasPoints && (
        <div className="sym-field sym-field-full">
          <label>Formato do ícone</label>
          <div className="shape-picker">
            {POINT_SHAPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`shape-btn ${shape === opt.value ? 'active' : ''}`}
                title={opt.label}
                onClick={() => onStyle({ pointShape: opt.value })}
              >
                <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden>
                  {shapeGlyph(opt.value, fill.hex, stroke.hex)}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasPoints && (
        <div className="sym-field sym-field-full">
          <div className="sym-field-header">
            <label htmlFor={`sym-size-${layer.id}`}>Tamanho do ícone</label>
            <span className="sym-badge-val">{layer.style.pointRadius} px</span>
          </div>
          <div className="sym-control">
            <input
              id={`sym-size-${layer.id}`}
              className="slider sym-slider"
              type="range"
              min={2}
              max={18}
              step={1}
              value={layer.style.pointRadius}
              onInput={(event) => onStyle({ pointRadius: Number((event.target as HTMLInputElement).value) })}
              onChange={(event) => onStyle({ pointRadius: Number(event.target.value) })}
            />
          </div>
        </div>
      )}

      <div className="sym-field">
        <label htmlFor={`sym-stroke-${layer.id}`}>
          {hasPoints && !hasLines && !hasPolygons ? 'Borda do ícone' : 'Cor do traço'}
        </label>
        <div className="sym-color-wrap">
          <input
            id={`sym-stroke-${layer.id}`}
            type="color"
            value={stroke.hex}
            onChange={(event) => onStyle({ strokeColor: withAlpha(event.target.value, stroke.alpha) })}
          />
          <span className="sym-color-label">{stroke.hex.toUpperCase()}</span>
        </div>
      </div>

      <div className="sym-field">
        <div className="sym-field-header">
          <label htmlFor={`sym-width-${layer.id}`}>Espessura</label>
          <span className="sym-badge-val">{layer.style.strokeWidth} px</span>
        </div>
        <div className="sym-control">
          <input
            id={`sym-width-${layer.id}`}
            className="slider sym-slider"
            type="range"
            min={0.5}
            max={6}
            step={0.5}
            value={layer.style.strokeWidth}
            onInput={(event) => onStyle({ strokeWidth: Number((event.target as HTMLInputElement).value) })}
            onChange={(event) => onStyle({ strokeWidth: Number(event.target.value) })}
          />
        </div>
      </div>

      {(hasPoints || hasPolygons) && (
        <>
          <div className="sym-field">
            <label htmlFor={`sym-fill-${layer.id}`}>Preenchimento</label>
            <div className="sym-color-wrap">
              <input
                id={`sym-fill-${layer.id}`}
                type="color"
                value={fill.hex}
                onChange={(event) => onStyle({ fillColor: withAlpha(event.target.value, fill.alpha) })}
              />
              <span className="sym-color-label">{fill.hex.toUpperCase()}</span>
            </div>
          </div>

          <div className="sym-field">
            <div className="sym-field-header">
              <label htmlFor={`sym-alpha-${layer.id}`}>Opacidade</label>
              <span className="sym-badge-val">{Math.round(fill.alpha * 100)}%</span>
            </div>
            <div className="sym-control">
              <input
                id={`sym-alpha-${layer.id}`}
                className="slider sym-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={fill.alpha}
                title={`Opacidade do preenchimento: ${Math.round(fill.alpha * 100)}%`}
                onInput={(event) =>
                  onStyle({ fillColor: withAlpha(fill.hex, Number((event.target as HTMLInputElement).value)) })
                }
                onChange={(event) =>
                  onStyle({ fillColor: withAlpha(fill.hex, Number(event.target.value)) })
                }
              />
            </div>
            <div className="sym-presets">
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`sym-preset-pill ${Math.abs(fill.alpha - pct) < 0.02 ? 'active' : ''}`}
                  onClick={() => onStyle({ fillColor: withAlpha(fill.hex, pct) })}
                  title={`Definir opacidade em ${Math.round(pct * 100)}%`}
                >
                  {Math.round(pct * 100)}%
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="sym-field sym-field-full">
        <label htmlFor={`sym-labels-${layer.id}`}>Rótulos</label>
        <label className="sym-check">
          <input
            id={`sym-labels-${layer.id}`}
            type="checkbox"
            checked={labels.enabled}
            onChange={(event) =>
              onStyle({
                labels: {
                  ...labels,
                  enabled: event.target.checked,
                  field: labels.field || labelFields[0] || '',
                },
              })
            }
          />
          Rotular feições desta camada
        </label>
      </div>

      {labels.enabled && (
        <div className="sym-field sym-field-full">
          <label htmlFor={`sym-field-${layer.id}`}>Campo do rótulo</label>
          <select
            id={`sym-field-${layer.id}`}
            value={labels.field}
            disabled={labelFields.length === 0}
            onChange={(event) =>
              onStyle({
                labels: {
                  ...labels,
                  field: event.target.value,
                },
              })
            }
          >
            {labelFields.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function LayerPanel() {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setActiveLayer = useAppStore((s) => s.setActiveLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const reorderLayer = useAppStore((s) => s.reorderLayer);
  const bringLayerToFront = useAppStore((s) => s.bringLayerToFront);
  const sendLayerToBack = useAppStore((s) => s.sendLayerToBack);
  const moveLayerNear = useAppStore((s) => s.moveLayerNear);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const openRightPanel = useAppStore((s) => s.openRightPanel);
  const setStatus = useAppStore((s) => s.setStatus);

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [joinTarget, setJoinTarget] = useState<string | null>(null);
  const [labelTarget, setLabelTarget] = useState<string | null>(null);

  // Reordenação por arrastar com o mouse
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'above' | 'below' } | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  // O menu é posicionado em coordenadas fixas: quando a camada fica na base do
  // painel, ele sairia da janela e ficaria cortado. Mede após a renderização e
  // recoloca o menu inteiro dentro da viewport (também ao redimensionar).
  useLayoutEffect(() => {
    if (!menu) return;
    const clamp = () => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const x = Math.min(
        Math.max(menu.x, margin),
        Math.max(margin, window.innerWidth - rect.width - margin),
      );
      const y = Math.min(
        Math.max(menu.y, margin),
        Math.max(margin, window.innerHeight - rect.height - margin),
      );
      if (x !== menu.x || y !== menu.y) setMenu((m) => (m ? { ...m, x, y } : m));
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [menu]);

  // Só libera o arrasto depois que o botão do mouse é solto: evita que a
  // camada seja arrastada sem que a alça tenha sido pressionada.
  useEffect(() => {
    if (!armedId) return;
    const release = () => setArmedId(null);
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  }, [armedId]);

  // Se não houver camadas: Onboarding Card moderno
  if (layers.length === 0) {
    return (
      <div className="layer-panel-empty-wrap">
        <div className="layer-empty-dropzone">
          <div className="layer-empty-icon-circle">
            <UploadCloud size={24} color="var(--accent)" />
          </div>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 4px', color: 'var(--text)' }}>
            Nenhuma camada carregada
          </h4>
          <p className="muted" style={{ margin: 0, fontSize: 11.5, textAlign: 'center', lineHeight: 1.45 }}>
            Arraste arquivos <strong>Shapefile</strong> (.shp), <strong>GeoJSON</strong>, <strong>GeoPackage</strong>{' '}
            (.gpkg) ou um projeto do <strong>QGIS</strong> (.qgs/.qgz) para o mapa, ou carregue um dos conjuntos de exemplo abaixo:
          </p>
        </div>

        <div className="layer-sample-quick-section">
          <div className="layer-sample-section-title">
            <Sparkles size={12} color="var(--accent)" />
            <span>Conjuntos de Amostra de Exemplo</span>
          </div>

          <button
            type="button"
            className="layer-sample-quick-card"
            onClick={() => loadSample('brasil-estados')}
          >
            <div className="layer-sample-dot" style={{ background: '#2563eb' }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>Brasil — Estados</div>
              <div className="muted" style={{ fontSize: 10.5 }}>27 Unidades da Federação com dados IBGE</div>
            </div>
          </button>

          <button
            type="button"
            className="layer-sample-quick-card"
            onClick={() => loadSample('paises-mundo')}
          >
            <div className="layer-sample-dot" style={{ background: '#059669' }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>Países do Mundo</div>
              <div className="muted" style={{ fontSize: 10.5 }}>177 países com fronteiras continentais</div>
            </div>
          </button>

          <button
            type="button"
            className="layer-sample-quick-card"
            onClick={() => loadSample('pontos-monitoramento')}
          >
            <div className="layer-sample-dot" style={{ background: '#d97706' }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>Pontos de Monitoramento</div>
              <div className="muted" style={{ fontSize: 10.5 }}>Estações sintéticas com leituras</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  const applyStyleTo = (layer: LayerRecord, patch: Partial<LayerStyle>) => {
    const style = { ...layer.style, ...patch };
    updateLayer(layer.id, { style });
    applyLayerStyle(layer.id, style);
  };

  const resetStyle = (layer: LayerRecord) => {
    const index = layers.findIndex((candidate) => candidate.id === layer.id);
    const style = { ...nextLayerStyle(index < 0 ? 0 : index), labels: layer.style.labels };
    updateLayer(layer.id, { style });
    applyLayerStyle(layer.id, style);
    setStatus(`Simbologia de "${layer.name}" restaurada`);
  };

  const openAttributeTable = (layer: LayerRecord) => {
    setActiveLayer(layer.id);
    setRightTab('attributes');
    openRightPanel();
    setMenu(null);
  };

  const centerOnLayer = (layer: LayerRecord) => {
    const features = getLayerSource(layer.id)?.getFeatures() ?? [];
    if (features.length === 0) {
      setStatus(`A camada "${layer.name}" não tem feições`);
      return;
    }
    zoomToFeatures(features);
    setStatus(`Centralizado em "${layer.name}"`);
  };

  // Alternar todas visíveis / invisíveis
  const allVisible = layers.every((l) => l.visible);
  const toggleAllVisibility = () => {
    const target = !allVisible;
    layers.forEach((l) => {
      updateLayer(l.id, { visible: target });
      applyLayerVisibility(l.id, target);
    });
    setStatus(target ? 'Todas as camadas estão visíveis' : 'Todas as camadas foram ocultadas');
  };

  const menuLayer = menu ? (layers.find((layer) => layer.id === menu.id) ?? null) : null;
  const menuLayerIndex = menuLayer ? layers.findIndex((layer) => layer.id === menuLayer.id) : -1;
  const reversed = [...layers].reverse();
  const filtered = search.trim()
    ? reversed.filter((l) => l.name.toLowerCase().includes(search.toLowerCase().trim()))
    : reversed;

  // ── Reordenação por arrastar com o mouse ──────────────────────────────
  const beginLayerDrag = (event: ReactDragEvent<HTMLDivElement>, layerId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', layerId);
    setDragId(layerId);
    setMenu(null);
  };

  const endLayerDrag = () => {
    setDragId(null);
    setDragOver(null);
    setArmedId(null);
  };

  const isFileDrag = (event: ReactDragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  const overLayerDrag = (event: ReactDragEvent<HTMLDivElement>, layerId: string) => {
    // Arrasto de arquivos continua sendo tratado pelo overlay global.
    if (!dragId || isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const pos: 'above' | 'below' = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    setDragOver((prev) =>
      prev && prev.id === layerId && prev.pos === pos ? prev : { id: layerId, pos },
    );
    // Auto-rolagem da lista enquanto o ponteiro está nas bordas.
    const list = listRef.current;
    if (list) {
      const bounds = list.getBoundingClientRect();
      if (event.clientY < bounds.top + 40) list.scrollTop -= 10;
      else if (event.clientY > bounds.bottom - 40) list.scrollTop += 10;
    }
  };

  const dropLayerOn = (event: ReactDragEvent<HTMLDivElement>, target: LayerRecord) => {
    if (!dragId || isFileDrag(event)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pos: 'above' | 'below' = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    if (dragId !== target.id) {
      const dragged = layers.find((l) => l.id === dragId);
      moveLayerNear(dragId, target.id, pos);
      refreshAllZIndexes();
      setStatus(`Camada "${dragged?.name ?? ''}" reposicionada na pilha`);
    }
    endLayerDrag();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Barra de Ações Rápidas do Painel de Camadas */}
      <div className="layer-panel-control-strip">
        <div className="layer-search-box">
          <Search size={13} color="var(--text-faint)" />
          <input
            type="text"
            placeholder="Filtrar camadas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="icon-btn"
            title={allVisible ? 'Ocultar todas as camadas' : 'Mostrar todas as camadas'}
            onClick={toggleAllVisibility}
          >
            {allVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Enquadrar todas as camadas no mapa"
            onClick={() => zoomToLayers(layers.map((l) => l.id))}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Lista de Camadas */}
      <div
        className="layer-list"
        ref={listRef}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(null);
        }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 12px' }}>
            Nenhuma camada corresponde a "{search}".
          </div>
        ) : (
          filtered.map((layer) => {
            const isActive = layer.id === activeLayerId;
            const isEditing = editingId === layer.id;
            const layerIndex = layers.findIndex((l) => l.id === layer.id);
            const canMoveUp = layerIndex < layers.length - 1;
            const canMoveDown = layerIndex > 0;

            return (
              <div
                key={layer.id}
                className={[
                  'layer-item',
                  isActive ? 'active' : '',
                  !layer.visible ? 'layer-hidden' : '',
                  dragId === layer.id ? 'dragging' : '',
                  dragOver && dragOver.id === layer.id ? `drop-${dragOver.pos}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={armedId === layer.id}
                onClick={() => {
                  setActiveLayer(layer.id);
                  setRightTab('attributes');
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ id: layer.id, x: event.clientX, y: event.clientY });
                }}
                onDragStart={(event) => {
                  if (armedId !== layer.id) {
                    event.preventDefault();
                    return;
                  }
                  beginLayerDrag(event, layer.id);
                }}
                onDragEnd={endLayerDrag}
                onDragOver={(event) => overLayerDrag(event, layer.id)}
                onDrop={(event) => dropLayerOn(event, layer)}
              >
                <div className="layer-primary-row">
                  <div
                    className="layer-drag-handle"
                    title="Arrastar para reordenar camada"
                    aria-label="Arrastar para reordenar a camada"
                    draggable={true}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      setArmedId(layer.id);
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      const card = (event.currentTarget as HTMLElement).closest('.layer-item') as HTMLElement | null;
                      if (card && event.dataTransfer.setDragImage) {
                        const rect = card.getBoundingClientRect();
                        event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
                      }
                      beginLayerDrag(event, layer.id);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <GripVertical size={13} />
                  </div>

                  <button
                    type="button"
                    className={`layer-swatch-btn ${isEditing ? 'editing' : ''}`}
                    title="Editar estilo de cor e traçado (simbologia)"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingId(editingId === layer.id ? null : layer.id);
                    }}
                  >
                    <span style={{ opacity: layer.visible ? 1 : 0.35, display: 'grid' }}>
                      {layerGlyph(layer)}
                    </span>
                  </button>

                  <div className="layer-name" title={layer.name}>
                    {layer.name}
                  </div>

                  {/* Ações principais do topo da linha */}
                  <div className="layer-top-actions">
                    <button
                      type="button"
                      className={`layer-action-btn ${layer.visible ? 'active' : 'dimmed'}`}
                      title={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
                      onClick={(event) => {
                        event.stopPropagation();
                        const visible = !layer.visible;
                        updateLayer(layer.id, { visible });
                        applyLayerVisibility(layer.id, visible);
                      }}
                    >
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} color="var(--text-faint)" />}
                    </button>

                    <button
                      type="button"
                      className="layer-action-btn"
                      title="Mais opções da camada"
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenu({ id: layer.id, x: rect.left, y: rect.bottom + 4 });
                      }}
                    >
                      <MoreVertical size={13} />
                    </button>
                  </div>
                </div>

                {/* Segunda linha: Metadados da camada e ações secundárias (Mover / Centralizar) */}
                <div className="layer-secondary-row">
                  <div className="layer-sub-tag">
                    <span className={`layer-geom-pill ${geometryPillClass(layer)}`}>
                      {geometrySummary(layer)}
                    </span>
                    {layer.kind && (
                      <span className="layer-kind-pill">
                        {kindBadge[layer.kind] ?? layer.kind.toUpperCase()}
                      </span>
                    )}
                    <span>·</span>
                    <span className="layer-count-text">{layer.featureCount.toLocaleString('pt-BR')} feições</span>
                    {layer.join && <span className="layer-join-pill" title="Tabela externa associada">🔗</span>}
                  </div>

                  <div className="layer-secondary-actions">
                    <button
                      type="button"
                      className="layer-action-btn layer-btn-sub"
                      disabled={!canMoveUp}
                      title={canMoveUp ? 'Mover camada para cima (trazer para frente)' : 'Camada já está no topo'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canMoveUp) return;
                        reorderLayer(layer.id, 1);
                        refreshAllZIndexes();
                        setStatus(`Camada "${layer.name}" movida para cima`);
                      }}
                    >
                      <ArrowUp size={12} />
                    </button>

                    <button
                      type="button"
                      className="layer-action-btn layer-btn-sub"
                      disabled={!canMoveDown}
                      title={canMoveDown ? 'Mover camada para baixo (enviar para trás)' : 'Camada já está no fundo'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canMoveDown) return;
                        reorderLayer(layer.id, -1);
                        refreshAllZIndexes();
                        setStatus(`Camada "${layer.name}" movida para baixo`);
                      }}
                    >
                      <ArrowDown size={12} />
                    </button>

                    <button
                      type="button"
                      className="layer-action-btn layer-btn-sub"
                      title="Centralizar nesta camada no mapa"
                      onClick={(event) => {
                        event.stopPropagation();
                        centerOnLayer(layer);
                      }}
                    >
                      <Crosshair size={12} />
                    </button>
                  </div>
                </div>

                {editingId === layer.id && (
                  <SymbologyEditor
                    layer={layer}
                    onStyle={(patch) => applyStyleTo(layer, patch)}
                    onReset={() => resetStyle(layer)}
                  />
                )}

                {/* Painel inferior do card ativo: opacidade */}
                {isActive && (
                  <div className="layer-card-footer" onClick={(e) => e.stopPropagation()}>
                    {/* Slider de Opacidade no card ativo */}
                    <div className="layer-opacity-strip">
                      <div className="layer-opacity-header">
                        <span className="layer-strip-label">Opacidade:</span>
                        <span className="layer-opacity-val">{Math.round(layer.opacity * 100)}%</span>
                      </div>
                      <div className="layer-opacity-row">
                        <input
                          className="slider sym-slider"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={layer.opacity}
                          title={`Opacidade: ${Math.round(layer.opacity * 100)}%`}
                          onInput={(event) => {
                            const opacity = Number((event.target as HTMLInputElement).value);
                            updateLayer(layer.id, { opacity });
                            applyLayerOpacity(layer.id, opacity);
                          }}
                          onChange={(event) => {
                            const opacity = Number(event.target.value);
                            updateLayer(layer.id, { opacity });
                            applyLayerOpacity(layer.id, opacity);
                          }}
                        />
                        <div className="layer-quick-opacity">
                          {[0, 0.5, 1].map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`layer-opacity-preset ${Math.abs(layer.opacity - p) < 0.03 ? 'active' : ''}`}
                              title={`Definir opacidade em ${Math.round(p * 100)}%`}
                              onClick={() => {
                                updateLayer(layer.id, { opacity: p });
                                applyLayerOpacity(layer.id, p);
                              }}
                            >
                              {Math.round(p * 100)}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {layer.error && (
                  <div className="notice error" style={{ marginTop: 8, marginBottom: 0 }}>
                    {layer.error}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Menu de Contexto da Camada */}
      {menu && menuLayer && (
        <div
          className="ctx-menu"
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="ctx-header-title">{menuLayer.name}</div>
          <button type="button" className="ctx-item" onClick={() => openAttributeTable(menuLayer)}>
            <Table2 size={13} />
            Tabela de Atributos
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              setLabelTarget(menuLayer.id);
              setMenu(null);
            }}
          >
            <Type size={13} />
            Rótulos e Texto
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              setJoinTarget(menuLayer.id);
              setMenu(null);
            }}
          >
            <Link2 size={13} />
            Ligar Dados (Join / Relate)
          </button>
          {menuLayer.join && (
            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                removeTableJoin(menuLayer.id);
                setMenu(null);
              }}
            >
              <Unlink size={13} />
              Remover Ligação de Tabela
            </button>
          )}

          <div className="ctx-sep" />

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              setMenu(null);
              try {
                exportLayerGeoJSON(menuLayer.id);
                setStatus(`Camada "${menuLayer.name}" salva com sucesso`);
              } catch (err) {
                setStatus(`Falha ao salvar camada: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <Save size={13} />
            Salvar Camada (GeoJSON)
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              setMenu(null);
              try {
                exportLayerGeoJSON(menuLayer.id);
                setStatus(`Camada "${menuLayer.name}" salva com sucesso`);
              } catch (err) {
                setStatus(`Falha ao salvar camada: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <SaveAll size={13} />
            Salvar Camada Como...
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={async () => {
              try {
                setStatus('Exportando para Excel…');
                setMenu(null);
                await exportLayerExcel(menuLayer.id);
                setStatus(`Camada "${menuLayer.name}" exportada para Excel (.xlsx)`);
              } catch (err) {
                setStatus(`Falha ao exportar Excel: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <FileSpreadsheet size={13} />
            Exportar para Excel (.xlsx)
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={async () => {
              try {
                setStatus('Exportando para KMZ…');
                setMenu(null);
                await exportLayerKML(menuLayer.id, 'kmz');
                setStatus(`Camada "${menuLayer.name}" exportada para KMZ`);
              } catch (err) {
                setStatus(`Falha ao exportar KMZ: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <Globe size={13} />
            Exportar para Google Earth (KMZ)
          </button>

          <div className="ctx-sep" />

          <button
            type="button"
            className="ctx-item"
            disabled={menuLayerIndex < 0 || menuLayerIndex >= layers.length - 1}
            onClick={() => {
              bringLayerToFront(menuLayer.id);
              refreshAllZIndexes();
              setStatus(`Camada "${menuLayer.name}" enviada para o topo`);
              setMenu(null);
            }}
          >
            <ChevronsUp size={13} />
            Trazer para o Topo
          </button>
          <button
            type="button"
            className="ctx-item"
            disabled={menuLayerIndex < 0 || menuLayerIndex >= layers.length - 1}
            onClick={() => {
              reorderLayer(menuLayer.id, 1);
              refreshAllZIndexes();
              setStatus(`Camada "${menuLayer.name}" movida para cima`);
              setMenu(null);
            }}
          >
            <ArrowUp size={13} />
            Mover para Cima
          </button>
          <button
            type="button"
            className="ctx-item"
            disabled={menuLayerIndex <= 0}
            onClick={() => {
              reorderLayer(menuLayer.id, -1);
              refreshAllZIndexes();
              setStatus(`Camada "${menuLayer.name}" movida para baixo`);
              setMenu(null);
            }}
          >
            <ArrowDown size={13} />
            Mover para Baixo
          </button>
          <button
            type="button"
            className="ctx-item"
            disabled={menuLayerIndex <= 0}
            onClick={() => {
              sendLayerToBack(menuLayer.id);
              refreshAllZIndexes();
              setStatus(`Camada "${menuLayer.name}" enviada para o fundo`);
              setMenu(null);
            }}
          >
            <ChevronsDown size={13} />
            Enviar para o Fundo
          </button>

          <div className="ctx-sep" />

          <button
            type="button"
            className="ctx-item danger"
            onClick={() => {
              removeLayerEverywhere(menuLayer.id);
              setStatus(`Camada "${menuLayer.name}" removida`);
              setMenu(null);
            }}
          >
            <Trash2 size={13} />
            Remover Camada
          </button>
        </div>
      )}

      {/* Modais de Rótulo e Join */}
      {labelTarget && (
        <LabelDialog layerId={labelTarget} onClose={() => setLabelTarget(null)} />
      )}
      {joinTarget && (
        <JoinDialog layerId={joinTarget} onClose={() => setJoinTarget(null)} />
      )}
    </div>
  );
}
