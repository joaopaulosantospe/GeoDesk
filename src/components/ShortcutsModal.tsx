import { Keyboard, X, MousePointer, MousePointerClick, Ruler, SquareDashedMousePointer, Layers, ZoomIn, Save, SaveAll, Compass, Power } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'Ctrl + S', label: 'Salvar Projeto', desc: 'Salva o projeto atual com todas as camadas, estilos e visão do mapa em .geodesk', icon: Save },
  { key: 'Ctrl + Shift + S', label: 'Salvar Projeto Como', desc: 'Define um novo nome para salvar o projeto cartográfico atual', icon: SaveAll },
  { key: 'V', label: 'Navegar / Modo Cursor', desc: 'Desativa medições e permite navegar e selecionar livremente no mapa', icon: MousePointer },
  { key: 'I', label: 'Identificar Feição', desc: 'Clique em qualquer feição para ver seus atributos detalhados', icon: MousePointerClick },
  { key: 'D', label: 'Medir Distância', desc: 'Clique no mapa para traçar segmentos; clique duas vezes para finalizar', icon: Ruler },
  { key: 'A', label: 'Medir Área', desc: 'Trace um polígono para calcular área em hectares, km² e m²', icon: SquareDashedMousePointer },
  { key: 'B', label: 'Gerar Buffer', desc: 'Abre a ferramenta de zona de amortecimento para a camada ativa', icon: Layers },
  { key: 'S', label: 'Google Street View 360°', desc: 'Clique em qualquer via ou ponto no mapa para ver imagens panorâmicas 360°', icon: Compass },
  { key: 'Shift + Scroll', label: 'Zoom de Alta Precisão', desc: 'Ajuste suave e contínuo de escala no mapa', icon: ZoomIn },
  { key: 'Alt + F4', label: 'Fechar Sistema', desc: 'Encerra o GeoDesk e todos os seus processos', icon: Power },
  { key: 'Esc', label: 'Cancelar / Fechar', desc: 'Cancela a medição em andamento ou fecha modais abertos', icon: X },
];

export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <Keyboard size={16} color="var(--accent)" />
          <strong>Atalhos de Teclado e Navegação</strong>
          <button type="button" className="icon-btn" onClick={onClose} title="Fechar">
            <X size={14} />
          </button>
        </div>

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          GeoDesk foi projetado para operações ágeis de geoprocessamento. Utilize os atalhos abaixo para alternar ferramentas instantaneamente:
        </p>

        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  background: 'var(--bg-2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-soft)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 54,
                    padding: '3px 8px',
                    background: '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: 11.5,
                    color: 'var(--accent)',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  {s.key}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12 }}>
                    <Icon size={13} color="var(--text-muted)" />
                    <span>{s.label}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                    {s.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
