import ExcelJS from 'exceljs';
import type Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import { getLayerSource } from '../map/mapContext';
import { useAppStore } from '../store';
import { downloadBlob } from './download';

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return base || 'camada';
}

const SPECIAL_FIELDS = new Set([
  'geometry',
  'objectid',
  'fid_1',
  'fid',
  'join_count',
  'shapename',
  'oid_1',
  'oid',
  'pagename',
  'pagenumber',
]);

export function shouldExcludeExportField(name: string): boolean {
  return SPECIAL_FIELDS.has(name.trim().toLowerCase());
}

/** Obtém o identificador original da feição para a coluna FID_1 (ex: 414, 539...). */
export function getFeatureFid(feature: Feature<Geometry>, index: number): number | string {
  const props = feature.getProperties();
  if (props.FID_1 != null && props.FID_1 !== '') {
    const num = Number(props.FID_1);
    return Number.isFinite(num) ? num : (props.FID_1 as string);
  }
  if (props.FID != null && props.FID !== '') {
    const num = Number(props.FID);
    return Number.isFinite(num) ? num : (props.FID as string);
  }
  const rawId = feature.getId();
  if (rawId != null) {
    const match = String(rawId).match(/(\d+)\s*$/);
    if (match) return Number(match[1]);
  }
  return index + 1;
}

/**
 * Coleta os campos intermediários (exclui campos especiais), na ordem dada
 * (ex: `layer.fields`) e completando com o que existir nas feições.
 */
function collectMiddleFields(features: Feature<Geometry>[], seed: string[] = []): string[] {
  const seen = new Set<string>();
  const fields: string[] = [];
  const add = (rawKey: string) => {
    const key = rawKey.trim();
    if (!key || shouldExcludeExportField(key) || seen.has(key.toLowerCase())) return;
    seen.add(key.toLowerCase());
    fields.push(key);
  };
  seed.forEach(add);
  for (const feature of features) {
    for (const rawKey of Object.keys(feature.getProperties())) add(rawKey);
  }
  return fields;
}

interface ExcelTableOptions {
  features: Feature<Geometry>[];
  middleFields: string[];
  /** Colunas extras entre FID_1 e os atributos, alinhadas por índice às feições. */
  leadingColumns?: { header: string; values: unknown[] }[];
  sheetName: string;
  filename: string;
}

/**
 * Monta a planilha no padrão ArcMap e dispara o download:
 * - 1ª coluna: OBJECTID (1, 2, 3...)
 * - 2ª coluna: FID_1 (identificador original do ponto: 414, 539, 32...)
 * - Colunas extras (quando fornecidas)
 * - Colunas intermediárias na ordem dos atributos (Id, NU_INSTALA, PLACA...)
 * - Colunas finais da ligação: OID_1, PageName, PageNumber
 * - Sem Join_Count e sem ShapeName
 * - Linhas com altura padrão do Excel (15pt dados, 18pt cabeçalho) e largura de colunas otimizada
 */
async function downloadExcelTable(options: ExcelTableOptions): Promise<void> {
  const { features, middleFields, leadingColumns = [] } = options;

  // Verifica presença de campos da ligação (OID_1, PageName, PageNumber)
  let hasOid1 = false;
  let hasPageName = false;
  let hasPageNumber = false;

  for (const feature of features) {
    const props = feature.getProperties();
    if (!hasOid1 && (props.OID_1 !== undefined || props.OID !== undefined || props.PageNumber !== undefined)) {
      hasOid1 = true;
    }
    if (!hasPageName && (props.PageName !== undefined || props.ShapeName !== undefined)) {
      hasPageName = true;
    }
    if (!hasPageNumber && props.PageNumber !== undefined) {
      hasPageNumber = true;
    }
  }

  const trailingFields: string[] = [];
  if (hasOid1) trailingFields.push('OID_1');
  if (hasPageName) trailingFields.push('PageName');
  if (hasPageNumber) trailingFields.push('PageNumber');

  // Ordem exata: OBJECTID, FID_1, [extras], [campos intermediários], OID_1, PageName, PageNumber
  const headers = [
    'OBJECTID',
    'FID_1',
    ...leadingColumns.map((column) => column.header),
    ...middleFields,
    ...trailingFields,
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GeoDesk';
  workbook.created = new Date();

  const sheetName = (options.sheetName || 'Dados').slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // Cabeçalho estilizado: altura padrão 18pt, fundo cinza e texto negrito
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 18;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' }, // Fundo cinza suave do Excel / ArcMap
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FF000000' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FF808080' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });

  // Linhas de dados com altura padrão do Excel (15pt)
  features.forEach((feature, index) => {
    const props = feature.getProperties();
    const rowValues: unknown[] = [
      index + 1,
      getFeatureFid(feature, index),
      ...leadingColumns.map((column) => column.values[index] ?? ''),
    ];

    for (const field of middleFields) {
      const val = props[field];
      if (val === null || val === undefined) {
        rowValues.push('');
      } else if (typeof val === 'number') {
        rowValues.push(Number.isFinite(val) ? val : '');
      } else if (typeof val === 'boolean') {
        rowValues.push(val);
      } else if (typeof val === 'object') {
        rowValues.push(JSON.stringify(val));
      } else {
        rowValues.push(String(val));
      }
    }

    if (hasOid1) {
      const oidVal = props.OID_1 ?? props.OID ?? props.PageNumber;
      rowValues.push(oidVal !== undefined && oidVal !== null ? oidVal : '');
    }
    if (hasPageName) {
      const pageNameVal = props.PageName ?? props.ShapeName;
      rowValues.push(pageNameVal !== undefined && pageNameVal !== null ? String(pageNameVal) : '');
    }
    if (hasPageNumber) {
      rowValues.push(props.PageNumber !== undefined && props.PageNumber !== null ? props.PageNumber : '');
    }

    const row = worksheet.addRow(rowValues);
    row.height = 15; // Altura padrão de linha no Excel
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: 'Calibri',
        size: 11,
        color: { argb: 'FF000000' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: typeof cell.value === 'number' ? 'right' : 'left',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
    });
  });

  // Ajusta a largura das colunas no padrão (compacto e legível)
  worksheet.columns.forEach((col, index) => {
    const header = headers[index] ?? '';
    let maxLen = header.length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 2.5, 9), 35);
  });

  const buffer = await workbook.xlsx.writeBuffer();

  downloadBlob(
    options.filename,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}

/**
 * Exporta a tabela de atributos da camada para Excel (.xlsx) na ordem exata padrão.
 */
export async function exportLayerExcel(layerId: string): Promise<void> {
  const source = getLayerSource(layerId);
  if (!source) throw new Error('Camada indisponível para exportação');
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  if (!layer) throw new Error('Camada não encontrada');
  const features = source.getFeatures();
  if (features.length === 0) throw new Error('A camada não possui registros para exportar');

  const middleFields = collectMiddleFields(
    features,
    layer.fields.map((field) => field.name),
  );

  await downloadExcelTable({
    features,
    middleFields,
    sheetName: layer.name || 'Dados',
    filename: `${slug(layer.name || 'dados_tabela')}.xlsx`,
  });
}

/**
 * Exporta uma lista arbitrária de feições (ex: pontos dentro de um polígono)
 * para Excel (.xlsx), com colunas extras opcionais (ex: camada de origem).
 */
export async function exportFeaturesExcel(
  features: Feature<Geometry>[],
  name: string,
  leadingColumns?: { header: string; values: unknown[] }[],
): Promise<void> {
  if (features.length === 0) throw new Error('Nenhuma feição para exportar');

  await downloadExcelTable({
    features,
    middleFields: collectMiddleFields(features),
    leadingColumns,
    sheetName: name || 'Dados',
    filename: `${slug(name || 'feicoes')}.xlsx`,
  });
}
