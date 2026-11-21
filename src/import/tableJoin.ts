import { getLayerSource } from '../map/mapContext';
import { useAppStore } from '../store';
import type { FieldDef } from '../types';

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export interface TableJoinOptions {
  keyLayer: string;
  keyTable: string;
  mode: 'join' | 'relate';
}

export interface TableJoinOutcome {
  error?: string;
  message?: string;
}

/** Lê um CSV/TSV (aceita aspas, ; , ou tabulação como separador). */
export function parseDelimitedText(text: string): ParsedTable {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char] += 1;
  }
  const delimiter = Object.keys(counts).reduce((best, char) => (counts[char] > counts[best] ? char : best), ';');
  const matrix = parseRows(clean, delimiter);
  const headers = (matrix.shift() ?? []).map((header) => header.trim()).filter((header) => header !== '');
  const rows: Record<string, string>[] = [];
  for (const cells of matrix) {
    if (cells.every((cell) => cell === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Aplica "Ligar e Relacionar" (Join/Relate) de uma tabela CSV à camada. */
export function applyTableJoin(
  layerId: string,
  table: ParsedTable,
  tableName: string,
  options: TableJoinOptions,
): TableJoinOutcome {
  const state = useAppStore.getState();
  const record = state.layers.find((layer) => layer.id === layerId);
  const source = getLayerSource(layerId);
  if (!record || !source) return { error: 'A camada não está disponível.' };
  const features = source.getFeatures();
  if (features.length === 0) return { error: 'A camada não tem feições.' };
  if (!table.headers.includes(options.keyTable)) return { error: 'Campo-chave da tabela não encontrado.' };
  if (record.fields.length > 0 && !record.fields.some((field) => field.name === options.keyLayer)) {
    return { error: 'Campo-chave da camada não encontrado.' };
  }

  // Índice das linhas da tabela pela chave (sem acentos/caixa, como comparação de texto).
  const index = new Map<string, Record<string, string>[]>();
  for (const row of table.rows) {
    const key = normalizeKey(row[options.keyTable]);
    if (key === '') continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }

  if (options.mode === 'relate') {
    let matched = 0;
    for (const feature of features) {
      const rows = index.get(normalizeKey(feature.getProperties()[options.keyLayer]));
      if (rows && rows.length > 0) matched += 1;
    }
    state.updateLayer(layerId, {
      join: {
        name: tableName,
        keyLayer: options.keyLayer,
        keyTable: options.keyTable,
        mode: 'relate',
        fields: [],
        headers: table.headers,
        rows: table.rows,
        matched,
      },
    });
    return {
      message: `Tabela "${tableName}" relacionada por "${options.keyLayer}" = "${options.keyTable}": ${matched} de ${features.length} feições têm registros (${table.rows.length} linhas).`,
    };
  }

  // Ligar (Join): agrega as colunas da tabela às feições, como no ArcMap.
  const extra = table.headers.filter((header) => header !== options.keyTable);
  const conflicts = extra.filter((name) => record.fields.some((field) => field.name === name));
  const added = extra.filter((name) => !conflicts.includes(name));
  if (added.length === 0) {
    return { error: 'A tabela não tem colunas novas para ligar à camada.' };
  }

  let matched = 0;
  for (const feature of features) {
    const rows = index.get(normalizeKey(feature.getProperties()[options.keyLayer]));
    if (!rows || rows.length === 0) continue;
    matched += 1;
    const row = rows[0]; // como no ArcMap: a primeira correspondência
    for (const name of added) feature.set(name, row[name] ?? '', true);
  }

  const joinedFields: FieldDef[] = added.map((name) => ({ name, type: 'texto' }));
  state.updateLayer(layerId, {
    fields: [...record.fields, ...joinedFields],
    join: {
      name: tableName,
      keyLayer: options.keyLayer,
      keyTable: options.keyTable,
      mode: 'join',
      fields: joinedFields,
      matched,
    },
  });
  const warn = conflicts.length > 0 ? ` Colunas ignoradas por já existirem: ${conflicts.join(', ')}.` : '';
  return {
    message: `Tabela "${tableName}" ligada por "${options.keyLayer}" = "${options.keyTable}": ${matched} de ${features.length} feições receberam ${added.length} coluna(s).${warn}`,
  };
}

/** Desliga a tabela da camada (remove as colunas agregadas no modo Ligar). */
export function removeTableJoin(layerId: string): string {
  const state = useAppStore.getState();
  const record = state.layers.find((layer) => layer.id === layerId);
  if (!record?.join) return 'Nenhuma tabela está ligada a esta camada.';
  const join = record.join;
  const source = getLayerSource(layerId);
  if (join.mode === 'join' && source) {
    const names = join.fields.map((field) => field.name);
    for (const feature of source.getFeatures()) {
      for (const name of names) feature.unset(name, true);
    }
  }
  state.updateLayer(layerId, {
    fields: record.fields.filter((field) => !join.fields.some((joined) => joined.name === field.name)),
    join: undefined,
  });
  return `Tabela "${join.name}" desligada de "${record.name}".`;
}

function normalizeKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let index = 0;

  const pushValue = () => {
    row.push(value.trim());
    value = '';
  };

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      value += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      pushValue();
      index += 1;
      continue;
    }
    if (char === '\n') {
      pushValue();
      rows.push(row);
      row = [];
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    value += char;
    index += 1;
  }
  if (value !== '' || row.length > 0) {
    pushValue();
    rows.push(row);
  }
  return rows;
}
