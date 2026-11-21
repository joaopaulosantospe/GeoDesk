import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';

interface SaveAsDialogProps {
  currentName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

export default function SaveAsDialog({ currentName, onSave, onClose }: SaveAsDialogProps) {
  const [name, setName] = useState(currentName.replace(/\.geodesk$/i, ''));

  useEffect(() => {
    setName(currentName.replace(/\.geodesk$/i, ''));
  }, [currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    onSave(clean);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <Save size={16} color="var(--accent)" />
          <strong>Salvar Projeto Como</strong>
          <button type="button" className="icon-btn" onClick={onClose} title="Fechar">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Informe o nome para o arquivo do projeto GeoDesk (.geodesk). Todas as camadas carregadas, estilos, rótulos e a visão atual do mapa serão preservados.
          </p>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)' }}>
              Nome do Projeto:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: analise-ambiental-sp"
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                .geodesk
              </span>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={!name.trim()}>
              <Save size={14} />
              <span>Salvar Projeto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
