import { useMemo, useState } from 'react';
import { Camera, FileJson, FileText, Table } from 'lucide-react';
import { useAppStore } from '../store';
import { computeLayerStats } from '../export/layerStats';
import { exportLayerCSV } from '../export/csvExport';
import { exportLayerGeoJSON } from '../export/geojsonExport';
import { exportLayerPDF } from '../export/pdfReport';
import { exportMapPNG } from '../export/pngExport';

const intFormat = new Intl.NumberFormat('pt-BR');
const km2Format = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const kmFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReportTab() {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setStatus = useAppStore((s) => s.setStatus);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const reportLayerId =
    pickedId && layers.some((l) => l.id === pickedId) ? pickedId : activeLayerId;
  const layer = layers.find((l) => l.id === reportLayerId) ?? null;

  const stats = useMemo(
    () => (reportLayerId ? computeLayerStats(reportLayerId) : null),
    [reportLayerId, layer?.featureCount],
  );

  const describe = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  const fail = (label: string, error: unknown): void => setStatus(`${label}: ${describe(error)}`);

  const onPng = async (): Promise<void> => {
    try {
      setStatus('Exportando mapa PNG…');
      await exportMapPNG();
      setStatus('Mapa PNG exportado');
    } catch (error) {
      fail('Falha ao exportar PNG', error);
    }
  };

  const onGeoJson = (): void => {
    if (!layer) return;
    try {
      exportLayerGeoJSON(layer.id);
      setStatus('Camada exportada em GeoJSON');
    } catch (error) {
      fail('Falha ao exportar GeoJSON', error);
    }
  };

  const onCsv = (): void => {
    if (!layer) return;
    try {
      exportLayerCSV(layer.id);
      setStatus('Camada exportada em CSV');
    } catch (error) {
      fail('Falha ao exportar CSV', error);
    }
  };

  const onPdf = async (): Promise<void> => {
    if (!layer) return;
    try {
      setStatus('Gerando relatório PDF…');
      await exportLayerPDF(layer.id);
      setStatus('Relatório PDF gerado');
    } catch (error) {
      fail('Falha ao gerar relatório PDF', error);
    }
  };

  if (layers.length === 0) {
    return (
      <div className="empty-state">
        <strong>Nenhuma camada carregada</strong>
        Importe dados para gerar estatísticas e relatórios.
      </div>
    );
  }

  if (!layer || !stats) {
    return (
      <div className="empty-state">
        <strong>Nenhuma camada ativa</strong>
        Selecione uma camada para ver o relatório.
      </div>
    );
  }

  const extent = stats.extentWGS84;

  return (
    <div>
      <div className="field">
        <label>Camada do relatório</label>
        <select value={layer.id} onChange={(event) => setPickedId(event.target.value)}>
          {layers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{intFormat.format(stats.count)}</div>
          <div className="stat-label">Feições</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{intFormat.format(Object.keys(stats.types).length)}</div>
          <div className="stat-label">Tipos geométricos</div>
        </div>
        {stats.totalAreaM2 !== undefined && (
          <div className="stat-box">
            <div className="stat-value">{km2Format.format(stats.totalAreaM2 / 1_000_000)}</div>
            <div className="stat-label">Área total (km²)</div>
          </div>
        )}
        {stats.totalPerimeterM !== undefined && (
          <div className="stat-box">
            <div className="stat-value">{kmFormat.format(stats.totalPerimeterM / 1000)}</div>
            <div className="stat-label">Perímetro (km)</div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Tipos geométricos</h3>
        <table className="kv-table">
          <tbody>
            {Object.entries(stats.types).map(([type, count]) => (
              <tr key={type}>
                <td>{type}</td>
                <td>{intFormat.format(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Campos</h3>
        {stats.fields.length === 0 ? (
          <div className="muted">Nenhum atributo nas feições carregadas.</div>
        ) : (
          <table className="kv-table">
            <tbody>
              {stats.fields.map((field) => (
                <tr key={field.name}>
                  <td>{field.name}</td>
                  <td>
                    {intFormat.format(field.nonNull)} / {intFormat.format(stats.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Extensão (WGS 84)</h3>
        <div className="muted">
          {extent
            ? `${extent[0].toFixed(5)}°, ${extent[1].toFixed(5)}° → ${extent[2].toFixed(
                5,
              )}°, ${extent[3].toFixed(5)}°`
            : '—'}
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={() => void onPng()}>
          <Camera size={14} />
          PNG
        </button>
        <button className="btn" onClick={onGeoJson}>
          <FileJson size={14} />
          GeoJSON
        </button>
        <button className="btn" onClick={onCsv}>
          <Table size={14} />
          CSV
        </button>
        <button className="btn primary" onClick={() => void onPdf()}>
          <FileText size={14} />
          PDF
        </button>
      </div>

      <div className="notice info" style={{ marginTop: 10 }}>
        O relatório considera apenas as feições já carregadas nesta sessão. Camadas de serviço podem
        conter dados adicionais no servidor.
      </div>
    </div>
  );
}
