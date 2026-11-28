import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  CircleDashed,
  Combine,
  Compass,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderTree,
  Globe,
  Globe2,
  HelpCircle,
  Keyboard,
  Layers,
  LayoutGrid,
  Link2,
  Maximize2,
  MousePointer,
  MousePointerClick,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pentagon,
  Plus,
  Power,
  RefreshCw,
  Ruler,
  Save,
  SaveAll,
  Sparkles,
  SquareDashedMousePointer,
  Table,
  Table2,
  Trash2,
  Type,
  Unlink,
  X,
  Map as MapIcon,
} from 'lucide-react';
import { useAppStore } from '../store';
import { basemaps } from '../map/basemaps';
import { zoomToLayers, zoomToLayer, removeLayerEverywhere, applyLayerVisibility } from '../map/mapContext';
import { exportMapPNG } from '../export/pngExport';
import { exportLayerGeoJSON } from '../export/geojsonExport';
import { exportAllLayersKML } from '../export/kmlExport';
import { exportLayerCSV } from '../export/csvExport';
import { exportLayerPDF } from '../export/pdfReport';
import { loadGeoJSONFile } from '../import/geojsonLoader';
import { loadShapefile } from '../import/shpLoader';
import { loadSample, samples } from '../import/samples';
import { loadGeoPackage } from '../import/gpkgLoader';
import { loadQgisProject } from '../import/qgisProject';
import { loadMxdProject } from '../import/mxdProject';
import { addArcGISService, getArcGISServiceInfo, isArcGISRootUrl, type ArcGISServiceInfo } from '../import/arcgisRest';
import { saveProject, saveProjectAs, loadProjectFile, getCurrentProjectName, setCurrentProjectName } from '../export/projectManager';
import ExportKmzDialog from './ExportKmzDialog';
import ShortcutsModal from './ShortcutsModal';
import UpdateModal from './UpdateModal';
import LabelDialog from './LabelDialog';
import JoinDialog from './JoinDialog';
import SaveAsDialog from './SaveAsDialog';
import type { BasemapId } from '../types';

interface DesktopHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

type MenuKey = 'projeto' | 'camada' | 'analise' | 'ferramentas' | 'exibir' | 'ajuda' | null;

export default function DesktopHeader({
  sidebarOpen,
  setSidebarOpen,
}: DesktopHeaderProps) {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemap = useAppStore((s) => s.setBasemap);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  const openRightPanel = useAppStore((s) => s.openRightPanel);
  const setStatus = useAppStore((s) => s.setStatus);
  const updateLayer = useAppStore((s) => s.updateLayer);

  const [activeMenu, setActiveMenu] = useState<MenuKey>(null);
  const [basemapDropdownOpen, setBasemapDropdownOpen] = useState(false);
  const [samplesModalOpen, setSamplesModalOpen] = useState(false);
  const [arcgisModalOpen, setArcgisModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [kmzDialogOpen, setKmzDialogOpen] = useState(false);
  const [exportingKmz, setExportingKmz] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);

  // Atualizações (Ajuda > Verificar Atualizações)
  const [updateCheck, setUpdateCheck] = useState<GeodeskUpdateCheck | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ArcGIS REST state
  const [url, setUrl] = useState('');
  const [serviceInfo, setServiceInfo] = useState<ArcGISServiceInfo | null>(null);
  const [arcgisBusy, setArcgisBusy] = useState(false);
  const [arcgisError, setArcgisError] = useState<string | null>(null);

  const shpInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const geojsonInputRef = useRef<HTMLInputElement>(null);
  const gpkgInputRef = useRef<HTMLInputElement>(null);
  const qgisInputRef = useRef<HTMLInputElement>(null);
  const mxdInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const basemapRef = useRef<HTMLDivElement>(null);

  // Fecha menus ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
      if (basemapRef.current && !basemapRef.current.contains(event.target as Node)) {
        setBasemapDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Atalhos de teclado no nível da janela
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        setActiveMenu(null);
        setBasemapDropdownOpen(false);
        setTool(null);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setActiveMenu(null);
        if (e.shiftKey) {
          if (window.geodeskDisk?.showSaveDialog) {
            void saveProjectAs();
          } else {
            setSaveAsModalOpen(true);
          }
        } else {
          void saveProject();
        }
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
        openRightPanel();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        setTool(tool === 'region-select' ? null : 'region-select');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        setTool(tool === 'street-view' ? null : 'street-view');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTool, setRightTab, openRightPanel]);

  // Lê a versão instalada uma única vez (exibida no "Sobre").
  useEffect(() => {
    let cancelled = false;
    window.geodeskUpdate
      ?.appVersion()
      .then((v) => {
        if (!cancelled && typeof v === 'string' && v) setAppVersion(v);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Progresso/resultado do download feito pelo processo principal
  // (electron-updater — somente no app empacotado).
  useEffect(() => {
    const api = window.geodeskUpdate;
    if (!api?.onUpdateProgress) return;
    const offProgress = api.onUpdateProgress((p) => {
      setUpdateProgress(typeof p?.percent === 'number' ? p.percent : null);
    });
    const offDownloaded = api.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setUpdateDownloading(false);
      setUpdateProgress(100);
    });
    const offError = api.onUpdateError((message) => {
      setUpdateDownloading(false);
      setUpdateError(message || 'Falha ao baixar a atualização.');
    });
    return () => {
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  // Ajuda > Verificar Atualizações: compara a versão instalada com a publicada
  // (electron-updater no app instalado; version.json em desenvolvimento) e
  // mostra o resultado num diálogo.
  async function handleCheckUpdates() {
    setActiveMenu(null);
    if (!window.geodeskUpdate) {
      setUpdateCheck({
        status: 'error',
        current: appVersion ?? '—',
        latest: null,
        message: 'A verificação de atualizações está disponível apenas na versão desktop do GeoDesk.',
      });
      return;
    }
    setUpdateBusy(true);
    setUpdateCheck(null);
    setUpdateError(null);
    setUpdateProgress(null);
    setUpdateDownloading(false);
    try {
      const result = await window.geodeskUpdate.check();
      setUpdateCheck(result);
      setUpdateDownloaded(Boolean(result.downloaded));
      if (result.status === 'available') {
        setStatus(`Atualização disponível: v${result.latest} (v${result.current} instalada)`);
      } else if (result.status === 'up-to-date') {
        setStatus(`GeoDesk atualizado (v${result.current})`);
      } else {
        setStatus(result.message || 'Não foi possível verificar atualizações');
      }
    } catch (err) {
      setUpdateCheck({
        status: 'error',
        current: appVersion ?? '—',
        latest: null,
        message: `Falha ao verificar atualizações: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setUpdateBusy(false);
    }
  }

  // "Baixar Atualização": dentro do app (mode 'app') ou no navegador
  // (mode 'browser', fallback de desenvolvimento).
  async function handleDownloadUpdate() {
    if (!updateCheck || updateCheck.status !== 'available' || !window.geodeskUpdate) return;

    if (updateCheck.mode !== 'app') {
      const target = updateCheck.url;
      if (!target) return;
      const opened = await window.geodeskUpdate.openExternal(target);
      if (opened) setUpdateCheck(null);
      return;
    }

    setUpdateDownloading(true);
    setUpdateError(null);
    setUpdateProgress(0);
    try {
      const result = await window.geodeskUpdate.downloadUpdate();
      if (result.status === 'downloaded') {
        setUpdateDownloaded(true);
        setUpdateDownloading(false);
        setUpdateProgress(100);
        setStatus('Atualização baixada. Use "Instalar agora" quando quiser.');
      } else {
        setUpdateDownloading(false);
        setUpdateError(result.message || 'Falha ao baixar a atualização.');
        setStatus(result.message || 'Falha ao baixar a atualização.');
      }
    } catch (err) {
      setUpdateDownloading(false);
      setUpdateError(`Falha ao baixar a atualização: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // "Instalar agora e Reiniciar": o processo principal fecha, instala a nova
  // versão e relança o GeoDesk.
  async function handleInstallUpdate() {
    if (!window.geodeskUpdate) return;
    const ok = await window.geodeskUpdate.installUpdate();
    if (!ok) setUpdateError('Não foi possível iniciar a instalação da atualização.');
  }

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const allVisible = layers.length > 0 && layers.every((l) => l.visible);

  const toggleAllVisibility = () => {
    const target = !allVisible;
    layers.forEach((l) => {
      updateLayer(l.id, { visible: target });
      applyLayerVisibility(l.id, target);
    });
    setStatus(target ? 'Todas as camadas estão visíveis' : 'Todas as camadas foram ocultadas');
  };

  const handleZoomAll = () => {
    if (layers.length > 0) {
      zoomToLayers(layers.map((l) => l.id));
    }
  };

  // Upload handlers
  const handleShpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando Shapefile…');
      await loadShapefile(files);
      if (getCurrentProjectName() === 'meu-projeto' && files[0]?.name) {
        setCurrentProjectName(files[0].name.replace(/\.[^./\\]+$/, ''));
      }
      setStatus('Shapefile importado com sucesso');
    } catch (err) {
      setStatus(`Erro ao importar Shapefile: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActiveMenu(null);
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando pasta…');
      await loadShapefile(files);
      if (getCurrentProjectName() === 'meu-projeto' && files[0]?.name) {
        setCurrentProjectName(files[0].name.replace(/\.[^./\\]+$/, ''));
      }
      setStatus('Pasta importada com sucesso');
    } catch (err) {
      setStatus(`Erro ao importar pasta: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActiveMenu(null);
  };

  const handleGeoJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando GeoJSON…');
      await loadGeoJSONFile(files[0]);
      if (getCurrentProjectName() === 'meu-projeto' && files[0]?.name) {
        setCurrentProjectName(files[0].name.replace(/\.[^./\\]+$/, ''));
      }
      setStatus('GeoJSON importado com sucesso');
    } catch (err) {
      setStatus(`Erro ao importar GeoJSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActiveMenu(null);
  };

  const handleProjectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando projeto GeoDesk…');
      await loadProjectFile(files[0]);
    } catch (err) {
      setStatus(`Erro ao abrir projeto: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActiveMenu(null);
  };

  const handleArcGISSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setArcgisBusy(true);
    setArcgisError(null);
    try {
      const clean = url.trim();
      if (isArcGISRootUrl(clean)) {
        const info = await getArcGISServiceInfo(clean);
        setServiceInfo(info);
      } else {
        await addArcGISService(clean);
        setArcgisModalOpen(false);
        setUrl('');
      }
    } catch (err) {
      setArcgisError(err instanceof Error ? err.message : String(err));
    } finally {
      setArcgisBusy(false);
    }
  };

  const handleSublayerAdd = async (sublayerId: number) => {
    if (!serviceInfo) return;
    setArcgisBusy(true);
    setArcgisError(null);
    try {
      const subUrl = `${serviceInfo.url.replace(/\/+$/, '')}/${sublayerId}`;
      await addArcGISService(subUrl);
      setArcgisModalOpen(false);
      setServiceInfo(null);
      setUrl('');
    } catch (err) {
      setArcgisError(err instanceof Error ? err.message : String(err));
    } finally {
      setArcgisBusy(false);
    }
  };

  /** GeoPackage (.gpkg): banco vetorial do QGIS e do ArcGIS Pro. */
  const handleGpkgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      for (const file of files) {
        setStatus(`Abrindo GeoPackage ${file.name}…`);
        await loadGeoPackage(file);
      }
    } catch (err) {
      setStatus(`Erro ao abrir GeoPackage: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActiveMenu(null);
  };

  /** Projeto do QGIS (.qgs/.qgz): carrega as camadas referenciadas no disco. */
  const handleQgisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    for (const file of files) {
      try {
        setStatus(`Abrindo projeto QGIS ${file.name}…`);
        await loadQgisProject(file);
      } catch (err) {
        setStatus(`Erro ao abrir projeto QGIS: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setActiveMenu(null);
  };

  /** Projeto do ArcMap (.mxd): carrega as camadas referenciadas no disco. */
  const handleMxdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    for (const file of files) {
      try {
        setStatus(`Abrindo projeto ArcMap ${file.name}…`);
        await loadMxdProject(file);
      } catch (err) {
        setStatus(`Erro ao abrir projeto ArcMap: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setActiveMenu(null);
  };

  const handleExportFullProjectKmz = async () => {
    if (layers.length === 0 || exportingKmz) return;
    setExportingKmz(true);
    try {
      setStatus('Exportando Projeto Completo para KMZ (Google Earth)…');
      await exportAllLayersKML('kmz');
      setStatus('Projeto Completo KMZ exportado com sucesso');
    } catch (err) {
      setStatus(`Falha ao exportar Projeto KMZ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingKmz(false);
    }
  };

  return (
    <div className="desktop-header-shell" ref={headerRef}>
      {/* File inputs invisíveis */}
      <input ref={shpInputRef} type="file" accept=".shp,.dbf,.prj,.cpg" multiple hidden onChange={handleShpUpload} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleFolderUpload}
      />
      <input ref={geojsonInputRef} type="file" accept=".geojson,.json" hidden onChange={handleGeoJsonUpload} />
      <input ref={gpkgInputRef} type="file" accept=".gpkg" multiple hidden onChange={handleGpkgUpload} />
      <input ref={qgisInputRef} type="file" accept=".qgs,.qgz" multiple hidden onChange={handleQgisUpload} />
      <input ref={mxdInputRef} type="file" accept=".mxd" multiple hidden onChange={handleMxdUpload} />
      <input ref={projectInputRef} type="file" accept=".geodesk,.json" hidden onChange={handleProjectUpload} />

      {/* ── LINHA 1: MENU BAR CLÁSSICA E REFINADA ── */}
      <div className="desktop-menu-bar">
        {/* Identidade Compacta */}
        <div className="menu-bar-brand">
          <div className="menu-bar-logo">
            <Globe2 size={13} color="#ffffff" strokeWidth={2.4} />
          </div>
          <span className="menu-bar-title">GeoDesk</span>
        </div>

        {/* Itens do Menu Bar */}
        <div className="menu-bar-items">
          {/* Menu: Projeto */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'projeto' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'projeto' ? null : 'projeto')}
              onMouseEnter={() => activeMenu && setActiveMenu('projeto')}
            >
              Projeto
            </button>
            {activeMenu === 'projeto' && (
              <div className="desktop-menu-popover">
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); saveProject(); }}>
                  <Save size={14} />
                  <span className="menu-item-text">Salvar Projeto</span>
                  <span className="menu-item-shortcut">Ctrl+S</span>
                </button>
                <button type="button" className="menu-item" onClick={() => {
                  setActiveMenu(null);
                  if (window.geodeskDisk?.showSaveDialog) {
                    void saveProjectAs();
                  } else {
                    setSaveAsModalOpen(true);
                  }
                }}>
                  <SaveAll size={14} />
                  <span className="menu-item-text">Salvar Projeto Como...</span>
                  <span className="menu-item-shortcut">Ctrl+Shift+S</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); projectInputRef.current?.click(); }}>
                  <FolderOpen size={14} />
                  <span className="menu-item-text">Abrir Projeto (.geodesk)...</span>
                </button>

                <div className="menu-item-sep" />

                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); shpInputRef.current?.click(); }}>
                  <FolderOpen size={14} />
                  <span className="menu-item-text">Importar Shapefile (.shp)...</span>
                  <span className="menu-item-shortcut">Ctrl+O</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); folderInputRef.current?.click(); }}>
                  <FolderTree size={14} />
                  <span className="menu-item-text">Importar Pasta de Shapefiles...</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); geojsonInputRef.current?.click(); }}>
                  <FileJson size={14} />
                  <span className="menu-item-text">Importar Arquivo GeoJSON...</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); gpkgInputRef.current?.click(); }}>
                  <PackageOpen size={14} />
                  <span className="menu-item-text">Importar GeoPackage (.gpkg)...</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  title="Abre o projeto do QGIS e carrega as camadas (shapefile, GeoJSON, GeoPackage) referenciadas"
                  onClick={() => { setActiveMenu(null); qgisInputRef.current?.click(); }}
                >
                  <Layers size={14} />
                  <span className="menu-item-text">Abrir Projeto do QGIS (.qgs / .qgz)...</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  title="Abre o mapa do ArcGIS/ArcMap e carrega as camadas (.shp, .gpkg, .geojson) referenciadas"
                  onClick={() => { setActiveMenu(null); mxdInputRef.current?.click(); }}
                >
                  <Layers size={14} />
                  <span className="menu-item-text">Abrir Projeto ArcMap (.mxd)...</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setArcgisModalOpen(true); }}>
                  <Database size={14} />
                  <span className="menu-item-text">Conectar Serviço ArcGIS REST...</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setSamplesModalOpen(true); }}>
                  <Sparkles size={14} />
                  <span className="menu-item-text">Carregar Dados de Amostra...</span>
                </button>

                <div className="menu-item-sep" />

                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); void exportMapPNG(); }}>
                  <Camera size={14} />
                  <span className="menu-item-text">Exportar Mapa como Imagem (PNG)</span>
                  <span className="menu-item-shortcut">Ctrl+P</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={layers.length === 0 || exportingKmz}
                  onClick={() => { setActiveMenu(null); void handleExportFullProjectKmz(); }}
                >
                  <Globe size={14} />
                  <span className="menu-item-text">Exportar Projeto Completo (KMZ)</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={layers.length === 0}
                  onClick={() => { setActiveMenu(null); setKmzDialogOpen(true); }}
                >
                  <Layers size={14} />
                  <span className="menu-item-text">Exportar KMZ Personalizado...</span>
                </button>

                <div className="menu-item-sep" />

                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setActiveMenu(null);
                    if (window.geodeskDisk?.quit) {
                      window.geodeskDisk.quit();
                    } else {
                      window.close();
                    }
                  }}
                >
                  <Power size={14} />
                  <span className="menu-item-text">Fechar Sistema</span>
                  <span className="menu-item-shortcut">Alt+F4</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu: Camada */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'camada' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'camada' ? null : 'camada')}
              onMouseEnter={() => activeMenu && setActiveMenu('camada')}
            >
              Camada
            </button>
            {activeMenu === 'camada' && (
              <div className="desktop-menu-popover">
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); shpInputRef.current?.click(); }}>
                  <Plus size={14} />
                  <span className="menu-item-text">Adicionar Camada...</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    setRightTab('attributes');
                    openRightPanel();
                  }}
                >
                  <Table2 size={14} />
                  <span className="menu-item-text">Abrir Tabela de Atributos</span>
                  <span className="menu-item-shortcut">F6</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    setLabelDialogOpen(true);
                  }}
                >
                  <Type size={14} />
                  <span className="menu-item-text">Rótulos da Camada Ativa...</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    setJoinDialogOpen(true);
                  }}
                >
                  <Link2 size={14} />
                  <span className="menu-item-text">Ligar Tabela Externa (Join / Relate)...</span>
                </button>

                <div className="menu-item-sep" />

                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    if (activeLayer) void exportLayerGeoJSON(activeLayer.id);
                  }}
                >
                  <Save size={14} />
                  <span className="menu-item-text">Salvar Camada Ativa (GeoJSON)</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    if (activeLayer) void exportLayerGeoJSON(activeLayer.id);
                  }}
                >
                  <SaveAll size={14} />
                  <span className="menu-item-text">Salvar Camada Como...</span>
                </button>

                <div className="menu-item-sep" />

                <button
                  type="button"
                  className="menu-item"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    if (activeLayer) zoomToLayer(activeLayer.id);
                  }}
                >
                  <Maximize2 size={14} />
                  <span className="menu-item-text">Enquadrar Camada no Mapa</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={layers.length === 0}
                  onClick={() => {
                    setActiveMenu(null);
                    handleZoomAll();
                  }}
                >
                  <Maximize2 size={14} />
                  <span className="menu-item-text">Enquadrar Todas as Camadas</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={layers.length === 0}
                  onClick={() => {
                    setActiveMenu(null);
                    toggleAllVisibility();
                  }}
                >
                  {allVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span className="menu-item-text">{allVisible ? 'Ocultar Todas as Camadas' : 'Exibir Todas as Camadas'}</span>
                </button>

                <div className="menu-item-sep" />

                <button
                  type="button"
                  className="menu-item danger"
                  disabled={!activeLayer}
                  onClick={() => {
                    setActiveMenu(null);
                    if (activeLayer) {
                      removeLayerEverywhere(activeLayer.id);
                      setStatus(`Camada "${activeLayer.name}" removida`);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  <span className="menu-item-text">Remover Camada Ativa</span>
                  <span className="menu-item-shortcut">Del</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu: Geoprocessamento */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'analise' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'analise' ? null : 'analise')}
              onMouseEnter={() => activeMenu && setActiveMenu('analise')}
            >
              Geoprocessamento
            </button>
            {activeMenu === 'analise' && (
              <div className="desktop-menu-popover">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setActiveMenu(null);
                    setRightTab('analysis');
                    setTool('buffer');
                    openRightPanel();
                  }}
                >
                  <SquareDashedMousePointer size={14} />
                  <span className="menu-item-text">Zona de Amortecimento (Buffer)...</span>
                  <span className="menu-item-shortcut">B</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setActiveMenu(null);
                    setRightTab('analysis');
                    setTool('intersect');
                    openRightPanel();
                  }}
                >
                  <Combine size={14} />
                  <span className="menu-item-text">Interseção Espacial de Camadas...</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setActiveMenu(null);
                    setRightTab('analysis');
                    setTool('grid');
                    openRightPanel();
                  }}
                >
                  <LayoutGrid size={14} />
                  <span className="menu-item-text">Criar Grade Cartográfica (Quadícula)...</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu: Ferramentas */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'ferramentas' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'ferramentas' ? null : 'ferramentas')}
              onMouseEnter={() => activeMenu && setActiveMenu('ferramentas')}
            >
              Ferramentas
            </button>
            {activeMenu === 'ferramentas' && (
              <div className="desktop-menu-popover">
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool(null); }}>
                  <MousePointer size={14} />
                  <span className="menu-item-text">Navegar / Modo Cursor</span>
                  <span className="menu-item-shortcut">V</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool('identify'); }}>
                  <MousePointerClick size={14} />
                  <span className="menu-item-text">Identificar Feição</span>
                  <span className="menu-item-shortcut">I</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool('measure-distance'); }}>
                  <Ruler size={14} />
                  <span className="menu-item-text">Medir Distância Linear</span>
                  <span className="menu-item-shortcut">D</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool('measure-area'); }}>
                  <CircleDashed size={14} />
                  <span className="menu-item-text">Medir Área Poligonal</span>
                  <span className="menu-item-shortcut">A</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool('region-select'); }}>
                  <Pentagon size={14} />
                  <span className="menu-item-text">Selecionar Região por Polígono</span>
                  <span className="menu-item-shortcut">P</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool('street-view'); }}>
                  <Compass size={14} />
                  <span className="menu-item-text">Google Street View 360°</span>
                  <span className="menu-item-shortcut">S</span>
                </button>

                <div className="menu-item-sep" />

                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setTool(null); }}>
                  <X size={14} />
                  <span className="menu-item-text">Desativar Ferramenta Atual</span>
                  <span className="menu-item-shortcut">Esc</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu: Exibir */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'exibir' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'exibir' ? null : 'exibir')}
              onMouseEnter={() => activeMenu && setActiveMenu('exibir')}
            >
              Exibir
            </button>
            {activeMenu === 'exibir' && (
              <div className="desktop-menu-popover">
                <div className="menu-header-sub">Mapas Base de Fundo</div>
                {basemaps.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setBasemap(b.id);
                      setActiveMenu(null);
                    }}
                  >
                    <Globe2 size={14} />
                    <span className="menu-item-text">{b.label}</span>
                    {basemapId === b.id && <Check size={13} color="var(--accent)" />}
                  </button>
                ))}

                <div className="menu-item-sep" />

                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setSidebarOpen(!sidebarOpen); }}>
                  {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                  <span className="menu-item-text">{sidebarOpen ? 'Ocultar Painel de Camadas' : 'Exibir Painel de Camadas'}</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setRightPanelOpen(!rightPanelOpen); }}>
                  {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                  <span className="menu-item-text">{rightPanelOpen ? 'Ocultar Inspetor Lateral' : 'Exibir Inspetor Lateral'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu: Ajuda */}
          <div className="menu-dropdown-anchor">
            <button
              type="button"
              className={`menu-bar-btn ${activeMenu === 'ajuda' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'ajuda' ? null : 'ajuda')}
              onMouseEnter={() => activeMenu && setActiveMenu('ajuda')}
            >
              Ajuda
            </button>
            {activeMenu === 'ajuda' && (
              <div className="desktop-menu-popover">
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setShortcutsModalOpen(true); }}>
                  <Keyboard size={14} />
                  <span className="menu-item-text">Atalhos de Teclado e Navegação</span>
                  <span className="menu-item-shortcut">F1</span>
                </button>
                <button type="button" className="menu-item" onClick={() => { setActiveMenu(null); setAboutModalOpen(true); }}>
                  <HelpCircle size={14} />
                  <span className="menu-item-text">Sobre o GeoDesk Workstation</span>
                </button>

                <div className="menu-item-sep" />

                <button
                  type="button"
                  className="menu-item"
                  title="Verifica se existe uma versão nova do GeoDesk"
                  onClick={() => { void handleCheckUpdates(); }}
                  disabled={updateBusy}
                >
                  <RefreshCw size={14} className={updateBusy ? 'spin' : undefined} />
                  <span className="menu-item-text">
                    {updateBusy ? 'Verificando atualizações…' : 'Verificar Atualizações'}
                  </span>
                  {updateCheck?.status === 'available' && <span className="badge">Nova</span>}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito do Menu Bar: Resumo do Projeto */}
        <div className="menu-bar-info">
          <span>{layers.length} {layers.length === 1 ? 'camada' : 'camadas'}</span>
          <span>·</span>
          <span>{layers.reduce((acc, l) => acc + l.featureCount, 0).toLocaleString('pt-BR')} feições</span>
        </div>
      </div>

      {/* ── LINHA 2: QUICK ACTION TOOLBAR (ÍCONES COMPACTOS DE ALTA PRECISÃO) ── */}
      <div className="desktop-action-toolbar">
        {/* Grupo: Arquivos / Fontes de Dados */}
        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-btn"
            title="Abrir Projeto (.geodesk)"
            onClick={() => projectInputRef.current?.click()}
          >
            <FolderOpen size={14} />
            <span className="toolbar-btn-text">Abrir</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Salvar Projeto (.geodesk) (Ctrl+S)"
            onClick={() => saveProject()}
          >
            <Save size={14} />
            <span className="toolbar-btn-text">Salvar</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Salvar Projeto Como... (Ctrl+Shift+S)"
            onClick={() => {
              if (window.geodeskDisk?.showSaveDialog) {
                void saveProjectAs();
              } else {
                setSaveAsModalOpen(true);
              }
            }}
          >
            <SaveAll size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Importar Shapefile (.shp) (Ctrl+O)"
            onClick={() => shpInputRef.current?.click()}
          >
            <FolderOpen size={14} />
            <span className="toolbar-btn-text">Shapefile</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Importar Arquivo GeoJSON (.geojson)"
            onClick={() => geojsonInputRef.current?.click()}
          >
            <FileJson size={14} />
            <span className="toolbar-btn-text">GeoJSON</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Conectar Serviço ArcGIS REST"
            onClick={() => setArcgisModalOpen(true)}
          >
            <Database size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Carregar Dados de Amostra"
            onClick={() => setSamplesModalOpen(true)}
          >
            <Sparkles size={14} />
          </button>
        </div>

        <div className="toolbar-sep" />

        {/* Grupo: Ferramentas do Mapa */}
        <div className="toolbar-group">
          <button
            type="button"
            className={`toolbar-btn ${tool === null ? 'active' : ''}`}
            title="Navegar / Modo Cursor (V)"
            onClick={() => setTool(null)}
          >
            <MousePointer size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'identify' ? 'active' : ''}`}
            title="Identificar Atributos da Feição (I)"
            onClick={() => setTool(tool === 'identify' ? null : 'identify')}
          >
            <MousePointerClick size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'measure-distance' ? 'active' : ''}`}
            title="Medir Distância Linear (D)"
            onClick={() => setTool(tool === 'measure-distance' ? null : 'measure-distance')}
          >
            <Ruler size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'measure-area' ? 'active' : ''}`}
            title="Medir Área Poligonal (A)"
            onClick={() => setTool(tool === 'measure-area' ? null : 'measure-area')}
          >
            <CircleDashed size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'region-select' ? 'active' : ''}`}
            title="Selecionar Região por Polígono (P) — conta e exporta os pontos dentro"
            onClick={() => setTool(tool === 'region-select' ? null : 'region-select')}
          >
            <Pentagon size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Enquadrar Todas as Camadas"
            disabled={layers.length === 0}
            onClick={handleZoomAll}
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'street-view' ? 'active' : ''}`}
            title="Google Street View 360° (S)"
            onClick={() => setTool(tool === 'street-view' ? null : 'street-view')}
          >
            <Compass size={14} />
          </button>
        </div>

        <div className="toolbar-sep" />

        {/* Grupo: Geoprocessamento */}
        <div className="toolbar-group">
          <button
            type="button"
            className={`toolbar-btn ${tool === 'buffer' ? 'active' : ''}`}
            title="Zona de Amortecimento / Buffer (B)"
            onClick={() => {
              setRightTab('analysis');
              setTool('buffer');
              openRightPanel();
            }}
          >
            <SquareDashedMousePointer size={14} />
            <span className="toolbar-btn-text">Buffer</span>
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'intersect' ? 'active' : ''}`}
            title="Interseção Espacial de Camadas"
            onClick={() => {
              setRightTab('analysis');
              setTool('intersect');
              openRightPanel();
            }}
          >
            <Combine size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${tool === 'grid' ? 'active' : ''}`}
            title="Criar Grade Cartográfica / Quadícula"
            onClick={() => {
              setRightTab('analysis');
              setTool('grid');
              openRightPanel();
            }}
          >
            <LayoutGrid size={14} />
          </button>
        </div>

        <div className="toolbar-sep" />

        {/* Grupo: Exportação Rápida */}
        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-btn"
            title="Capturar Imagem PNG do Mapa (Ctrl+P)"
            onClick={() => void exportMapPNG()}
          >
            <Camera size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Exportar Projeto Completo para KMZ (Google Earth)"
            disabled={layers.length === 0 || exportingKmz}
            onClick={() => void handleExportFullProjectKmz()}
            onContextMenu={(e) => {
              e.preventDefault();
              setKmzDialogOpen(true);
            }}
          >
            <Globe size={14} className={exportingKmz ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Exportar Tabela de Atributos (CSV)"
            disabled={!activeLayerId}
            onClick={() => {
              if (activeLayerId) void exportLayerCSV(activeLayerId);
            }}
          >
            <Table size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="Gerar Relatório Técnico PDF"
            disabled={!activeLayerId}
            onClick={() => {
              if (activeLayerId) {
                setRightTab('report');
                void exportLayerPDF(activeLayerId);
              }
            }}
          >
            <FileText size={14} />
          </button>
        </div>

        <div className="toolbar-sep" />

        {/* Seletor Compacto de Mapa Base */}
        <div className="toolbar-group" ref={basemapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`toolbar-btn ${basemapDropdownOpen ? 'active' : ''}`}
            title="Alternar Mapa Base de Fundo"
            onClick={() => setBasemapDropdownOpen(!basemapDropdownOpen)}
          >
            <MapIcon size={14} />
            <span className="toolbar-btn-text">
              {basemaps.find((b) => b.id === basemapId)?.label ?? 'Mapa Base'}
            </span>
          </button>

          {basemapDropdownOpen && (
            <div className="desktop-menu-popover" style={{ minWidth: 160 }}>
              {basemaps.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setBasemap(b.id);
                    setBasemapDropdownOpen(false);
                  }}
                >
                  <Globe2 size={13} color={basemapId === b.id ? 'var(--accent)' : 'var(--text-faint)'} />
                  <span className="menu-item-text">{b.label}</span>
                  {basemapId === b.id && <Check size={13} color="var(--accent)" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Alternadores de Painéis (Esquerda e Direita) */}
        <div className="toolbar-group">
          <button
            type="button"
            className={`toolbar-btn ${sidebarOpen ? 'active' : ''}`}
            title={sidebarOpen ? 'Ocultar Painel de Camadas' : 'Exibir Painel de Camadas'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <button
            type="button"
            className={`toolbar-btn ${rightPanelOpen ? 'active' : ''}`}
            title={rightPanelOpen ? 'Ocultar Inspetor Lateral' : 'Exibir Inspetor Lateral'}
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            {rightPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </div>

      {/* ── MODAIS SECUNDÁRIOS ── */}
      {samplesModalOpen && (
        <div className="modal-overlay" onClick={() => setSamplesModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Sparkles size={16} color="var(--accent)" />
              <strong>Carregar Dados de Amostra</strong>
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="menu-item"
                  style={{ border: '1px solid var(--border-soft)', padding: '10px 12px' }}
                  onClick={async () => {
                    setSamplesModalOpen(false);
                    await loadSample(s.id);
                  }}
                >
                  <Globe size={16} color="var(--accent)" />
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{s.label}</div>
                    <div className="muted" style={{ fontSize: 11 }}>Dados cartográficos prontos para uso imediato</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setSamplesModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {arcgisModalOpen && (
        <div className="modal-overlay" onClick={() => setArcgisModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Database size={16} color="var(--accent)" />
              <strong>Adicionar Serviço ArcGIS REST</strong>
            </div>
            {serviceInfo && serviceInfo.layers.length > 1 ? (
              <div>
                <p className="muted" style={{ marginBottom: 10 }}>
                  Selecione a subcamada que deseja importar:
                </p>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
                  {serviceInfo.layers.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="menu-item"
                      style={{ border: '1px solid var(--border-soft)' }}
                      disabled={arcgisBusy}
                      onClick={() => handleSublayerAdd(l.id)}
                    >
                      <Layers size={14} color="var(--accent)" />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{l.name}</div>
                        {l.geometryType && <div className="muted" style={{ fontSize: 10.5 }}>{l.geometryType}</div>}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn" onClick={() => setServiceInfo(null)}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleArcGISSubmit}>
                <div className="field">
                  <label htmlFor="arcgis-url">URL do Serviço</label>
                  <input
                    id="arcgis-url"
                    type="url"
                    placeholder="https://services.arcgis.com/.../FeatureServer/0"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                {arcgisError && <div className="notice error">{arcgisError}</div>}
                <div className="modal-actions">
                  <button type="button" className="btn" onClick={() => setArcgisModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary" disabled={arcgisBusy || !url.trim()}>
                    {arcgisBusy ? 'Conectando…' : 'Conectar e Adicionar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {kmzDialogOpen && <ExportKmzDialog onClose={() => setKmzDialogOpen(false)} />}
      {shortcutsModalOpen && <ShortcutsModal onClose={() => setShortcutsModalOpen(false)} />}
      {labelDialogOpen && activeLayer && <LabelDialog layerId={activeLayer.id} onClose={() => setLabelDialogOpen(false)} />}
      {joinDialogOpen && activeLayer && <JoinDialog layerId={activeLayer.id} onClose={() => setJoinDialogOpen(false)} />}
      {saveAsModalOpen && (
        <SaveAsDialog
          currentName={getCurrentProjectName()}
          onSave={(newName) => {
            saveProjectAs(newName);
            setSaveAsModalOpen(false);
          }}
          onClose={() => setSaveAsModalOpen(false)}
        />
      )}

      {aboutModalOpen && (
        <div className="modal-overlay" onClick={() => setAboutModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Globe2 size={18} color="var(--accent)" />
              <strong>Sobre o GeoDesk Workstation</strong>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0, color: 'var(--text-muted)' }}>
              GeoDesk é uma estação de trabalho cartográfica moderna de alta precisão para visualização, análise espacial, rotulagem e conversão de dados vetoriais (Shapefile, GeoJSON, GeoPackage, projetos do QGIS, KML/KMZ e ArcGIS REST).
            </p>
            <div style={{ display: 'grid', gap: 4, background: 'var(--bg-2)', padding: 10, borderRadius: 'var(--radius-sm)', fontSize: 11.5 }}>
              <div><strong>Versão:</strong> {appVersion ?? '1.4.3'} (Desktop Engine)</div>
              <div><strong>Licenciado para:</strong> João Paulo Santos</div>
              <div><strong>Motor Cartográfico:</strong> OpenLayers + Proj4js + Turf.js</div>
              <div><strong>Formatos Suportados:</strong> ESRI Shapefile (.shp), GeoJSON, GeoPackage (.gpkg), Projeto QGIS (.qgs/.qgz), KML, KMZ, Excel (.xlsx), CSV, PDF, ArcGIS REST</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={() => setAboutModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado da verificação de atualizações (Ajuda > Verificar Atualizações) */}
      {updateCheck && updateCheck.status === 'available' && (
        <UpdateModal
          check={updateCheck}
          onClose={() => setUpdateCheck(null)}
          onDownload={() => { void handleDownloadUpdate(); }}
          onInstall={() => { void handleInstallUpdate(); }}
          downloading={updateDownloading}
          progress={updateProgress}
          downloaded={updateDownloaded}
          error={updateError}
        />
      )}

      {updateCheck && updateCheck.status === 'up-to-date' && (
        <div className="premium-update-overlay" onClick={() => setUpdateCheck(null)}>
          <div className="premium-update-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="premium-update-hero" style={{ padding: '22px 24px 18px' }}>
              <div className="premium-update-badge-strip">
                <span className="premium-tag-glow" style={{ background: 'rgba(16, 185, 129, 0.25)', borderColor: 'rgba(52, 211, 153, 0.4)', color: '#6ee7b7' }}>
                  <CheckCircle2 size={13} />
                  SISTEMA ATUALIZADO
                </span>
              </div>
              <h2 className="premium-update-title" style={{ fontSize: 18 }}>Você já está na versão mais recente!</h2>
              <p className="premium-update-desc" style={{ fontSize: 12 }}>
                O GeoDesk <strong>v{updateCheck.current}</strong> está com todas as atualizações e correções mais recentes instaladas.
              </p>
              <button type="button" className="premium-update-close" onClick={() => setUpdateCheck(null)} title="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="premium-update-footer" style={{ padding: '14px 24px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary-premium" onClick={() => setUpdateCheck(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {updateCheck && (updateCheck.status === 'error' || updateCheck.status === 'invalid') && (
        <div className="premium-update-overlay" onClick={() => setUpdateCheck(null)}>
          <div className="premium-update-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="premium-update-hero" style={{ padding: '22px 24px 18px', background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
              <div className="premium-update-badge-strip">
                <span className="premium-tag-glow" style={{ background: 'rgba(239, 68, 68, 0.25)', borderColor: 'rgba(248, 113, 113, 0.4)', color: '#fca5a5' }}>
                  VERIFICAÇÃO DE ATUALIZAÇÃO
                </span>
              </div>
              <h2 className="premium-update-title" style={{ fontSize: 18 }}>Não foi possível verificar</h2>
              <p className="premium-update-desc" style={{ fontSize: 12 }}>
                {updateCheck.message || 'Verifique sua conexão com a internet e tente novamente.'}
              </p>
              <button type="button" className="premium-update-close" onClick={() => setUpdateCheck(null)} title="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="premium-update-footer" style={{ padding: '14px 24px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary-premium" onClick={() => setUpdateCheck(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
