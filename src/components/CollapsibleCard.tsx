import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const STORAGE_PREFIX = 'geodesk:card:';

function readCollapsed(id: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + id) === '1';
  } catch {
    return false;
  }
}

/**
 * Cartão da barra lateral com título clicável: recolhe/abre o conteúdo
 * (a seta gira) e guarda a preferência no armazenamento local.
 */
export default function CollapsibleCard({
  id,
  title,
  children,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id));

  function toggle(): void {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0');
      } catch {
        // sem armazenamento disponível — mantém apenas em memória
      }
      return next;
    });
  }

  return (
    <div className={`card collapsible-card${collapsed ? ' collapsed' : ''}`}>
      <h3>
        <button
          type="button"
          className="card-toggle"
          aria-expanded={!collapsed}
          aria-controls={`card-body-${id}`}
          onClick={toggle}
        >
          {title}
          <ChevronDown className="card-chevron" size={15} aria-hidden="true" />
        </button>
      </h3>
      <div id={`card-body-${id}`} className="card-body" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
