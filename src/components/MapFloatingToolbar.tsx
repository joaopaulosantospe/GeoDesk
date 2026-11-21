import { useState, useRef, useEffect } from 'react';
import {
  CircleDashed,
  Combine,
  Globe2,
  LayoutGrid,
  Maximize2,
  MousePointer,
  MousePointerClick,
  Ruler,
  SquareDashedMousePointer,
  X,
  Map as MapIcon,
  Check,
} from 'lucide-react';
import { useAppStore } from '../store';
import { basemaps } from '../map/basemaps';
import { zoomToLayers } from '../map/mapContext';
import type { BasemapId, ToolId } from '../types';

export default function MapFloatingToolbar() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemap = useAppStore((s) => s.setBasemap);
  const layers = useAppStore((s) => s.layers);
  const [basemapOpen, setBasemapOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown do basemap ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setBasemapOpen(false);
      }
    }
    if (basemapOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [basemapOpen]);

  // Teclas de atalho no teclado (V, I, D, A, B, Esc)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignora atalhos se o foco estiver em um input ou textarea
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        setTool(null);
        setBasemapOpen(false);
      } else if (e.key === 'v' || e.key === 'V') {
        setTool(null);
      } else if (e.key === 'i' || e.key === 'I') {
        setTool('identify');
      } else if (e.key === 'd' || e.key === 'D') {
        setTool('measure-distance');
      } else if (e.key === 'a' || e.key === 'A') {
        setTool('measure-area');
      } else if (e.key === 'b' || e.key === 'B') {
        setRightTab('analysis');
        setTool('buffer');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTool, setRightTab]);

  const handleZoomExtent = () => {
    if (layers.length > 0) {
      zoomToLayers(layers.map((l) => l.id));
    }
  };

  const currentBasemapDef = basemaps.find((b) => b.id === basemapId);

  return (
    <div className="map-hud-toolbar">
      {/* Botão Navegar / Modo Normal */}
      <button
        type="button"
        className={`hud-btn ${tool === null ? 'active' : ''}`}
        title="Modo Navegar / Cursor (V)"
        onClick={() => setTool(null)}
      >
        <MousePointer size={15} />
        <span className="hud-btn-text">Navegar</span>
      </button>

      {/* Identificar */}
      <button
        type="button"
        className={`hud-btn ${tool === 'identify' ? 'active' : ''}`}
        title="Identificar Feições no Mapa (I)"
        onClick={() => setTool(tool === 'identify' ? null : 'identify')}
      >
        <MousePointerClick size={15} />
        <span className="hud-btn-text">Identificar</span>
      </button>

      {/* Medir Distância */}
      <button
        type="button"
        className={`hud-btn ${tool === 'measure-distance' ? 'active' : ''}`}
        title="Medir Distância Linear (D)"
        onClick={() => setTool(tool === 'measure-distance' ? null : 'measure-distance')}
      >
        <Ruler size={15} />
        <span className="hud-btn-text">Distância</span>
      </button>

      {/* Medir Área */}
      <button
        type="button"
        className={`hud-btn ${tool === 'measure-area' ? 'active' : ''}`}
        title="Medir Área Poligonal (A)"
        onClick={() => setTool(tool === 'measure-area' ? null : 'measure-area')}
      >
        <CircleDashed size={15} />
        <span className="hud-btn-text">Área</span>
      </button>

      <div className="hud-sep" />

      {/* Geoprocessamento: Buffer */}
      <button
        type="button"
        className={`hud-btn ${tool === 'buffer' ? 'active' : ''}`}
        title="Gerar Zona de Amortecimento / Buffer (B)"
        onClick={() => {
          setRightTab('analysis');
          setTool('buffer');
        }}
      >
        <SquareDashedMousePointer size={15} />
        <span className="hud-btn-text">Buffer</span>
      </button>

      {/* Geoprocessamento: Interseção */}
      <button
        type="button"
        className={`hud-btn ${tool === 'intersect' ? 'active' : ''}`}
        title="Interseção entre Camadas"
        onClick={() => {
          setRightTab('analysis');
          setTool('intersect');
        }}
      >
        <Combine size={15} />
        <span className="hud-btn-text">Interseção</span>
      </button>

      {/* Geoprocessamento: Grade */}
      <button
        type="button"
        className={`hud-btn ${tool === 'grid' ? 'active' : ''}`}
        title="Criar Grade / Quadícula Cartográfica"
        onClick={() => {
          setRightTab('analysis');
          setTool('grid');
        }}
      >
        <LayoutGrid size={15} />
        <span className="hud-btn-text">Grade</span>
      </button>

      <div className="hud-sep" />

      {/* Seletor de Mapa Base */}
      <div className="hud-dropdown-wrap" ref={menuRef}>
        <button
          type="button"
          className={`hud-btn ${basemapOpen ? 'active' : ''}`}
          title="Alternar Mapa Base de Fundo"
          onClick={() => setBasemapOpen(!basemapOpen)}
        >
          <MapIcon size={14} />
          <span className="hud-btn-text">{currentBasemapDef?.label ?? 'Mapa Base'}</span>
        </button>

        {basemapOpen && (
          <div className="hud-dropdown-menu">
            <div className="hud-dropdown-header">Escolha o Mapa Base</div>
            {basemaps.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`hud-dropdown-item ${basemapId === b.id ? 'active' : ''}`}
                onClick={() => {
                  setBasemap(b.id);
                  setBasemapOpen(false);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe2 size={13} color={basemapId === b.id ? 'var(--accent)' : 'var(--text-faint)'} />
                  <span>{b.label}</span>
                  {b.online && <span className="hud-badge-online">Online</span>}
                </div>
                {basemapId === b.id && <Check size={14} color="var(--accent)" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zoom na Extensão de todas as camadas */}
      <button
        type="button"
        className="hud-btn"
        title="Enquadrar todas as camadas carregadas"
        disabled={layers.length === 0}
        onClick={handleZoomExtent}
      >
        <Maximize2 size={14} />
      </button>

      {/* Indicador de ferramenta ativa com botão para cancelar */}
      {tool !== null && (
        <button
          type="button"
          className="hud-cancel-btn"
          title="Desativar ferramenta atual (Esc)"
          onClick={() => setTool(null)}
        >
          <X size={13} />
          <span>Cancelar</span>
        </button>
      )}
    </div>
  );
}
