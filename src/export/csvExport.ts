import { getLayerSource } from '../map/mapContext';
import { useAppStore } from '../store';
import { downloadText } from './download';
import { getFeatureFid, shouldExcludeExportField } from './excelExport';

const MAX_FIELDS = 40;

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'camada';
}

function escapeCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function exportLayerCSV(layerId: string): void {
  const source = getLayerSource(layerId);
  if (!source) throw new Error('Camada indisponível para exportação');
  const layer = useAppStore.getState().layers.find((l) => l.id === layerId);
  const features = source.getFeatures();

  const middleFieldSet = new Set<string>();
  const middleFields: string[] = [];

  if (layer?.fields && layer.fields.length > 0) {
    for (const f of layer.fields) {
      const key = f.name.trim();
      if (!shouldExcludeExportField(key) && !middleFieldSet.has(key.toLowerCase())) {
        middleFieldSet.add(key.toLowerCase());
        middleFields.push(key);
      }
    }
  }

  for (const feature of features) {
    const properties = feature.getProperties();
    for (const rawKey of Object.keys(properties)) {
      const key = rawKey.trim();
      if (!shouldExcludeExportField(key) && !middleFieldSet.has(key.toLowerCase())) {
        if (middleFields.length >= MAX_FIELDS) break;
        middleFieldSet.add(key.toLowerCase());
        middleFields.push(key);
      }
    }
  }

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

  const headers = ['OBJECTID', 'FID_1', ...middleFields, ...trailingFields];
  const lines = [headers.map(escapeCell).join(';')];

  features.forEach((feature, index) => {
    const props = feature.getProperties();
    const row = [
      String(index + 1),
      String(getFeatureFid(feature, index)),
      ...middleFields.map((name) => cellValue(props[name])),
    ];

    if (hasOid1) {
      const oidVal = props.OID_1 ?? props.OID ?? props.PageNumber;
      row.push(cellValue(oidVal));
    }
    if (hasPageName) {
      const pageNameVal = props.PageName ?? props.ShapeName;
      row.push(cellValue(pageNameVal));
    }
    if (hasPageNumber) {
      row.push(cellValue(props.PageNumber));
    }

    lines.push(row.map(escapeCell).join(';'));
  });

  downloadText(
    `${slug(layer?.name ?? 'camada')}.csv`,
    `\uFEFF${lines.join('\r\n')}`,
    'text/csv;charset=utf-8',
  );
}
