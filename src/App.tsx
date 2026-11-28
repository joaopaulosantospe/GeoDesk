import { useEffect, useRef, useState } from 'react';
import { initMap, setBasemap as setMapBasemap, updateMapSize, whenMapReady } from './map/mapContext';
import { openStartupFile, openPathFromDisk } from './import/externalFile';
import { saveProject, getCurrentProjectName } from './export/projectManager';
import { useAppStore } from './store';
import StatusBar from './components/StatusBar';
import RightPanel from './components/RightPanel';
import LayerPanel from './components/LayerPanel';
import DesktopHeader from './components/DesktopHeader';
import DragDropOverlay from './components/DragDropOverlay';
import MapToolController from './components/MapToolController';
import StreetViewPanel from './components/StreetViewPanel';
import RegionSelectPanel from './components/RegionSelectPanel';
import UpdateNotification from './components/UpdateNotification';

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const basemapId = useAppStore((s) => s.basemapId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);

  // A splash screen roda em uma janela nativa própria (electron/main.cjs),
  // então o workspace é montado direto — a janela principal só fica visível
  // quando o splash termina.
  useEffect(() => {
    if (!mapRef.current) return;
    initMap(mapRef.current);

    const ro = new ResizeObserver(() => {
      updateMapSize();
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setMapBasemap(basemapId);
  }, [basemapId]);

  useEffect(() => {
    // Arquivo passado pelo Windows ao iniciar o app (duplo clique ou
    // "Abrir com GeoDesk" — associações registradas pelo instalador).
    let cancelled = false;
    void whenMapReady()
      .then(() => new Promise((resolve) => setTimeout(resolve, 400)))
      .then(() => (cancelled ? undefined : openStartupFile()));

    // Arquivo aberto com o GeoDesk já em execução (duplo clique em segundo arquivo)
    const unsubscribe = window.geodeskDisk?.onOpenFile?.((filePath) => {
      void whenMapReady().then(() => openPathFromDisk(filePath));
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Sincroniza o mapa quando os painéis laterais abrem/fecham
    const t = setTimeout(() => updateMapSize(), 60);
    return () => clearTimeout(t);
  }, [sidebarOpen, rightPanelOpen]);

  const isDirty = useAppStore((s) => s.isDirty);
  const layersCount = useAppStore((s) => s.layers.length);
  const projectName = getCurrentProjectName();
  const displayTitle =
    layersCount > 0
      ? `GeoDesk — ${projectName}${isDirty ? ' *' : ''}`
      : 'GeoDesk — Estação Geoespacial';

  useEffect(() => {
    document.title = displayTitle;
  }, [displayTitle]);

  // Interceptação de fechamento da janela com confirmação de alterações não salvas
  useEffect(() => {
    let closingInProgress = false;

    const handleCloseRequest = async () => {
      if (closingInProgress) return;
      closingInProgress = true;

      try {
        const store = useAppStore.getState();
        const hasLayers = store.layers.length > 0;
        const dirty = store.isDirty;

        // Se não houver alterações pendentes ou não houver camadas no projeto, fecha diretamente
        if (!dirty || !hasLayers) {
          await window.geodeskDisk?.forceClose();
          return;
        }

        const currentProj = getCurrentProjectName();
        const choice = await window.geodeskDisk?.confirmSaveBeforeClose(currentProj);

        if (choice === 'save') {
          const saved = await saveProject();
          if (saved) {
            await window.geodeskDisk?.forceClose();
            return;
          }
          // Se o usuário cancelou o diálogo de "Salvar Como" ou falhou ao salvar, mantém aberto
        } else if (choice === 'dontsave') {
          await window.geodeskDisk?.forceClose();
          return;
        }
        // Se 'cancel', não faz nada e permanece no aplicativo
      } catch (err) {
        console.error('Erro ao verificar alterações antes de fechar:', err);
      } finally {
        closingInProgress = false;
      }
    };

    const unsubscribe = window.geodeskDisk?.onRequestClose?.(() => {
      void handleCloseRequest();
    });

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const store = useAppStore.getState();
      if (store.isDirty && store.layers.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <div className="app-shell">
      {/* Faixa de título da janela (substitui a barra de título nativa, que
          exibia o ícone): texto apenas, também serve para arrastar a janela. */}
      <div className="window-titlebar">
        <span className="window-titlebar-title">{displayTitle}</span>
      </div>

      <DragDropOverlay />
      <MapToolController />

      {/* Desktop Menu Bar + Quick Action Toolbar */}
      <DesktopHeader
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Workspace Principal */}
      <div className="workspace">
        {/* Painel Esquerdo: Camadas */}
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="panel-header">
              <span className="panel-title">Gerenciador de Camadas</span>
            </div>
            <LayerPanel />
          </aside>
        )}

        {/* Canvas do Mapa Desobstruído e Limpo */}
        <div className="map-wrap" ref={mapRef}>
          {/* Resultado da seleção por polígono (sobrepõe o mapa) */}
          <RegionSelectPanel />
        </div>

        {/* Street View 360° flutuando sobre o mapa */}
        <StreetViewPanel />

        {/* Painel Direito: Atributos, Análise e Relatórios */}
        {rightPanelOpen && (
          <aside className="right-panel">
            <RightPanel />
          </aside>
        )}
      </div>

      <StatusBar />
      <UpdateNotification />
    </div>
  );
}
