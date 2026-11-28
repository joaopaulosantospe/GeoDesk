import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Download,
  Clock,
  X,
  RefreshCw,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface UpdateModalProps {
  check: GeodeskUpdateCheck;
  onClose: () => void;
  onDownload: () => void;
  onInstall: () => void;
  downloading?: boolean;
  progress?: number | null;
  downloaded?: boolean;
  error?: string | null;
}

interface HighlightItem {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
}

/** Fallback genérico quando as notas da release estão vazias ou indisponíveis. */
const GENERIC_FALLBACK: HighlightItem[] = [
  {
    icon: <Sparkles size={18} color="#3b82f6" />,
    title: 'Melhorias e correções',
    desc: 'Esta versão inclui melhorias de desempenho, estabilidade e correções gerais.',
  },
];

function getHighlights(rawNotes: string | null | undefined, _version?: string | null): HighlightItem[] {
  // Sem notas ou mensagem automática genérica → fallback simples (sem features hardcoded).
  if (!rawNotes || rawNotes.includes('atualização automática pelo menu') || rawNotes.includes('electron-updater')) {
    return GENERIC_FALLBACK;
  }

  // Limpa tags HTML como <p>, </p>, <div>, etc.
  const cleaned = rawNotes
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  if (!cleaned) return GENERIC_FALLBACK;

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('##'));

  if (lines.length === 0) return GENERIC_FALLBACK;

  return lines.map((line, idx) => {
    const text = line.replace(/^[•\-*]\s*/, '').trim();
    const parts = text.split(/:\s*(.+)/);
    const title = parts.length > 1 ? parts[0] : text;
    const desc = parts.length > 1 ? parts[1] : '';

    const icons = [
      <Sparkles key={idx} size={18} color="#3b82f6" />,
      <Zap key={idx} size={18} color="#10b981" />,
      <CheckCircle2 key={idx} size={18} color="#f59e0b" />,
      <ShieldCheck key={idx} size={18} color="#8b5cf6" />,
    ];

    return {
      icon: icons[idx % icons.length],
      title,
      desc,
    };
  });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = Number(parts[1]);
      const day = parts[2];
      const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      return `${day} de ${months[month - 1]} de ${year}`;
    }
  } catch {}
  return dateStr;
}

export default function UpdateModal({
  check,
  onClose,
  onDownload,
  onInstall,
  downloading = false,
  progress = null,
  downloaded = false,
  error = null,
}: UpdateModalProps) {
  const highlights = getHighlights(check.notes, check.latest);
  const formattedDate = formatDate(check.releasedAt);

  return (
    <div className="premium-update-overlay" onClick={onClose}>
      <div className="premium-update-card" onClick={(e) => e.stopPropagation()}>
        {/* Header Hero com Gradiente Suave */}
        <div className="premium-update-hero">
          <div className="premium-update-badge-strip">
            <span className="premium-tag-glow">
              <Sparkles size={13} className="spin-slow" />
              ATUALIZAÇÃO DISPONÍVEL
            </span>
            <span className="premium-tag-stable">Canal Oficial Estável</span>
          </div>

          <h2 className="premium-update-title">GeoDesk v{check.latest || '1.4.0'}</h2>
          <p className="premium-update-desc">
            Uma nova versão com recursos avançados de visualização e ferramentas cartográficas está disponível.
          </p>

          <button type="button" className="premium-update-close" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Faixa de Comparativo de Versão */}
        <div className="premium-update-version-strip">
          <div className="version-pill current">
            <span className="version-pill-label">Instalada no seu PC</span>
            <span className="version-pill-number">v{check.current}</span>
          </div>

          <div className="version-arrow-wrap">
            <ArrowRight size={16} />
          </div>

          <div className="version-pill latest">
            <span className="version-pill-label">Nova Versão</span>
            <span className="version-pill-number">v{check.latest || '1.4.0'}</span>
          </div>

          {formattedDate && (
            <div className="version-date-pill">
              <Calendar size={13} />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>

        {/* Lista de Destaques / Novidades */}
        <div className="premium-update-body">
          <div className="premium-section-title">
            <span>O QUE HÁ DE NOVO NESTA VERSÃO</span>
            <div className="premium-title-line" />
          </div>

          <div className="premium-highlights-list">
            {highlights.map((h, i) => (
              <div key={i} className="premium-highlight-card">
                <div className="premium-highlight-icon-box">{h.icon}</div>
                <div className="premium-highlight-content">
                  <div className="premium-highlight-header">
                    <span className="premium-highlight-title">{h.title}</span>
                    {h.badge && <span className="premium-highlight-badge">{h.badge}</span>}
                  </div>
                  {h.desc && <p className="premium-highlight-desc">{h.desc}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Barra de Progresso durante o Download */}
          {downloading && (
            <div className="premium-download-box">
              <div className="premium-download-meta">
                <div className="premium-download-status">
                  <RefreshCw size={14} className="spin" />
                  <span>Baixando atualização com segurança…</span>
                </div>
                <span className="premium-download-pct">{(progress ?? 0).toFixed(0)}%</span>
              </div>
              <div className="premium-download-track">
                <div
                  className="premium-download-fill"
                  style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
                />
              </div>
            </div>
          )}

          {/* Mensagem de Erro com botão de retry */}
          {error && !downloading && (
            <div className="premium-error-banner">
              <strong>Erro no download:</strong> {error}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="premium-update-footer">
          <div className="premium-footer-hint">
            <ShieldCheck size={14} color="#10b981" />
            <span>Verificado e assinado digitalmente</span>
          </div>

          <div className="premium-footer-btns">
            {!downloaded && !downloading && (
              <button type="button" className="btn-secondary-premium" onClick={onClose}>
                <Clock size={14} />
                Lembrar Mais Tarde
              </button>
            )}

            {downloaded ? (
              <button type="button" className="btn-primary-premium ready" onClick={onInstall}>
                <CheckCircle2 size={16} />
                Instalar Agora e Reiniciar
              </button>
            ) : downloading ? (
              <button type="button" className="btn-primary-premium" disabled>
                <RefreshCw size={16} className="spin" />
                Baixando…
              </button>
            ) : (
              <button type="button" className="btn-primary-premium" onClick={onDownload}>
                <Download size={16} />
                {error ? 'Tentar Novamente' : 'Atualizar Agora'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
