import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  ChevronDown,
  Database,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  FolderTree,
  Globe,
  Globe2,
  HelpCircle,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Sparkles,
  Table,
} from 'lucide-react';
import { useAppStore } from '../store';
import { exportMapPNG } from '../export/pngExport';
import { exportLayerGeoJSON } from '../export/geojsonExport';
import { exportAllLayersKML } from '../export/kmlExport';
import { exportLayerCSV } from '../export/csvExport';
import { exportLayerPDF } from '../export/pdfReport';
import { loadGeoJSONFile } from '../import/geojsonLoader';
import { loadShapefile } from '../import/shpLoader';
import { loadSample, samples } from '../import/samples';
import { addArcGISService, getArcGISServiceInfo, isArcGISRootUrl, type ArcGISServiceInfo } from '../import/arcgisRest';
import ExportKmzDialog from './ExportKmzDialog';
import ShortcutsModal from './ShortcutsModal';

interface AppHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
}

export default function AppHeader({
  sidebarOpen,
  setSidebarOpen,
  rightPanelOpen,
  setRightPanelOpen,
}: AppHeaderProps) {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setStatus = useAppStore((s) => s.setStatus);
  const setRightTab = useAppStore((s) => s.setRightTab);

  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [arcgisModalOpen, setArcgisModalOpen] = useState(false);
  const [samplesModalOpen, setSamplesModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [kmzDialogOpen, setKmzDialogOpen] = useState(false);

  // ArcGIS REST state
  const [url, setUrl] = useState('');
  const [serviceInfo, setServiceInfo] = useState<ArcGISServiceInfo | null>(null);
  const [arcgisBusy, setArcgisBusy] = useState(false);
  const [arcgisError, setArcgisError] = useState<string | null>(null);

  const shpInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const geojsonInputRef = useRef<HTMLInputElement>(null);

  const importRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Fechar menus ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (importRef.current && !importRef.current.contains(event.target as Node)) {
        setImportMenuOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalFeatures = layers.reduce((acc, l) => acc + l.featureCount, 0);

  // Handlers de Importação
  const handleShpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando Shapefile…');
      await loadShapefile(files);
      setStatus('Shapefile carregado com sucesso');
    } catch (err) {
      setStatus(`Erro ao carregar Shapefile: ${err instanceof Error ? err.message : String(err)}`);
    }
    setImportMenuOpen(false);
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando pasta com arquivos geoespaciais…');
      await loadShapefile(files);
      setStatus('Pasta carregada com sucesso');
    } catch (err) {
      setStatus(`Erro ao carregar pasta: ${err instanceof Error ? err.message : String(err)}`);
    }
    setImportMenuOpen(false);
  };

  const handleGeoJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setStatus('Carregando arquivo GeoJSON…');
      await loadGeoJSONFile(files[0]);
      setStatus('GeoJSON carregado com sucesso');
    } catch (err) {
      setStatus(`Erro ao carregar GeoJSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    setImportMenuOpen(false);
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

  return (
    <header className="app-top-header">
      {/* Inputs de arquivo ocultos */}
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

      {/* Esquerda: Identidade da Aplicação e Breadcrumb */}
      <div className="header-brand-cluster">
        <div className="header-logo-mark">
          <Globe2 size={16} color="#ffffff" strokeWidth={2.4} />
        </div>
        <div className="header-titles">
          <div className="header-title-row">
            <span className="header-app-name">GeoDesk</span>
            <span className="header-badge-tag">Workstation</span>
          </div>
          <span className="header-status-crumb">
            {layers.length === 0
              ? 'Nenhuma camada aberta'
              : `${layers.length} ${layers.length === 1 ? 'camada' : 'camadas'} · ${totalFeatures.toLocaleString('pt-BR')} feições`}
          </span>
        </div>
      </div>

      {/* Centro / Ações Globais */}
      <div className="header-actions-cluster">
        {/* Dropdown: Importar Dados */}
        <div className="header-dropdown-anchor" ref={importRef}>
          <button
            type="button"
            className="header-action-btn primary"
            onClick={() => {
              setImportMenuOpen(!importMenuOpen);
              setExportMenuOpen(false);
            }}
          >
            <Plus size={15} strokeWidth={2.2} />
            <span>Importar Dados</span>
            <ChevronDown size={13} className={`chevron-icon ${importMenuOpen ? 'open' : ''}`} />
          </button>

          {importMenuOpen && (
            <div className="header-popover-menu">
              <div className="popover-section-label">Arquivos Locais</div>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  shpInputRef.current?.click();
                  setImportMenuOpen(false);
                }}
              >
                <FolderOpen size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Shapefile (.shp)</div>
                  <div className="popover-item-sub">Arquivos ESRI Shapefile com .dbf e .prj</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  folderInputRef.current?.click();
                  setImportMenuOpen(false);
                }}
              >
                <FolderTree size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Pasta de Shapefiles</div>
                  <div className="popover-item-sub">Carrega múltiplos shapefiles de um diretório</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  geojsonInputRef.current?.click();
                  setImportMenuOpen(false);
                }}
              >
                <FileJson size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Arquivo GeoJSON</div>
                  <div className="popover-item-sub">Padrão aberto .geojson ou .json</div>
                </div>
              </button>

              <div className="popover-divider" />
              <div className="popover-section-label">Web & Amostras</div>

              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  setArcgisModalOpen(true);
                  setImportMenuOpen(false);
                }}
              >
                <Database size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Serviço ArcGIS REST</div>
                  <div className="popover-item-sub">Conectar a MapServer ou FeatureServer online</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  setSamplesModalOpen(true);
                  setImportMenuOpen(false);
                }}
              >
                <Sparkles size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Dados de Demonstração</div>
                  <div className="popover-item-sub">Brasil estados, países do mundo ou sensores</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Dropdown: Exportar */}
        <div className="header-dropdown-anchor" ref={exportRef}>
          <button
            type="button"
            className="header-action-btn"
            onClick={() => {
              setExportMenuOpen(!exportMenuOpen);
              setImportMenuOpen(false);
            }}
          >
            <Download size={14} />
            <span>Exportar</span>
            <ChevronDown size={13} className={`chevron-icon ${exportMenuOpen ? 'open' : ''}`} />
          </button>

          {exportMenuOpen && (
            <div className="header-popover-menu" style={{ minWidth: 260 }}>
              <div className="popover-section-label">Visualização do Mapa</div>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  setExportMenuOpen(false);
                  void exportMapPNG();
                }}
              >
                <Camera size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Capturar Imagem PNG</div>
                  <div className="popover-item-sub">Exporta o quadro atual do mapa em alta resolução</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                disabled={layers.length === 0}
                onClick={() => {
                  setExportMenuOpen(false);
                  setKmzDialogOpen(true);
                }}
              >
                <Globe size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Google Earth (KML / KMZ)</div>
                  <div className="popover-item-sub">Exportar camada(s) com simbologia e atributos</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                disabled={layers.length === 0}
                onClick={() => {
                  setExportMenuOpen(false);
                  void exportAllLayersKML('kmz');
                }}
              >
                <Layers size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Projeto Completo KMZ</div>
                  <div className="popover-item-sub">Pacote consolidado com todas as camadas</div>
                </div>
              </button>

              <div className="popover-divider" />
              <div className="popover-section-label">Dados da Camada Ativa</div>

              <button
                type="button"
                className="popover-item"
                disabled={!activeLayerId}
                onClick={() => {
                  setExportMenuOpen(false);
                  if (activeLayerId) void exportLayerGeoJSON(activeLayerId);
                }}
              >
                <FileJson size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Exportar GeoJSON</div>
                  <div className="popover-item-sub">Geometrias e atributos da camada selecionada</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                disabled={!activeLayerId}
                onClick={() => {
                  setExportMenuOpen(false);
                  if (activeLayerId) void exportLayerCSV(activeLayerId);
                }}
              >
                <Table size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Tabela CSV</div>
                  <div className="popover-item-sub">Planilha com todos os campos e atributos</div>
                </div>
              </button>

              <button
                type="button"
                className="popover-item"
                disabled={!activeLayerId}
                onClick={() => {
                  setExportMenuOpen(false);
                  if (activeLayerId) {
                    setRightTab('report');
                    void exportLayerPDF(activeLayerId);
                  }
                }}
              >
                <FileText size={15} color="var(--accent)" />
                <div>
                  <div className="popover-item-title">Relatório Técnico PDF</div>
                  <div className="popover-item-sub">Ficha cadastral com mapas e estatísticas</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Direita: Atalhos, Ajuda e Alternadores de Painéis */}
      <div className="header-controls-cluster">
        <button
          type="button"
          className="header-icon-tool"
          title="Atalhos de teclado e guia de navegação (Ctrl+K)"
          onClick={() => setShortcutsModalOpen(true)}
        >
          <HelpCircle size={15} />
        </button>

        <div className="header-tool-divider" />

        {/* Toggle Painel Esquerdo (Camadas) */}
        <button
          type="button"
          className={`header-icon-tool ${sidebarOpen ? 'active' : ''}`}
          title={sidebarOpen ? 'Ocultar Painel de Camadas' : 'Exibir Painel de Camadas'}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {/* Toggle Painel Direito (Inspetor/Atributos) */}
        <button
          type="button"
          className={`header-icon-tool ${rightPanelOpen ? 'active' : ''}`}
          title={rightPanelOpen ? 'Ocultar Inspetor Lateral' : 'Exibir Inspetor Lateral'}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>

      {/* Modal: Amostras Rápidas */}
      {samplesModalOpen && (
        <div className="modal-overlay" onClick={() => setSamplesModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Sparkles size={16} color="var(--accent)" />
              <strong>Carregar Conjuntos de Amostra</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Selecione um conjunto de dados para explorar as funcionalidades de visualização e geoprocessamento:
            </p>
            <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="popover-item"
                  style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)' }}
                  onClick={async () => {
                    setSamplesModalOpen(false);
                    await loadSample(s.id);
                  }}
                >
                  <Globe size={16} color="var(--accent)" />
                  <div style={{ textAlign: 'left' }}>
                    <div className="popover-item-title">{s.label}</div>
                    <div className="popover-item-sub">Conjunto de dados cartográficos otimizado</div>
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

      {/* Modal: Serviço ArcGIS REST */}
      {arcgisModalOpen && (
        <div className="modal-overlay" onClick={() => setArcgisModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Database size={16} color="var(--accent)" />
              <strong>Adicionar Serviço ArcGIS REST</strong>
            </div>

            {serviceInfo && serviceInfo.layers.length > 1 ? (
              <div>
                <p className="muted" style={{ marginBottom: 10 }}>
                  O serviço contém múltiplas subcamadas. Escolha qual deseja importar:
                </p>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 6 }}>
                  {serviceInfo.layers.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="popover-item"
                      style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-sm)' }}
                      disabled={arcgisBusy}
                      onClick={() => handleSublayerAdd(l.id)}
                    >
                      <Layers size={14} color="var(--accent)" />
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div className="popover-item-title">{l.name}</div>
                        {l.geometryType && <div className="popover-item-sub">{l.geometryType}</div>}
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
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                  Insira a URL de um serviço de feições ou mapa ArcGIS REST (ex: ArcGIS Online, IBGE, GeoServer REST):
                </p>
                <div className="field">
                  <label htmlFor="arcgis-url-input">URL do Serviço</label>
                  <input
                    id="arcgis-url-input"
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
                    {arcgisBusy ? 'Conectando…' : 'Conectar e Carregar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Diálogos secundários */}
      {kmzDialogOpen && <ExportKmzDialog onClose={() => setKmzDialogOpen(false)} />}
      {shortcutsModalOpen && <ShortcutsModal onClose={() => setShortcutsModalOpen(false)} />}
    </header>
  );
}
