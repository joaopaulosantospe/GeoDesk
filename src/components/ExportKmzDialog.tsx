import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Globe, Square, X } from 'lucide-react';
import { useAppStore } from '../store';
import { exportLayerKML, exportSelectedLayersKML } from '../export/kmlExport';
import type { LayerRecord } from '../types';

interface ExportKmzDialogProps {
  onClose: () => void;
}

export default function ExportKmzDialog({ onClose }: ExportKmzDialogProps) {
  const layers = useAppStore((state) => state.layers);
  const activeLayerId = useAppStore((state) => state.activeLayerId);
  const setStatus = useAppStore((state) => state.setStatus);

  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const [selectedSingleId, setSelectedSingleId] = useState<string>(
    activeLayerId || (layers[0]?.id ?? ''),
  );
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>(
    layers.map((l) => l.id),
  );
  const [format, setFormat] = useState<'kmz' | 'kml'>('kmz');
  const [busy, setBusy] = useState(false);

  const toggleMulti = (id: string) => {
    setSelectedMultiIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => setSelectedMultiIds(layers.map((l) => l.id));
  const deselectAll = () => setSelectedMultiIds([]);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (mode === 'single') {
        const layer = layers.find((l) => l.id === selectedSingleId);
        if (!layer) throw new Error('Selecione uma camada para exportar');
        setStatus(`Exportando camada "${layer.name}" para ${format.toUpperCase()}…`);
        await exportLayerKML(layer.id, format);
        setStatus(`Camada "${layer.name}" exportada com sucesso (.${format})`);
      } else {
        if (selectedMultiIds.length === 0) {
          throw new Error('Selecione pelo menos uma camada para exportar');
        }
        setStatus(`Exportando ${selectedMultiIds.length} camada(s) para ${format.toUpperCase()}…`);
        await exportSelectedLayersKML(selectedMultiIds, format);
        setStatus(`Camadas exportadas com sucesso para ${format.toUpperCase()} (.${format})`);
      }
      onClose();
    } catch (err) {
      setStatus(`Falha ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 480, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <Globe size={16} />
          <strong>Exportar para Google Earth (KML / KMZ)</strong>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {layers.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 12px' }}>
            Nenhuma camada carregada no momento para exportar.
          </div>
        ) : (
          <>
            {/* Alternador de Modo: Uma Camada ou Múltiplas */}
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg-0)', padding: 4, borderRadius: 'var(--radius-sm)' }}>
              <button
                type="button"
                className={`btn ${mode === 'single' ? 'primary' : ''}`}
                style={{ flex: 1, padding: '6px 12px', fontSize: 12 }}
                onClick={() => setMode('single')}
              >
                Camada Específica
              </button>
              <button
                type="button"
                className={`btn ${mode === 'multiple' ? 'primary' : ''}`}
                style={{ flex: 1, padding: '6px 12px', fontSize: 12 }}
                onClick={() => setMode('multiple')}
              >
                Múltiplas Camadas / Todas
              </button>
            </div>

            {/* Modo Camada Única */}
            {mode === 'single' ? (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                  Selecione a camada que deseja exportar:
                </label>
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-0)',
                  }}
                >
                  {layers.map((layer: LayerRecord) => {
                    const isSelected = selectedSingleId === layer.id;
                    return (
                      <div
                        key={layer.id}
                        onClick={() => setSelectedSingleId(layer.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                          borderBottom: '1px solid var(--border-soft)',
                          transition: 'background 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="single-layer"
                          checked={isSelected}
                          onChange={() => setSelectedSingleId(layer.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: layer.style.strokeColor || '#38bdf8',
                            boxShadow: `0 0 6px ${layer.style.strokeColor || '#38bdf8'}80`,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400, fontSize: 12.5 }}>
                          {layer.name}
                        </span>
                        <span className="badge" style={{ fontSize: 11 }}>
                          {layer.featureCount} feições
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Modo Múltiplas Camadas */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                    Selecione as camadas para compor o KML:
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}
                      onClick={selectAll}
                    >
                      Todas
                    </button>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <button
                      type="button"
                      style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={deselectAll}
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-0)',
                  }}
                >
                  {layers.map((layer: LayerRecord) => {
                    const isChecked = selectedMultiIds.includes(layer.id);
                    return (
                      <div
                        key={layer.id}
                        onClick={() => toggleMulti(layer.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isChecked ? 'var(--accent-subtle)' : 'transparent',
                          borderBottom: '1px solid var(--border-soft)',
                          transition: 'background 0.15s',
                        }}
                      >
                        {isChecked ? (
                          <CheckSquare size={16} color="var(--accent)" />
                        ) : (
                          <Square size={16} color="var(--text-faint)" />
                        )}
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: layer.style.strokeColor || 'var(--accent)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, fontWeight: isChecked ? 600 : 400, fontSize: 12.5 }}>
                          {layer.name}
                        </span>
                        <span className="badge" style={{ fontSize: 11 }}>
                          {layer.featureCount} feições
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Formato do Arquivo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Formato do arquivo:
              </label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                  <input
                    type="radio"
                    name="format"
                    value="kmz"
                    checked={format === 'kmz'}
                    onChange={() => setFormat('kmz')}
                  />
                  <span>
                    <strong>KMZ (.kmz)</strong> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>— Padrão comprimido</span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                  <input
                    type="radio"
                    name="format"
                    value="kml"
                    checked={format === 'kml'}
                    onChange={() => setFormat('kml')}
                  />
                  <span>
                    <strong>KML (.kml)</strong> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>— Texto aberto</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Rodapé com botões de Ação */}
            <div className="modal-actions" style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleExport}
                disabled={busy || (mode === 'multiple' && selectedMultiIds.length === 0)}
              >
                {busy ? 'Exportando…' : `Exportar (${format.toUpperCase()})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
