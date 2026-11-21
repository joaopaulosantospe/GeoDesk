import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { applyTableJoin, parseDelimitedText, type ParsedTable } from '../import/tableJoin';
import { loadGeoJSONFile } from '../import/geojsonLoader';
import { loadShapefile } from '../import/shpLoader';
import { useAppStore } from '../store';
import {
  findKeyOverlap,
  layerAsTable,
  layerAttributeJoin,
  layerValueFields,
  type KeyOverlap,
} from '../analysis/layerJoin';
import {
  availableJoinModes,
  geometryKindLabel,
  joinModeDescription,
  layerGeometryKind,
  spatialJoin,
  type SpatialJoinMode,
  type SpatialJoinStat,
} from '../analysis/spatialJoin';

/** Primeira letra maiúscula (ArcMap: "Pontos para Polígonos"). */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Estatísticas do resumo, na ordem da janela "Ligar Dados" do ArcMap. */
const STATS: { value: SpatialJoinStat; label: string }[] = [
  { value: 'mean', label: 'Média' },
  { value: 'min', label: 'Mínimo' },
  { value: 'std', label: 'Desvio Padrão' },
  { value: 'sum', label: 'Soma' },
  { value: 'max', label: 'Máximo' },
  { value: 'var', label: 'Variância' },
];

/**
 * Diálogo "Ligar e Relacionar" (ArcMap): liga atributos de uma tabela ou
 * liga dados de outra camada por localização espacial (ligação espacial).
 */
export default function JoinDialog({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const layer = useAppStore((state) => state.layers.find((candidate) => candidate.id === layerId));
  const layers = useAppStore((state) => state.layers);
  const setStatus = useAppStore((state) => state.setStatus);
  // Ligar atributos a partir da tabela (Join/Relate)
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState('');
  const [keyLayer, setKeyLayer] = useState('');
  const [keyTable, setKeyTable] = useState('');
  const [mode, setMode] = useState<'join' | 'relate'>('join');
  // Origem dos dados: arquivo CSV (padrão) ou a tabela de outra camada do mapa
  const [sourceLayerId, setSourceLayerId] = useState('');
  // Par de campos com valores em comum (undefined = ainda não analisado, null = sem chave)
  const [overlap, setOverlap] = useState<KeyOverlap | null | undefined>(undefined);
  // O que ligar: espacial por padrão (para ligar quadrícula aos pontos por localização)
  const [kind, setKind] = useState<'table' | 'spatial'>('spatial');
  const [joinLayerId, setJoinLayerId] = useState('');
  const [spatialMode, setSpatialMode] = useState<SpatialJoinMode>('summary');
  const [stats, setStats] = useState<SpatialJoinStat[]>([]);
  const [outputName, setOutputName] = useState('Join_Output');
  const [searchRadius, setSearchRadius] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shpInputRef = useRef<HTMLInputElement>(null);
  const geojsonInputRef = useRef<HTMLInputElement>(null);

  const sourceLayer = layers.find((candidate) => candidate.id === sourceLayerId) ?? null;
  // Campos disponíveis na origem: cabeçalhos do CSV ou campos da camada escolhida
  const sourceHeaders = useMemo(
    () => (sourceLayer ? layerValueFields(sourceLayer.id) : (table?.headers ?? [])),
    [sourceLayer, table],
  );

  if (!layer) return null;

  const layerFields = layer.fields.map((field) => field.name);
  const otherLayers = layers.filter((candidate) => candidate.id !== layerId);
  const selectedJoin =
    layers.find((candidate) => candidate.id === joinLayerId) ?? otherLayers[0] ?? null;
  const destKind = layerGeometryKind(layerId);
  const joinKind = selectedJoin ? layerGeometryKind(selectedJoin.id) : 'other';
  const modes = availableJoinModes(destKind, joinKind);
  const activeMode: SpatialJoinMode = modes.includes(spatialMode) ? spatialMode : modes[0];
  const activeKeyLayer = layerFields.includes(keyLayer) ? keyLayer : (layerFields[0] ?? '');
  const activeKeyTable = sourceHeaders.includes(keyTable) ? keyTable : (sourceHeaders[0] ?? '');
  const canApplyTable = sourceLayer
    ? Boolean(activeKeyLayer && activeKeyTable)
    : Boolean(table && activeKeyLayer && activeKeyTable);

  async function onFile(file: File): Promise<void> {
    try {
      const parsed = parseDelimitedText(await file.text());
      if (parsed.headers.length < 2) throw new Error('a tabela precisa de ao menos duas colunas');
      if (parsed.rows.length === 0) throw new Error('a tabela não tem linhas de dados');
      setTable(parsed);
      setFileName(file.name);
      setError(null);
      const preferredLayer = layerFields.find((field) =>
        parsed.headers.some((header) => header.toLowerCase() === field.toLowerCase()),
      );
      setKeyLayer(preferredLayer ?? layerFields[0] ?? '');
      setKeyTable(preferredLayer ?? parsed.headers[0]);
    } catch (caught) {
      setTable(null);
      setFileName('');
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /** Escolhe a origem dos dados: arquivo CSV ou outra camada do mapa. */
  function changeSource(value: string): void {
    setSourceLayerId(value);
    setError(null);
    if (value === '') {
      setOverlap(undefined);
      return;
    }
    // Procura um par de campos com valores em comum para sugerir a chave.
    const found = findKeyOverlap(layerId, value);
    setOverlap(found);
    if (found) {
      setKeyLayer(found.keyLayer);
      setKeyTable(found.keyTable);
    }
  }

  /** Passa para a ligação espacial mantendo a camada escolhida como origem. */
  function goSpatial(): void {
    if (sourceLayerId) setJoinLayerId(sourceLayerId);
    setKind('spatial');
    setOverlap(undefined);
    setError(null);
  }

  /** Carrega um shapefile/GeoJSON do disco e já usa a camada nova nesta ligação. */
  async function loadFromDisk(input: HTMLInputElement, fileType: 'shp' | 'geojson'): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    const known = new Set(useAppStore.getState().layers.map((candidate) => candidate.id));
    try {
      if (fileType === 'shp') await loadShapefile(files);
      else await loadGeoJSONFile(files[0]);
      const newId = useAppStore.getState().activeLayerId;
      if (!newId || known.has(newId)) return;
      if (kind === 'spatial') setJoinLayerId(newId);
      else changeSource(newId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function apply(): void {
    if (!activeKeyLayer || !activeKeyTable) {
      setError('Escolha os campos-chave da camada e da origem.');
      return;
    }
    if (sourceLayer) {
      if (mode === 'relate') {
        // Relacionar: mantém a tabela separada e mostra a contagem (mesma mecânica do CSV).
        const parsed = layerAsTable(sourceLayer.id);
        if (!parsed) {
          setError(`A camada "${sourceLayer.name}" não tem tabela de atributos.`);
          return;
        }
        const related = applyTableJoin(layerId, parsed, sourceLayer.name, {
          keyLayer: activeKeyLayer,
          keyTable: activeKeyTable,
          mode: 'relate',
        });
        if (related.error) {
          setError(related.error);
          return;
        }
        setStatus(related.message ?? 'Camada relacionada.');
        onClose();
        return;
      }
      // Ligar: consolida as duas tabelas em uma NOVA camada.
      const outcome = layerAttributeJoin({
        destId: layerId,
        sourceId: sourceLayer.id,
        keyLayer: activeKeyLayer,
        keyTable: activeKeyTable,
      });
      if ('error' in outcome) {
        setError(outcome.error);
        return;
      }
      setStatus(
        `Ligação criada: "${outcome.name}" — ${outcome.matched} de ${outcome.count} feições combinadas`,
      );
      onClose();
      return;
    }
    if (!table) return;
    const outcome = applyTableJoin(layerId, table, fileName, {
      keyLayer: activeKeyLayer,
      keyTable: activeKeyTable,
      mode,
    });
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setStatus(outcome.message ?? 'Tabela processada.');
    onClose();
  }

  function applySpatial(): void {
    if (!selectedJoin) {
      setError('Escolha a camada que será ligada.');
      return;
    }
    const outcome = spatialJoin({
      destId: layerId,
      joinId: selectedJoin.id,
      mode: activeMode,
      stats,
      outputName,
      searchRadius: Math.max(0, Number(searchRadius.replace(',', '.')) || 0),
    });
    if ('error' in outcome) {
      setError(outcome.error);
      return;
    }
    setStatus(`Ligação espacial criada: "${outcome.name}" com ${outcome.count} feições`);
    onClose();
  }

  function toggleStat(stat: SpatialJoinStat): void {
    setStats((current) =>
      current.includes(stat) ? current.filter((value) => value !== stat) : [...current, stat],
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal join-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <FileSpreadsheet size={15} />
          <strong>Ligar e Relacionar — {layer.name}</strong>
          <button className="icon-btn" title="Fechar" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <p className="join-intro">
          A ligação permite acrescentar dados adicionais para a tabela de atributos da camada, sendo
          possível, por exemplo, simbolizar as feições da camada utilizando estes dados.
        </p>

        <div className="join-kind-block">
          <span className="join-label">O que você deseja ligar à camada?</span>
          <select
            id="join-kind"
            aria-label="O que você deseja ligar à camada?"
            value={kind}
            onChange={(event) => setKind(event.target.value === 'spatial' ? 'spatial' : 'table')}
          >
            <option value="table">Ligar atributos a partir da tabela</option>
            <option value="spatial">
              Ligar dados a partir de outra camada baseado em uma localização espacial
            </option>
          </select>
        </div>

        {/* Carregamento direto do disco (fica disponível nos dois modos) */}
        <input
          ref={shpInputRef}
          id="join-shp-input"
          type="file"
          accept=".shp,.dbf,.prj,.cpg"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => void loadFromDisk(event.currentTarget, 'shp')}
        />
        <input
          ref={geojsonInputRef}
          id="join-geojson-input"
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          style={{ display: 'none' }}
          onChange={(event) => void loadFromDisk(event.currentTarget, 'geojson')}
        />

        {kind === 'table' ? (
          <div className="join-grid">
            <label className="join-label" htmlFor="join-source">
              Origem dos dados
            </label>
            <div className="join-space-top">
              <select
                id="join-source"
                value={sourceLayerId}
                onChange={(event) => changeSource(event.target.value)}
              >
                <option value="">Arquivo CSV ou TXT…</option>
                {otherLayers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {candidate.featureCount} feições
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={() => shpInputRef.current?.click()}
              >
                Shapefile…
              </button>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={() => geojsonInputRef.current?.click()}
              >
                GeoJSON…
              </button>
            </div>

            {!sourceLayer && (
              <>
                <label className="join-label" htmlFor="join-file">
                  Tabela (CSV)
                </label>
                <div className="join-file-row">
                  <input
                    ref={fileRef}
                    id="join-file"
                    type="file"
                    accept=".csv,.txt,text/csv"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onFile(file);
                    }}
                  />
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    Escolher arquivo…
                  </button>
                  <span className="muted">
                    {fileName === ''
                      ? 'nenhum arquivo escolhido'
                      : `${fileName} — ${table?.rows.length ?? 0} linhas, ${table?.headers.length ?? 0} colunas`}
                  </span>
                </div>
              </>
            )}

            {sourceLayer && (overlap === null || (overlap && overlap.matched < 50)) && (
              <div className="notice warn join-notice">
                <span>
                  <strong>Atenção:</strong> A camada <strong>{sourceLayer.name}</strong> é uma camada do mapa.
                  {overlap ? ` Apenas ${overlap.matched} registros coincidiram por chave alfanumérica.` : ' Nenhum valor em comum entre os campos.'}
                  <br />
                  Para preencher a quadrícula de <strong>todos</strong> os pontos pela localização geográfica, utilize a <strong>Ligação Espacial</strong>.
                </span>
                <button type="button" className="btn primary" style={{ marginTop: 6 }} onClick={goSpatial}>
                  Mudar para Ligação Espacial
                </button>
              </div>
            )}

            <label className="join-label" htmlFor="join-key-layer">
              Campo da camada (chave)
            </label>
            <select
              id="join-key-layer"
              value={activeKeyLayer}
              onChange={(event) => setKeyLayer(event.target.value)}
            >
              {layerFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>

            <label className="join-label" htmlFor="join-key-table">
              {sourceLayer ? 'Campo da camada de origem (chave)' : 'Campo da tabela (chave)'}
            </label>
            <select
              id="join-key-table"
              value={activeKeyTable}
              disabled={sourceHeaders.length === 0}
              onChange={(event) => setKeyTable(event.target.value)}
            >
              {sourceHeaders.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>

            <span className="join-label">Tipo</span>
            <div className="join-mode">
              <label>
                <input
                  type="radio"
                  name="join-mode"
                  checked={mode === 'join'}
                  onChange={() => setMode('join')}
                />
                <strong>Ligar (Join)</strong> —{' '}
                {sourceLayer
                  ? 'consolida as duas tabelas e cria uma nova camada'
                  : 'agrega as colunas à tabela de atributos'}
              </label>
              <label>
                <input
                  type="radio"
                  name="join-mode"
                  checked={mode === 'relate'}
                  onChange={() => setMode('relate')}
                />
                <strong>Relacionar (Relate)</strong> — mantém a tabela separada e mostra a contagem
              </label>
            </div>
          </div>
        ) : (
          <div className="join-space">
            <span className="join-step">
              1. Especifique uma camada para ser ligada ou carregue dados espaciais do disco:
            </span>
            <div className="join-space-top">
              <select
                id="join-space-layer"
                aria-label="Camada para ser ligada"
                value={selectedJoin?.id ?? ''}
                onChange={(event) => setJoinLayerId(event.target.value)}
              >
                {otherLayers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={() => shpInputRef.current?.click()}
              >
                Shapefile…
              </button>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={() => geojsonInputRef.current?.click()}
              >
                GeoJSON…
              </button>
            </div>

            <span className="join-geo">
              2. Você está ligando: {capitalize(geometryKindLabel(joinKind, true))} para{' '}
              {capitalize(geometryKindLabel(destKind, true))}
            </span>
            <p className="join-geo-sub">
              Selecione uma classe de feição da ligação acima. Você receberá diferentes opções
              baseadas nos tipos de geometria da classe de feição de origem e da classe de feição de
              ligação.
            </p>

            <div className="join-space-modes">
              {modes.map((option) => (
                <label key={option} htmlFor={`join-space-mode-${option}`}>
                  <input
                    id={`join-space-mode-${option}`}
                    type="radio"
                    name="join-space-mode"
                    checked={activeMode === option}
                    onChange={() => setSpatialMode(option)}
                  />
                  {joinModeDescription(option, destKind, joinKind)}
                </label>
              ))}
            </div>

            {activeMode === 'summary' && (
              <div className="join-stats">
                <span className="join-label">Como deseja que os atributos sejam resumidos?</span>
                <div className="join-stats-row">
                  {STATS.map((stat) => (
                    <label key={stat.value} htmlFor={`join-stat-${stat.value}`}>
                      <input
                        id={`join-stat-${stat.value}`}
                        type="checkbox"
                        checked={stats.includes(stat.value)}
                        onChange={() => toggleStat(stat.value)}
                      />
                      {stat.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeMode === 'nearest' && (
              <p className="join-nota">
                NOTA: Um {geometryKindLabel(joinKind, false)} que cair dentro de um{' '}
                {geometryKindLabel(destKind, false)} será tratado como sendo mais próximo (distância
                zero).
              </p>
            )}

            <span className="join-step">
              Raio de busca (metros, opcional — como no ArcGIS Pro): além de quem está dentro ou na
              borda, contam as feições até esta distância da feição de destino. Vazio = somente
              quem toca.
            </span>
            <input
              id="join-space-radius"
              aria-label="Raio de busca em metros"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={searchRadius}
              onChange={(event) => setSearchRadius(event.target.value)}
            />

            <span className="join-step">
              3. O resultado da ligação será salvo em uma nova camada. Especifique a camada de
              saída:
            </span>
            <input
              id="join-space-output"
              aria-label="Nome da camada de saída"
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
            />
          </div>
        )}

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          {kind === 'table' ? (
            <button
              type="button"
              className="btn primary"
              disabled={!canApplyTable || loading}
              onClick={apply}
            >
              {mode === 'join' ? 'Ligar' : 'Relacionar'}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!selectedJoin || loading}
              onClick={applySpatial}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
