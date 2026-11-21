import { Table2, Sliders, FileText } from 'lucide-react';
import { useAppStore } from '../store';
import AttributesTab from './AttributesTab';
import AnalysisTab from './AnalysisTab';
import ReportTab from './ReportTab';

export default function RightPanel() {
  const tab = useAppStore((s) => s.rightTab);
  const setTab = useAppStore((s) => s.setRightTab);
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  const tabs = [
    {
      id: 'attributes' as const,
      label: 'Atributos',
      icon: Table2,
      count: activeLayer ? activeLayer.featureCount : undefined,
    },
    {
      id: 'analysis' as const,
      label: 'Análise',
      icon: Sliders,
    },
    {
      id: 'report' as const,
      label: 'Relatório',
      icon: FileText,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Segmented Control de Abas */}
      <div className="right-panel-segmented-strip">
        <div className="segmented-control">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`segmented-tab ${isActive ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={13} />
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span className={`segmented-count ${isActive ? 'active' : ''}`}>
                    {t.count > 999 ? '999+' : t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tab-content">
        {tab === 'attributes' && <AttributesTab />}
        {tab === 'analysis' && <AnalysisTab />}
        {tab === 'report' && <ReportTab />}
      </div>
    </div>
  );
}
