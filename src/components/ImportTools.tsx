import { useRef, useState } from 'react';
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react';
import { Database, FileJson, FolderOpen, FolderTree, Sparkles } from 'lucide-react';
import { addArcGISService, getArcGISServiceInfo, isArcGISRootUrl } from '../import/arcgisRest';
import type { ArcGISServiceInfo } from '../import/arcgisRest';
import { loadGeoJSONFile } from '../import/geojsonLoader';
import { loadSample, samples } from '../import/samples';
import type { SampleId } from '../import/samples';
import { loadShapefile } from '../import/shpLoader';
import { useAppStore } from '../store';

const directoryInputProps = { webkitdirectory: '', directory: '' } as unknown as InputHTMLAttributes<HTMLInputElement>;

export default function ImportTools() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arcgisOpen, setArcgisOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [serviceInfo, setServiceInfo] = useState<ArcGISServiceInfo | null>(null);
  const shpInputRef = useRef<HTMLInputElement>(null);
  const geojsonInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  async function run(task: () => Promise<void>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      await task();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runValue<T>(task: () => Promise<T>): Promise<T | null> {
    setError(null);
    setBusy(true);
    try {
      return await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function closeArcgis(): void {
    setArcgisOpen(false);
    setServiceInfo(null);
    setUrl('');
  }

  function toggleArcgis(): void {
    if (arcgisOpen) {
      closeArcgis();
      return;
    }
    setArcgisOpen(true);
    setSamplesOpen(false);
  }

  function toggleSamples(): void {
    if (samplesOpen) {
      setSamplesOpen(false);
      return;
    }
    setSamplesOpen(true);
    closeArcgis();
  }

  async function handleShapefileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const snapshot = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (snapshot.length === 0) return;
    await run(() => loadShapefile(snapshot));
  }

  async function handleGeoJSONChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const snapshot = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (snapshot.length === 0) return;
    const file = snapshot[0];
    await run(() => loadGeoJSONFile(file));
  }

  async function handleFolderChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const snapshot = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (snapshot.length === 0) return;
    const shpCount = snapshot.filter((file) => file.name.toLowerCase().endsWith('.shp')).length;
    if (shpCount === 0) {
      setError('A pasta selecionada não contém arquivos .shp.');
      return;
    }
    await run(async () => {
      useAppStore.getState().setStatus(`Carregando ${shpCount} shapefile(s) da pasta…`);
      await loadShapefile(snapshot);
    });
  }

  async function handleServiceAdd(): Promise<void> {
    const target = url.trim();
    if (target === '') return;
    if (isArcGISRootUrl(target)) {
      const info = await runValue(() => getArcGISServiceInfo(target));
      if (!info) return;
      if (info.layers.length > 1) {
        setServiceInfo(info);
        return;
      }
      const added =
        info.layers.length === 1
          ? await run(() => addArcGISService(`${info.url}/${info.layers[0].id}`))
          : await run(() => addArcGISService(info.url));
      if (added) closeArcgis();
      return;
    }
    if (await run(() => addArcGISService(target))) closeArcgis();
  }

  async function handleSublayerAdd(layerId: number): Promise<void> {
    if (!serviceInfo) return;
    if (await run(() => addArcGISService(`${serviceInfo.url}/${layerId}`))) closeArcgis();
  }

  async function handleSample(sampleId: SampleId): Promise<void> {
    if (await run(() => loadSample(sampleId))) setSamplesOpen(false);
  }

  function handleUrlKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleServiceAdd();
    }
    if (event.key === 'Escape') closeArcgis();
  }

  return (
    <>
      <input
        ref={shpInputRef}
        type="file"
        accept=".shp,.dbf,.prj"
        multiple
        hidden
        onChange={(event) => void handleShapefileChange(event)}
      />
      <input
        ref={geojsonInputRef}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        hidden
        onChange={(event) => void handleGeoJSONChange(event)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        {...directoryInputProps}
        onChange={(event) => void handleFolderChange(event)}
      />

      <button className="tool-btn" disabled={busy} onClick={() => shpInputRef.current?.click()}>
        <FolderOpen size={15} />
        Shapefile
      </button>
      <button className="tool-btn" disabled={busy} onClick={() => folderInputRef.current?.click()}>
        <FolderTree size={15} />
        Pasta
      </button>
      <button className="tool-btn" disabled={busy} onClick={() => geojsonInputRef.current?.click()}>
        <FileJson size={15} />
        GeoJSON
      </button>

      <div style={{ position: 'relative' }}>
        <button className={`tool-btn ${arcgisOpen ? 'active' : ''}`} onClick={toggleArcgis}>
          <Database size={15} />
          Serviço ArcGIS
        </button>
        {arcgisOpen && (
          <div
            className="card"
            style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 330, zIndex: 60, boxShadow: 'var(--shadow)' }}
          >
            {serviceInfo && serviceInfo.layers.length > 1 ? (
              <>
                <h3>Subcamadas do serviço</h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {serviceInfo.name}
                </div>
                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  {serviceInfo.layers.map((layer) => (
                    <button
                      key={layer.id}
                      className="tool-btn"
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      disabled={busy}
                      onClick={() => void handleSublayerAdd(layer.id)}
                    >
                      {layer.name}
                      {layer.geometryType && (
                        <span className="muted" style={{ marginLeft: 8 }}>
                          {layer.geometryType}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="btn-row">
                  <button className="btn" onClick={() => setServiceInfo(null)}>
                    Voltar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Serviço ArcGIS REST</h3>
                <div className="field">
                  <label htmlFor="arcgis-url">URL do serviço</label>
                  <input
                    id="arcgis-url"
                    value={url}
                    placeholder="https://servidor/arcgis/rest/services/…/MapServer"
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={handleUrlKeyDown}
                  />
                </div>
                <div className="btn-row">
                  <button className="btn primary" disabled={busy || url.trim() === ''} onClick={() => void handleServiceAdd()}>
                    Adicionar
                  </button>
                  <button className="btn" onClick={closeArcgis}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button className={`tool-btn ${samplesOpen ? 'active' : ''}`} onClick={toggleSamples}>
          <Sparkles size={15} />
          Amostras
        </button>
        {samplesOpen && (
          <div
            className="card"
            style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 280, zIndex: 60, boxShadow: 'var(--shadow)' }}
          >
            <h3>Amostras locais</h3>
            {samples.map((sample) => (
              <button
                key={sample.id}
                className="tool-btn"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                disabled={busy}
                onClick={() => void handleSample(sample.id)}
              >
                <Sparkles size={14} />
                {sample.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="notice error" style={{ margin: 0, maxWidth: 360, cursor: 'pointer' }} role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </>
  );
}
