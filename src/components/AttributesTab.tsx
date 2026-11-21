import { useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, FileSpreadsheet, Globe, Search } from 'lucide-react';
import type Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import { getLayerSource, getSelection, setSelection, zoomToFeatures } from '../map/mapContext';
import { useAppStore } from '../store';
import { exportLayerExcel } from '../export/excelExport';
import { exportLayerKML } from '../export/kmlExport';

const MAX_ROWS = 500;

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? numberFormat.format(value) : String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Nome da geometria em pt-BR, como a coluna "Shape" do ArcMap. */
function shapeLabel(type: string | undefined): string {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return 'Ponto';
    case 'LineString':
    case 'MultiLineString':
      return 'Linha';
    case 'Polygon':
    case 'MultiPolygon':
      return 'Polígono';
    default:
      return type ?? '—';
  }
}

/** OID da feição (número do identificador), como a primeira coluna do ArcMap. */
function oidOf(feature: Feature<Geometry>, index: number): string {
  const match = String(feature.getId() ?? '').match(/(\d+)\s*$/);
  return match ? match[1] : String(index + 1);
}

function normalizeKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

interface RowEntry {
  feature: Feature<Geometry>;
  id: string;
  oid: string;
  shape: string;
  cells: string[];
  related: number;
  selected: boolean;
}

export default function AttributesTab() {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setStatus = useAppStore((s) => s.setStatus);
  const [query, setQuery] = useState('');
  const [relatedOpen, setRelatedOpen] = useState<string | null>(null);

  const layer = layers.find((l) => l.id === activeLayerId) ?? null;
  const relate = layer?.join?.mode === 'relate' ? layer.join : null;

  const rows = useMemo(() => {
    const empty = { fieldNames: [] as string[], out: [] as RowEntry[] };
    if (!layer) return empty;
    const source = getLayerSource(layer.id);
    if (!source) return empty;
    const features = source.getFeatures();
    const selectedIds = new Set(getSelection().map((f) => String(f.getId() ?? '')));

    const fieldNames =
      layer.fields.length > 0
        ? layer.fields.map((f) => f.name)
        : Object.keys(features[0]?.getProperties() ?? {}).filter((k) => k !== 'geometry');

    // Relacionar (Relate): índice das linhas da tabela pela chave, para contar registros.
    const relatedIndex = new Map<string, number>();
    if (relate?.rows) {
      for (const row of relate.rows) {
        const key = normalizeKey(row[relate.keyTable]);
        relatedIndex.set(key, (relatedIndex.get(key) ?? 0) + 1);
      }
    }

    const q = query.trim().toLowerCase();
    const out: RowEntry[] = [];

    for (let index = 0; index < features.length; index++) {
      const feature = features[index];
      const props = feature.getProperties();
      const related = relatedIndex.size > 0 ? (relatedIndex.get(normalizeKey(props[relate!.keyLayer])) ?? 0) : 0;
      if (q !== '') {
        const match = fieldNames.some((name) => formatValue(props[name]).toLowerCase().includes(q));
        if (!match) continue;
      }
      const id = String(feature.getId() ?? '');
      out.push({
        feature,
        id,
        oid: oidOf(feature, index),
        shape: shapeLabel(feature.getGeometry()?.getType()),
        cells: fieldNames.map((name) => formatValue(props[name])),
        related,
        selected: selectedIds.has(id),
      });
      if (out.length >= MAX_ROWS) break;
    }
    return { fieldNames, out };
  }, [layer, query, layers, relate]);

  if (!layer) {
    return (
      <div className="empty-state">
        <strong>Nenhuma camada ativa</strong>
        Selecione uma camada no painel lateral para inspecionar e buscar seus atributos.
      </div>
    );
  }

  // Tabela relacionada (Relate): abre a tabela externa em modo somente leitura.
  if (relate && relatedOpen === layer.id) {
    const headers = relate.headers ?? [];
    const relatedRows = (relate.rows ?? []).slice(0, MAX_ROWS);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setRelatedOpen(null)}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <strong style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {relate.name}
          </strong>
          <span className="badge">{relate.rows?.length ?? 0} linhas</span>
        </div>
        <div className="attr-table-wrap" style={{ flex: 1, minHeight: 0 }}>
          <table className="attr-table">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} title={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relatedRows.map((row, index) => (
                <tr key={index}>
                  {headers.map((header) => (
                    <td key={header} title={formatValue(row[header])}>
                      {formatValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted">
          Tabela relacionada por "{relate.keyLayer}" = "{relate.keyTable}". Use a busca na tabela da camada para
          filtrar.
        </div>
      </div>
    );
  }

  const { fieldNames, out } = rows;
  const total = layer.featureCount;

  function selectFeature(entry: { feature: Feature<Geometry>; id: string }, additive: boolean): void {
    const current = getSelection();
    if (additive) {
      const exists = current.some((f) => String(f.getId() ?? '') === entry.id);
      const next = exists
        ? current.filter((f) => String(f.getId() ?? '') !== entry.id)
        : [...current, entry.feature];
      setSelection(next);
    } else {
      setSelection([entry.feature]);
      zoomToFeatures([entry.feature]);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="layer-swatch" style={{ background: layer.style.strokeColor }} />
          <strong style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {layer.name}
          </strong>
          {layer.join && (
            <span
              className="badge"
              title={`Chave: ${layer.join.keyLayer} = ${layer.join.keyTable} · ${layer.join.matched} feições com registros`}
            >
              {layer.join.mode === 'join' ? 'ligada' : 'relacionada'}
            </span>
          )}
          <span className="badge">
            {out.length} / {total}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={13}
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}
            />
            <input
              style={{ width: '100%', paddingLeft: 28 }}
              placeholder="Buscar em todos os campos…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {relate && (
            <button type="button" className="btn" title={relate.name} onClick={() => setRelatedOpen(layer.id)}>
              Ver tabela relacionada
            </button>
          )}
          <button
            type="button"
            className="btn"
            title="Exportar tabela de atributos para Excel (.xlsx)"
            onClick={async () => {
              try {
                setStatus('Exportando para Excel…');
                await exportLayerExcel(layer.id);
                setStatus(`Camada "${layer.name}" exportada para Excel (.xlsx)`);
              } catch (err) {
                setStatus(`Falha ao exportar Excel: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <FileSpreadsheet size={13} />
            Excel
          </button>
          <button
            type="button"
            className="btn"
            title="Exportar feições e tabela de atributos para Google Earth (.kmz)"
            onClick={async () => {
              try {
                setStatus('Exportando para KMZ…');
                await exportLayerKML(layer.id, 'kmz');
                setStatus(`Camada "${layer.name}" exportada para KMZ`);
              } catch (err) {
                setStatus(`Falha ao exportar KMZ: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          >
            <Globe size={13} />
            KMZ
          </button>
        </div>
      </div>

      {fieldNames.length === 0 || out.length === 0 ? (
        <div className="empty-state">
          {fieldNames.length === 0
            ? 'Esta camada não possui campos de atributos — para shapefiles, verifique se o arquivo .dbf está na mesma pasta do .shp.'
            : 'Nenhuma feição corresponde à busca.'}
        </div>
      ) : (
        <div className="attr-table-wrap" style={{ flex: 1, minHeight: 0 }}>
          <table className="attr-table">
            <thead>
              <tr>
                <th style={{ width: 26 }} />
                <th title="OID">OID</th>
                <th title="Shape">Shape</th>
                {fieldNames.map((name) => (
                  <th key={name} title={name}>
                    {name}
                  </th>
                ))}
                {relate && <th title="Registros relacionados">Registros</th>}
              </tr>
            </thead>
            <tbody>
              {out.map((entry) => (
                <tr
                  key={entry.id}
                  className={entry.selected ? 'selected' : ''}
                  onClick={(event) => selectFeature(entry, event.ctrlKey || event.shiftKey)}
                  style={{ cursor: 'pointer' }}
                >
                  <td title="Centralizar">
                    <Crosshair size={12} color={entry.selected ? 'var(--pink)' : 'var(--text-faint)'} />
                  </td>
                  <td title={entry.oid}>{entry.oid}</td>
                  <td title={entry.shape}>{entry.shape}</td>
                  {entry.cells.map((cell, index) => (
                    <td key={index} title={cell}>
                      {cell}
                    </td>
                  ))}
                  {relate && <td title={`${entry.related} registro(s)`}>{entry.related}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > MAX_ROWS && out.length >= MAX_ROWS && (
        <div className="muted">
          Exibindo as primeiras {MAX_ROWS} feições. Use a busca para refinar.
        </div>
      )}
      <div className="muted">Ctrl+clique adiciona/remove da seleção. Botão direito na camada abre o menu.</div>
    </div>
  );
}
