import { useState } from 'react';
import { Camera, FileJson, FileText, Globe, Layers, Table } from 'lucide-react';
import { useAppStore } from '../store';
import { exportLayerCSV } from '../export/csvExport';

import { exportLayerGeoJSON } from '../export/geojsonExport';
import { exportAllLayersKML, exportLayerKML } from '../export/kmlExport';
import { exportLayerPDF } from '../export/pdfReport';
import { exportMapPNG } from '../export/pngExport';
import ExportKmzDialog from './ExportKmzDialog';

interface Labels {
  pending: string;
  done: string;
  failed: string;
}

const disabledStyle = { opacity: 0.35, cursor: 'not-allowed' } as const;

export default function ExportTools() {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setStatus = useAppStore((s) => s.setStatus);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const [busy, setBusy] = useState(false);
  const [kmzDialogOpen, setKmzDialogOpen] = useState(false);

  const describe = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  const run = async (labels: Labels, task: () => Promise<void> | void): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(labels.pending);
    try {
      await task();
      setStatus(labels.done);
    } catch (error) {
      setStatus(`${labels.failed}: ${describe(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="icon-btn"
        title="Exportar mapa PNG"
        disabled={busy}
        style={busy ? disabledStyle : undefined}
        onClick={() =>
          void run(
            {
              pending: 'Exportando mapa PNG…',
              done: 'Mapa PNG exportado',
              failed: 'Falha ao exportar PNG',
            },
            () => exportMapPNG(),
          )
        }
      >
        <Camera size={14} />
      </button>
      <button
        className="icon-btn"
        title="Exportar camada GeoJSON"
        disabled={busy || !activeLayerId}
        style={busy || !activeLayerId ? disabledStyle : undefined}
        onClick={() => {
          if (!activeLayerId) return;
          void run(
            {
              pending: 'Exportando camada em GeoJSON…',
              done: 'Camada exportada em GeoJSON',
              failed: 'Falha ao exportar GeoJSON',
            },
            () => exportLayerGeoJSON(activeLayerId),
          );
        }}
      >
        <FileJson size={14} />
      </button>
      <button
        className="icon-btn"
        title="Exportar para KMZ / KML (Google Earth) — Selecionar camada"
        disabled={busy || layers.length === 0}
        style={busy || layers.length === 0 ? disabledStyle : undefined}
        onClick={() => setKmzDialogOpen(true)}
      >
        <Globe size={14} />
      </button>
      <button
        className="icon-btn"
        title="Exportar todos os arquivos abertos para KMZ (Google Earth)"
        disabled={busy || layers.length === 0}
        style={busy || layers.length === 0 ? disabledStyle : undefined}
        onClick={() => {
          if (layers.length === 0) return;
          void run(
            {
              pending: 'Exportando projeto completo para KMZ…',
              done: 'Projeto completo exportado para KMZ',
              failed: 'Falha ao exportar KMZ completo',
            },
            () => exportAllLayersKML('kmz'),
          );
        }}
      >
        <Layers size={14} />
      </button>
      <button
        className="icon-btn"
        title="Exportar camada CSV"
        disabled={busy || !activeLayerId}
        style={busy || !activeLayerId ? disabledStyle : undefined}
        onClick={() => {
          if (!activeLayerId) return;
          void run(
            {
              pending: 'Exportando camada em CSV…',
              done: 'Camada exportada em CSV',
              failed: 'Falha ao exportar CSV',
            },
            () => exportLayerCSV(activeLayerId),
          );
        }}
      >
        <Table size={14} />
      </button>
      <button
        className="icon-btn"
        title="Gerar relatório PDF"
        disabled={busy || !activeLayerId}
        style={busy || !activeLayerId ? disabledStyle : undefined}
        onClick={() => {
          if (!activeLayerId) return;
          setRightTab('report');
          void run(
            {
              pending: 'Gerando relatório PDF…',
              done: 'Relatório PDF gerado',
              failed: 'Falha ao gerar relatório PDF',
            },
            () => exportLayerPDF(activeLayerId),
          );
        }}
      >
        <FileText size={14} />
      </button>

      {kmzDialogOpen && <ExportKmzDialog onClose={() => setKmzDialogOpen(false)} />}
    </>
  );
}

