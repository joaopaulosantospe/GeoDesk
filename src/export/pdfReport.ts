import { jsPDF } from 'jspdf';
import { useAppStore } from '../store';
import { computeLayerStats } from './layerStats';
import { composeMapCanvas } from './pngExport';

const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN;

const intFormat = new Intl.NumberFormat('pt-BR');
const km2Format = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const kmFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function extentText(extent: [number, number, number, number]): string {
  return `${extent[0].toFixed(4)}°, ${extent[1].toFixed(4)}° a ${extent[2].toFixed(4)}°, ${extent[3].toFixed(4)}°`;
}

export async function exportLayerPDF(layerId: string): Promise<void> {
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  if (!layer) throw new Error('Camada não encontrada');
  const stats = computeLayerStats(layerId);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensure = (height: number): void => {
    if (y + height > BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeLine = (
    value: string,
    size = 10.5,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    indent = 0,
  ): void => {
    const height = size * 0.3528 * 1.5 + 2;
    ensure(height);
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(35, 40, 55);
    doc.text(value, MARGIN + indent, y + size * 0.3528);
    y += height;
  };

  const rule = (): void => {
    ensure(4);
    doc.setDrawColor(210, 214, 224);
    doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 4;
  };

  const fit = (value: string, maxWidth: number): string => {
    if (doc.getTextWidth(value) <= maxWidth) return value;
    let clipped = value;
    while (clipped.length > 1 && doc.getTextWidth(`${clipped}...`) > maxWidth) clipped = clipped.slice(0, -1);
    return `${clipped}...`;
  };

  const tableRow = (cells: string[], widths: number[] = [], header = false): void => {
    const rowHeight = 6.6;
    ensure(rowHeight + 1);
    if (header) {
      doc.setFillColor(230, 236, 246);
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F');
    }
    doc.setFont('helvetica', header ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(header ? 25 : 45, header ? 30 : 50, header ? 45 : 65);
    let x = MARGIN;
    cells.forEach((cell, index) => {
      const width = widths[index] ?? CONTENT_WIDTH;
      doc.text(fit(cell, width - 4), x + 2, y + 4.4);
      x += width;
    });
    doc.setDrawColor(205, 210, 220);
    doc.line(MARGIN, y + rowHeight, MARGIN + CONTENT_WIDTH, y + rowHeight);
    y += rowHeight;
  };

  writeLine('GeoDesk — Relatório da camada', 18, 'bold');
  writeLine('Estação de trabalho geoespacial', 10, 'italic');
  y += 2;
  rule();

  const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const origin = [layer.kind, layer.url ?? layer.sourceLabel ?? ''].filter(Boolean).join(' — ');

  tableRow(['Propriedade', 'Valor'], [58, 124], true);
  tableRow(['Data e hora', now]);
  tableRow(['Camada', layer.name]);
  tableRow(['CRS', layer.crs]);
  tableRow(['Origem', origin]);
  y += 4;

  writeLine('Estatísticas', 13, 'bold');
  tableRow(['Indicador', 'Valor'], [96, 86], true);
  tableRow(['Feições carregadas', intFormat.format(stats.count)]);
  tableRow(['Tipos geométricos distintos', intFormat.format(Object.keys(stats.types).length)]);
  tableRow(['Campos distintos', intFormat.format(stats.fields.length)]);
  if (stats.totalAreaM2 !== undefined) {
    tableRow(['Área total', `${km2Format.format(stats.totalAreaM2 / 1_000_000)} km²`]);
  }
  if (stats.totalPerimeterM !== undefined) {
    tableRow(['Perímetro total', `${kmFormat.format(stats.totalPerimeterM / 1000)} km`]);
  }
  if (stats.extentWGS84) {
    tableRow(['Extensão (WGS 84)', extentText(stats.extentWGS84)]);
  }
  y += 4;

  writeLine('Tipos geométricos', 13, 'bold');
  tableRow(['Tipo', 'Feições'], [120, 62], true);
  Object.entries(stats.types).forEach(([type, count]) => tableRow([type, intFormat.format(count)]));
  y += 4;

  if (stats.fields.length > 0) {
    writeLine('Campos e preenchimento', 13, 'bold');
    tableRow(['Campo', 'Não nulos'], [120, 62], true);
    stats.fields.forEach((field) =>
      tableRow([field.name, `${intFormat.format(field.nonNull)} de ${intFormat.format(stats.count)}`]),
    );
    y += 4;
  }

  const canvas = await composeMapCanvas();
  const imageHeight = Math.min(CONTENT_WIDTH * (canvas.height / canvas.width), 140);
  ensure(imageHeight + 16);
  writeLine('Snapshot do mapa', 13, 'bold');
  doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', MARGIN, y, CONTENT_WIDTH, imageHeight);
  y += imageHeight + 4;
  writeLine('Gerado localmente pelo GeoDesk sobre as feições carregadas nesta sessão.', 8.5, 'italic');

  await doc.save('relatorio-camada.pdf');
}
