import { useState } from 'react';
import { FileSpreadsheet, Globe, Layers, Pentagon, X } from 'lucide-react';
import { useAppStore } from '../store';
import { clearRegion, useRegionResult, type RegionResult } from '../analysis/regionSelect';
import { formatArea } from '../analysis/measure';
import { summarizeFields } from '../analysis/spatialJoin';
import { uniqueLayerName } from '../analysis/grid';
import { addGeoJSONLayer, featuresToGeoJSON, zoomToLayer } from '../map/mapContext';
import { exportFeaturesExcel } from '../export/excelExport';
import { exportFeaturesKML } from '../export/kmlExport';
import type { FeatureCollection } from 'geojson';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Botões de ação do resultado da seleção de região: exportar os pontos
 * dentro do polígono em Excel (.xlsx) e KML, ou convertê-los em uma nova
 * camada de análise. Usado pelo painel flutuante e pelo Inspetor Lateral.
 */
export function RegionExportActions({ result }: { result: RegionResult }) {
  const setStatus = useAppStore((s) => s.setStatus);
  const [busy, setBusy] = useState<'excel' | 'kml' | 'layer' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const features = result.items.map((item) => item.feature);
  const disabled = result.total === 0 || busy !== null;

  function fail(prefix: string, err: unknown): void {
    const message = `${prefix}: ${describeError(err)}`;
    setError(message);
    setStatus(message);
  }

  function runExcel(): void {
    setBusy('excel');
    setError(null);
    void exportFeaturesExcel(features, 'Pontos na Região', [
      { header: 'Camada', values: result.items.map((item) => item.layerName) },
    ])
      .then(() => setStatus(`Excel exportado com ${result.total} ponto(s) da região.`))
      .catch((err) => fail('Falha ao exportar Excel', err))
      .finally(() => setBusy(null));
  }

  function runKml(): void {
    setBusy('kml');
    setError(null);
    void exportFeaturesKML(features, 'Pontos na Região', 'kml')
      .then(() => setStatus(`KML exportado com ${result.total} ponto(s) da região.`))
      .catch((err) => fail('Falha ao exportar KML', err))
      .finally(() => setBusy(null));
  }

  function runCreateLayer(): void {
    setBusy('layer');
    setError(null);
    try {
      const geojson = featuresToGeoJSON(features) as unknown as FeatureCollection;
      const name = uniqueLayerName('Pontos na Região');
      const id = addGeoJSONLayer({
        name,
        geojson,
        crs: 'EPSG:4326',
        kind: 'analysis',
        sourceLabel: 'Seleção por região',
      });
      const geometryTypesSet = new Set<string>();
      for (const item of result.items) {
        const type = item.feature.getGeometry()?.getType();
        if (type) geometryTypesSet.add(type);
      }
      const geometryTypes = [...geometryTypesSet];
      useAppStore.getState().updateLayer(id, {
        featureCount: result.total,
        geometryTypes,
        fields: summarizeFields(geojson),
      });
      zoomToLayer(id);
      setStatus(`Camada "${name}" criada com ${result.total} ponto(s) da região.`);
    } catch (err) {
      fail('Falha ao criar camada', err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="region-actions">
        <button type="button" className="btn" disabled={disabled} onClick={runExcel}>
          <FileSpreadsheet size={13} />
          {busy === 'excel' ? 'Gerando…' : 'Excel'}
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={runKml}>
          <Globe size={13} />
          {busy === 'kml' ? 'Gerando…' : 'KML'}
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={runCreateLayer}>
          <Layers size={13} />
          {busy === 'layer' ? 'Criando…' : 'Criar Camada'}
        </button>
      </div>
      {error && (
        <div className="notice error" style={{ marginTop: 8, marginBottom: 0 }}>
          {error}
        </div>
      )}
    </>
  );
}

/**
 * Painel flutuante sobre o mapa com o resultado da seleção por polígono:
 * quantidade de pontos dentro, contagem por camada e exportação em
 * Excel/KML. Enquanto a ferramenta está ativa sem polígono, mostra a dica
 * de uso.
 */
export default function RegionSelectPanel() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const result = useRegionResult();

  if (!result) {
    if (tool !== 'region-select') return null;
    return (
      <div className="region-select-panel">
        <div className="region-select-header">
          <div className="region-select-title">
            <Pentagon size={14} color="var(--accent)" />
            <span>Selecionar Região</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="Desativar ferramenta"
            onClick={() => setTool(null)}
          >
            <X size={14} />
          </button>
        </div>
        <div className="region-select-body">
          <div className="muted">
            Clique no mapa para traçar o polígono da região. Duplo-clique para concluir e contar os
            pontos dentro dele; <strong>Esc</strong> cancela.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="region-select-panel">
      <div className="region-select-header">
        <div className="region-select-title">
          <Pentagon size={14} color="var(--accent)" />
          <span>Seleção por Região</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="Limpar região"
          onClick={() => clearRegion()}
        >
          <X size={14} />
        </button>
      </div>
      <div className="region-select-body">
        <div className="region-total">
          <span className="region-total-value">{result.total.toLocaleString('pt-BR')}</span>
          <span className="region-total-label">pontos dentro do polígono</span>
        </div>

        <div className="region-meta">
          Área: {formatArea(result.areaSqM)} · {result.layers.length} camada(s) de pontos avaliada(s)
        </div>

        {result.layers.length === 0 ? (
          <div className="muted">Nenhuma camada de pontos visível no mapa.</div>
        ) : result.total === 0 ? (
          <div className="muted">Nenhum ponto dentro do polígono.</div>
        ) : (
          <div className="region-layer-list">
            {result.layers.map((entry) => (
              <div className="region-layer-row" key={entry.layerId}>
                <span className="region-layer-name">{entry.layerName}</span>
                <span className="region-layer-count">{entry.count.toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        )}

        {result.hiddenPointLayers > 0 && (
          <div className="muted">
            {result.hiddenPointLayers} camada(s) de ponto(s) oculta(s) não considerada(s) na
            contagem.
          </div>
        )}

        <RegionExportActions result={result} />

        <div className="muted">Trace outro polígono para refazer a seleção.</div>
      </div>
    </div>
  );
}
