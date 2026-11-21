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
 * Exporta a tabela de atributos da camada para Excel (.xlsx) na ordem exata padrão:
 * - 1ª coluna: OBJECTID (1, 2, 3...)
 * - 2ª coluna: FID_1 (identificador original do ponto: 414, 539, 32...)
 * - Colunas intermediárias na ordem dos atributos (Id, NU_INSTALA, PLACA...)
 * - Colunas finais da ligação: OID_1, PageName, PageNumber
 * - Sem Join_Count e sem ShapeName
 * - Linhas com altura padrão do Excel (15pt dados, 18pt cabeçalho) e largura de colunas otimizada
 */
export async function exportLayerExcel(layerId: string): Promise<void> {
  const source = getLayerSource(layerId);
  if (!source) throw new Error('Camada indisponível para exportação');
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  if (!layer) throw new Error('Camada não encontrada');
  const features = source.getFeatures();
  if (features.length === 0) throw new Error('A camada não possui registros para exportar');

  // Coleta os campos intermediários (exclui campos especiais)
  const middleFieldSet = new Set<string>();
  const middleFields: string[] = [];

  for (const field of layer.fields) {
    const key = field.name.trim();
    if (!shouldExcludeExportField(key) && !middleFieldSet.has(key.toLowerCase())) {
      middleFieldSet.add(key.toLowerCase());
      middleFields.push(key);
    }
  }

  for (const feature of features) {
    const props = feature.getProperties();
    for (const rawKey of Object.keys(props)) {
      const key = rawKey.trim();
      if (!shouldExcludeExportField(key) && !middleFieldSet.has(key.toLowerCase())) {
        middleFieldSet.add(key.toLowerCase());
        middleFields.push(key);
      }
    }
  }

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

  // Ordem exata: OBJECTID, FID_1, [campos intermediários], OID_1, PageName, PageNumber
  const headers = ['OBJECTID', 'FID_1', ...middleFields, ...trailingFields];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GeoDesk';
  workbook.created = new Date();

  const sheetName = (layer.name || 'Dados').slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
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
  const filename = `${slug(layer.name || 'dados_tabela')}.xlsx`;

  downloadBlob(
    filename,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}
