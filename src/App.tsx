import { useEffect, useRef, useState } from 'react';
import { initMap, setBasemap as setMapBasemap, updateMapSize, whenMapReady } from './map/mapContext';
import { openStartupFile, openPathFromDisk } from './import/externalFile';
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

  return (
    <div className="app-shell">
      {/* Faixa de título da janela (substitui a barra de título nativa, que
          exibia o ícone): texto apenas, também serve para arrastar a janela. */}
      <div className="window-titlebar">
        <span className="window-titlebar-title">GeoDesk — Estação Geoespacial</span>
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
