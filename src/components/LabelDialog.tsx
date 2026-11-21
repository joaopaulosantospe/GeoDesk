import { useRef, useState } from 'react';
import { Type, X } from 'lucide-react';
import { applyLayerStyle, getLayerSource } from '../map/mapContext';
import { useAppStore } from '../store';
import {
  LABEL_FONTS,
  LABEL_PRESETS,
  LABEL_SIZES,
  defaultLabelStyle,
  fontFamilyName,
  fontStack,
  layerFieldNames,
  parseHexColor,
} from '../labels';
import type { LabelPlacement, LabelStyle, LayerRecord, LayerStyle } from '../types';

/** Rascunho editável do diálogo (espelha LabelStyle). */
interface LabelDraft {
  enabled: boolean;
  field: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  haloColor: string;
  haloWidth: number;
  placement: LabelPlacement;
}

function sampleProperties(layer?: LayerRecord): Record<string, unknown> | undefined {
  return layer ? getLayerSource(layer.id)?.getFeatures()[0]?.getProperties() : undefined;
}

function readDraft(layer?: LayerRecord): LabelDraft {
  const fields = layer ? layerFieldNames(layer, sampleProperties(layer)) : [];
  const defaults = defaultLabelStyle(fields);
  const labels = layer?.style.labels;
  return {
    enabled: labels?.enabled ?? defaults.enabled,
    field: labels?.field || fields[0] || '',
    color: parseHexColor(labels?.color ?? defaults.color).hex,
    fontFamily: fontFamilyName(labels?.fontFamily ?? defaults.fontFamily),
    fontSize: labels?.fontSize ?? defaults.fontSize,
    bold: labels?.bold === true,
    italic: labels?.italic === true,
    haloColor: parseHexColor(labels?.haloColor ?? 'rgba(255, 255, 255, 0.92)').hex,
    haloWidth: labels?.haloWidth ?? 3,
    placement: labels?.placement ?? defaults.placement ?? 'top',
  };
}

/**
 * Diálogo "Rótulos" da Propriedades da Camada do ArcMap: ativar rótulos,
 * campo, fonte/tamanho/cor, negrito/itálico e máscara, com OK/Cancelar/Aplicar.
 */
export default function LabelDialog({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const layer = useAppStore((state) => state.layers.find((candidate) => candidate.id === layerId));
  const updateLayer = useAppStore((state) => state.updateLayer);
  const setStatus = useAppStore((state) => state.setStatus);
  const [draft, setDraft] = useState<LabelDraft>(() => readDraft(layer));
  const [applied, setApplied] = useState<LabelDraft>(() => readDraft(layer));
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState(false);

  // Janela arrastável para o usuário conseguir ver o mapa enquanto ajusta os rótulos
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: dragOffset.x,
      initY: dragOffset.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setDragOffset({
      x: dragStartRef.current.initX + dx,
      y: dragStartRef.current.initY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignora se já liberado
      }
    }
  };

  if (!layer) return null;
  const current: LayerRecord = layer;

  const fields = layerFieldNames(current, sampleProperties(current));
  const font = fontFamilyName(draft.fontFamily);
  const fonts = LABEL_FONTS.includes(font) ? LABEL_FONTS : [font, ...LABEL_FONTS];

  const commit = (next: LabelDraft): void => {
    const labels: LabelStyle = { ...next };
    const target = useAppStore.getState().layers.find((l) => l.id === layerId) ?? current;
    const style: LayerStyle = { ...target.style, labels };
    updateLayer(target.id, { style });
    applyLayerStyle(target.id, style);
  };

  const apply = (): void => {
    commit(draft);
    setApplied(draft);
    setStatus(`Rótulos de "${current.name}" aplicados no mapa`);
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2200);
  };

  const confirm = (): void => {
    commit(draft);
    setApplied(draft);
    setStatus(`Rótulos de "${current.name}" atualizados`);
    onClose();
  };

  const cancel = (): void => {
    // Desfaz o que foi alterado desde a última aplicação.
    if (JSON.stringify(draft) !== JSON.stringify(applied)) commit(applied);
    onClose();
  };

  return (
    <div className="modal-overlay lbl-modal-overlay" onClick={onClose}>
      <div
        className="modal lbl-modal"
        style={
          dragOffset.x !== 0 || dragOffset.y !== 0
            ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="modal-title draggable"
          title="Arraste para mover a janela e ver o mapa"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <Type size={15} />
          <strong>Rótulos — {layer.name}</strong>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <label className="lbl-enable">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          Rotular feições nesta camada
        </label>

        <div className="lbl-method">
          <span className="lbl-caption">Método:</span>
          <select value="same" aria-label="Método de rotulagem" disabled>
            <option value="same">Rotular as feições do mesmo modo.</option>
          </select>
        </div>

        <p className="lbl-hint">
          Todas as feições serão rotuladas utilizando as opções especificadas.
        </p>

        <fieldset className="lbl-group">
          <legend>Sequência de Texto</legend>
          <div className="lbl-row">
            <label htmlFor="lbl-field">Campo do Rótulo:</label>
            <select
              id="lbl-field"
              className="lbl-field"
              value={draft.field}
              onChange={(event) => setDraft({ ...draft, field: event.target.value })}
            >
              {fields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
            <button type="button" className="btn" disabled title="Em breve">
              Expressão…
            </button>
          </div>
        </fieldset>

        <fieldset className="lbl-group">
          <legend>Símbolo do Texto</legend>
          <div className="lbl-row">
            <select
              id="lbl-font"
              aria-label="Fonte"
              value={font}
              onChange={(event) => setDraft({ ...draft, fontFamily: event.target.value })}
            >
              {fonts.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            <select
              id="lbl-size"
              aria-label="Tamanho da fonte"
              value={draft.fontSize}
              onChange={(event) => setDraft({ ...draft, fontSize: Number(event.target.value) })}
            >
              {LABEL_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <input
              id="lbl-color"
              type="color"
              aria-label="Cor do texto"
              value={parseHexColor(draft.color).hex}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
            <button
              type="button"
              className={`lbl-style ${draft.bold ? 'active' : ''}`}
              title="Negrito"
              aria-pressed={draft.bold}
              onClick={() => setDraft({ ...draft, bold: !draft.bold })}
            >
              B
            </button>
            <button
              type="button"
              className={`lbl-style italic ${draft.italic ? 'active' : ''}`}
              title="Itálico"
              aria-pressed={draft.italic}
              onClick={() => setDraft({ ...draft, italic: !draft.italic })}
            >
              I
            </button>
            <button
              type="button"
              className="lbl-style underline"
              title="Sublinhado não é suportado pelo renderizador"
              disabled
            >
              U
            </button>
            <button
              type="button"
              className="btn"
              aria-expanded={symbolOpen}
              onClick={() => setSymbolOpen((open) => !open)}
            >
              Símbolo…
            </button>
          </div>
          {symbolOpen && (
            <div className="lbl-row lbl-symbol-row">
              <span className="lbl-caption">Máscara:</span>
              <input
                id="lbl-halo-color"
                type="color"
                aria-label="Cor da máscara"
                value={parseHexColor(draft.haloColor).hex}
                onChange={(event) => setDraft({ ...draft, haloColor: event.target.value })}
              />
              <label htmlFor="lbl-halo-width">Espessura:</label>
              <select
                id="lbl-halo-width"
                value={draft.haloWidth}
                onChange={(event) => setDraft({ ...draft, haloWidth: Number(event.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((width) => (
                  <option key={width} value={width}>
                    {width}
                  </option>
                ))}
              </select>
              <span className="muted">contorno ao redor do texto para leitura</span>
            </div>
          )}
        </fieldset>

        <div className="lbl-cols">
          <fieldset className="lbl-group">
            <legend>Posição do Rótulo</legend>
            <div className="lbl-row">
              <label htmlFor="lbl-placement">Posição:</label>
              <select
                id="lbl-placement"
                className="lbl-field"
                value={draft.placement}
                onChange={(event) =>
                  setDraft({ ...draft, placement: event.target.value as LabelPlacement })
                }
              >
                <option value="top">Acima do ponto (Padrão)</option>
                <option value="right">Ao lado direito do ponto</option>
                <option value="left">Ao lado esquerdo do ponto</option>
                <option value="bottom">Abaixo do ponto</option>
                <option value="top-right">Superior direito</option>
                <option value="top-left">Superior esquerdo</option>
                <option value="bottom-right">Inferior direito</option>
                <option value="bottom-left">Inferior esquerdo</option>
                <option value="center">Centralizado sobre o ponto</option>
              </select>
            </div>
            <div className="lbl-placement-grid" title="Clique para escolher a posição do rótulo">
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'top-left' ? 'active' : ''}`}
                title="Superior esquerdo"
                onClick={() => setDraft({ ...draft, placement: 'top-left' })}
              >
                ↖
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'top' ? 'active' : ''}`}
                title="Acima do ponto (Padrão)"
                onClick={() => setDraft({ ...draft, placement: 'top' })}
              >
                ↑
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'top-right' ? 'active' : ''}`}
                title="Superior direito"
                onClick={() => setDraft({ ...draft, placement: 'top-right' })}
              >
                ↗
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'left' ? 'active' : ''}`}
                title="Ao lado esquerdo"
                onClick={() => setDraft({ ...draft, placement: 'left' })}
              >
                ←
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'center' ? 'active' : ''}`}
                title="Centralizado sobre o ponto"
                onClick={() => setDraft({ ...draft, placement: 'center' })}
              >
                •
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'right' ? 'active' : ''}`}
                title="Ao lado direito"
                onClick={() => setDraft({ ...draft, placement: 'right' })}
              >
                →
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'bottom-left' ? 'active' : ''}`}
                title="Inferior esquerdo"
                onClick={() => setDraft({ ...draft, placement: 'bottom-left' })}
              >
                ↙
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'bottom' ? 'active' : ''}`}
                title="Abaixo do ponto"
                onClick={() => setDraft({ ...draft, placement: 'bottom' })}
              >
                ↓
              </button>
              <button
                type="button"
                className={`lbl-placement-btn ${draft.placement === 'bottom-right' ? 'active' : ''}`}
                title="Inferior direito"
                onClick={() => setDraft({ ...draft, placement: 'bottom-right' })}
              >
                ↘
              </button>
            </div>
          </fieldset>

          <fieldset className="lbl-group">
            <legend>Estilo de Rótulo Pré-definido</legend>
            <div className="lbl-row">
              <button
                type="button"
                className="btn"
                aria-expanded={presetsOpen}
                onClick={() => setPresetsOpen((open) => !open)}
              >
                Estilos do Rótulo…
              </button>
            </div>
            {presetsOpen && (
              <div className="lbl-presets">
                {LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="lbl-preset"
                    onClick={() => {
                      setDraft((current) => ({ ...current, ...preset.style }));
                      setPresetsOpen(false);
                    }}
                  >
                    <span
                      className="lbl-preset-aa"
                      style={{
                        fontFamily: fontStack(preset.style.fontFamily),
                        fontSize: Math.max(10, Math.min(14, preset.style.fontSize)),
                        fontWeight: preset.style.bold ? 700 : 400,
                        fontStyle: preset.style.italic ? 'italic' : 'normal',
                        color: preset.style.color,
                      }}
                    >
                      Aa
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={confirm}>
            OK
          </button>
          <button type="button" className="btn" onClick={cancel}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${appliedFeedback ? 'success-feedback' : ''}`}
            onClick={apply}
            title="Aplica as configurações e atualiza o mapa imediatamente"
          >
            {appliedFeedback ? '✓ Rótulos Aplicados!' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
