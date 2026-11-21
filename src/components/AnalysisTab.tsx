import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { clearSelection, getSelection } from '../map/mapContext';
import { useMeasurement } from '../analysis/measure';
import { bufferActiveLayer, describeLayer, intersectLayers } from '../analysis/spatial';
import { describeCellGroundSize, generateGrid } from '../analysis/grid';
import type { GridOrigin, GridUnit } from '../analysis/grid';
import CollapsibleCard from './CollapsibleCard';

const GROUND_UNITS: { value: GridUnit; label: string }[] = [
  { value: 'm', label: 'Metros' },
  { value: 'km', label: 'Quilômetros' },
];

const PAGE_UNITS: { value: GridUnit; label: string }[] = [
  { value: 'mm', label: 'Milímetros' },
  { value: 'cm', label: 'Centímetros' },
  { value: 'm', label: 'Metros' },
  { value: 'in', label: 'Polegadas' },
  { value: 'ft', label: 'Pés' },
];

interface LogEntry {
  id: string;
  ok: boolean;
  text: string;
  time: string;
}

let logEntries: LogEntry[] = [];

const errorBadgeStyle = { background: 'rgba(248, 113, 113, 0.15)', color: 'var(--red)' };

function pushLog(text: string, ok: boolean): LogEntry[] {
  const entry: LogEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ok,
    text,
    time: new Date().toLocaleTimeString('pt-BR'),
  };
  logEntries = [entry, ...logEntries].slice(0, 50);
  return logEntries;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function AnalysisTab() {
  const layers = useAppStore((s) => s.layers);
  const activeLayerId = useAppStore((s) => s.activeLayerId);
  const setActiveLayer = useAppStore((s) => s.setActiveLayer);
  const setStatus = useAppStore((s) => s.setStatus);
  const tool = useAppStore((s) => s.tool);
  const measurement = useMeasurement();

  const [entries, setEntries] = useState<LogEntry[]>(logEntries);
  const [distance, setDistance] = useState('100');
  const [unit, setUnit] = useState<'m' | 'km'>('m');
  const [layerA, setLayerA] = useState<string>(activeLayerId ?? '');
  const [layerB, setLayerB] = useState<string>('');
  const [selectedCount, setSelectedCount] = useState(() => getSelection().length);
  const [error, setError] = useState<string | null>(null);
  const [gridOutput, setGridOutput] = useState('GridIndexFeatures');
  const [gridBase, setGridBase] = useState<string>('__view__');
  const [gridWidth, setGridWidth] = useState('500');
  const [gridHeight, setGridHeight] = useState('500');
  // Uma única unidade para Largura e Altura (como no ArcMap), evitando células distorcidas.
  const [gridUnit, setGridUnit] = useState<GridUnit>('m');
  const [gridClip, setGridClip] = useState(true);
  const [gridLabels, setGridLabels] = useState(true);
  const [gridPageScale, setGridPageScale] = useState(false);
  const [gridScale, setGridScale] = useState('');
  const [gridOriginX, setGridOriginX] = useState('');
  const [gridOriginY, setGridOriginY] = useState('');
  const [gridRows, setGridRows] = useState('');
  const [gridCols, setGridCols] = useState('');
  const [gridStartPage, setGridStartPage] = useState('1');
  const previousSelectionCount = useRef(0);

  useEffect(() => {
    const tick = () => setSelectedCount(getSelection().length);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);

  // Ao selecionar o trafo, a origem da grade passa a ser a seleção.
  useEffect(() => {
    const hadSelection = previousSelectionCount.current > 0;
    previousSelectionCount.current = selectedCount;
    if (!hadSelection && selectedCount > 0 && gridBase === '__view__') {
      setGridBase('__selection__');
    }
  }, [selectedCount, gridBase]);

  const bufferLayerId =
    activeLayerId && layers.some((layer) => layer.id === activeLayerId) ? activeLayerId : '';
  const fallbackA = bufferLayerId || layers[0]?.id || '';
  const resolvedA = layers.some((layer) => layer.id === layerA) ? layerA : fallbackA;
  const fallbackB = layers.find((layer) => layer.id !== resolvedA)?.id ?? '';
  const resolvedB =
    layerB && layerB !== resolvedA && layers.some((layer) => layer.id === layerB) ? layerB : fallbackB;

  const runBuffer = () => {
    const value = Number(distance.replace(',', '.'));
    setError(null);
    try {
      const result = bufferActiveLayer(value, unit);
      if ('error' in result) {
        setError(result.error);
        setStatus(`Erro no buffer: ${result.error}`);
        setEntries(pushLog(`Buffer: ${result.error}`, false));
        return;
      }
      setEntries(pushLog(`Buffer: ${result.count} feições geradas.`, true));
    } catch (caught) {
      const message = describeError(caught);
      setError(message);
      setStatus(`Erro no buffer: ${message}`);
      setEntries(pushLog(`Buffer: falha inesperada — ${message}`, false));
    }
  };

  const hasSelection = selectedCount > 0;
  const gridBaseIsKnown =
    gridBase === '__view__' || gridBase === '__selection__' || layers.some((layer) => layer.id === gridBase);
  const resolvedGridBase = !gridBaseIsKnown
    ? '__view__'
    : gridBase === '__selection__' && !hasSelection
      ? '__view__'
      : gridBase;

  const gridOrigin: GridOrigin =
    resolvedGridBase === '__selection__' ? 'selection' : resolvedGridBase === '__view__' ? 'view' : 'layer';

  const gridUnits = gridPageScale ? PAGE_UNITS : GROUND_UNITS;
  const gridUnitValue: GridUnit = gridUnits.some((option) => option.value === gridUnit)
    ? gridUnit
    : gridPageScale
      ? 'cm'
      : 'm';

  const togglePageScale = (checked: boolean) => {
    setGridPageScale(checked);
    setGridUnit(checked ? 'cm' : 'm');
  };

  const parseNumber = (value: string): number => Number(value.replace(',', '.').trim());
  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.replace(',', '.').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const parseOptionalInt = (value: string): number | null => {
    const parsed = Math.trunc(parseNumber(value));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  };

  // Prévia do tamanho real da célula no terreno (mostrada antes de gerar).
  const previewWidth = parseNumber(gridWidth);
  const previewHeight = parseNumber(gridHeight);
  const cellPreview =
    previewWidth > 0 && previewHeight > 0
      ? `${describeCellGroundSize(previewWidth, gridUnitValue, gridPageScale, gridScale)} × ${describeCellGroundSize(previewHeight, gridUnitValue, gridPageScale, gridScale)}`
      : null;

  const runGrid = () => {
    setError(null);
    try {
      const result = generateGrid({
        outputName: gridOutput,
        origin: gridOrigin,
        layerId: gridOrigin === 'layer' ? resolvedGridBase : null,
        width: parseNumber(gridWidth),
        widthUnit: gridUnitValue,
        height: parseNumber(gridHeight),
        heightUnit: gridUnitValue,
        pageScale: gridPageScale,
        scaleText: gridScale,
        originX: gridPageScale ? parseOptionalNumber(gridOriginX) : null,
        originY: gridPageScale ? parseOptionalNumber(gridOriginY) : null,
        rows: gridPageScale ? parseOptionalInt(gridRows) : null,
        cols: gridPageScale ? parseOptionalInt(gridCols) : null,
        startPage: gridPageScale ? parseOptionalInt(gridStartPage) ?? 1 : 1,
        clipToInput: gridClip,
        labelCells: gridLabels,
      });
      if ('error' in result) {
        setError(result.error);
        setStatus(`Erro no índice de grade: ${result.error}`);
        setEntries(pushLog(`Índice da grade: ${result.error}`, false));
        return;
      }
      const discarded =
        result.clipped > 0 ? ` ${result.clipped} células fora das feições de entrada descartadas.` : '';
      setEntries(pushLog(`Índice da grade: ${result.count} feições geradas em "${result.name}".${discarded}`, true));
      setStatus(`Feições de índice da grade criadas: ${result.count} células em "${result.name}".`);
    } catch (caught) {
      const message = describeError(caught);
      setError(message);
      setStatus(`Erro no índice de grade: ${message}`);
      setEntries(pushLog(`Índice da grade: falha inesperada — ${message}`, false));
    }
  };

  const runIntersect = () => {
    setError(null);
    try {
      const result = intersectLayers(resolvedA, resolvedB);
      if ('error' in result) {
        setError(result.error);
        setStatus(`Erro na interseção: ${result.error}`);
        setEntries(pushLog(`Interseção: ${result.error}`, false));
        return;
      }
      setEntries(pushLog(`Interseção: ${result.count} feições geradas.`, true));
    } catch (caught) {
      const message = describeError(caught);
      setError(message);
      setStatus(`Erro na interseção: ${message}`);
      setEntries(pushLog(`Interseção: falha inesperada — ${message}`, false));
    }
  };

  return (
    <>
      {tool === 'buffer' && (
        <div className="notice info">
          Clique para executar o buffer pelo formulário abaixo.
        </div>
      )}
      {tool === 'intersect' && (
        <div className="notice info">
          Clique para executar a interseção pelo formulário abaixo.
        </div>
      )}
      {tool === 'grid' && (
        <div className="notice info">
          Selecione o trafo, confira as Feições de Entrada e clique em “Criar feições de índice da grade”.
        </div>
      )}
      {error && <div className="notice error">{error}</div>}

      <CollapsibleCard id="buffer" title="Buffer">
        <div className="field">
          <label htmlFor="analysis-buffer-layer">Camada</label>
          <select
            id="analysis-buffer-layer"
            value={bufferLayerId}
            disabled={layers.length === 0}
            onChange={(event) => setActiveLayer(event.target.value)}
          >
            <option value="" disabled>
              Selecione uma camada
            </option>
            {layers.map((layer) => {
              const info = describeLayer(layer.id);
              return (
                <option key={layer.id} value={layer.id}>
                  {info ? `${info.name} · ${info.count} feições` : layer.name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label htmlFor="analysis-buffer-distance">Distância</label>
          <input
            id="analysis-buffer-distance"
            type="number"
            min={0}
            step="any"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="analysis-buffer-unit">Unidade</label>
          <select
            id="analysis-buffer-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value === 'km' ? 'km' : 'm')}
          >
            <option value="m">Metros</option>
            <option value="km">Quilômetros</option>
          </select>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={!bufferLayerId} onClick={runBuffer}>
            Executar buffer
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="intersect" title="Interseção espacial">
        <div className="field">
          <label htmlFor="analysis-intersect-a">Camada A</label>
          <select
            id="analysis-intersect-a"
            value={resolvedA}
            disabled={layers.length === 0}
            onChange={(event) => setLayerA(event.target.value)}
          >
            {layers.map((layer) => {
              const info = describeLayer(layer.id);
              return (
                <option key={layer.id} value={layer.id}>
                  {info ? `${info.name} · ${info.count} feições` : layer.name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label htmlFor="analysis-intersect-b">Camada B</label>
          <select
            id="analysis-intersect-b"
            value={resolvedB}
            disabled={layers.length === 0}
            onChange={(event) => setLayerB(event.target.value)}
          >
            {layers.map((layer) => {
              const info = describeLayer(layer.id);
              return (
                <option key={layer.id} value={layer.id}>
                  {info ? `${info.name} · ${info.count} feições` : layer.name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!resolvedA || !resolvedB || resolvedA === resolvedB}
            onClick={runIntersect}
          >
            Executar interseção
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="grid" title="Feições de Índice da Grade">

        <div className="field">
          <label htmlFor="analysis-grid-output">Classe de Feição de Saída</label>
          <input
            id="analysis-grid-output"
            type="text"
            value={gridOutput}
            onChange={(event) => setGridOutput(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="analysis-grid-base">Feições de Entrada (opcional)</label>
          <select
            id="analysis-grid-base"
            value={resolvedGridBase}
            onChange={(event) => setGridBase(event.target.value)}
          >
            {hasSelection && (
              <option value="__selection__">Feições selecionadas ({selectedCount})</option>
            )}
            <option value="__view__">Extensão do mapa visível</option>
            {layers.map((layer) => {
              const info = describeLayer(layer.id);
              return (
                <option key={layer.id} value={layer.id}>
                  {info ? `${info.name} · ${info.count} feições` : layer.name}
                </option>
              );
            })}
          </select>
        </div>

        <label className="checkbox-row" htmlFor="analysis-grid-clip">
          <input
            id="analysis-grid-clip"
            type="checkbox"
            checked={gridClip}
            onChange={(event) => setGridClip(event.target.checked)}
          />
          Gerar Grade de Polígono que intersecciona conjuntos de dados ou camadas de feições de entrada
          (opcional)
        </label>

        <label className="checkbox-row" htmlFor="analysis-grid-pagescale">
          <input
            id="analysis-grid-pagescale"
            type="checkbox"
            checked={gridPageScale}
            onChange={(event) => togglePageScale(event.target.checked)}
          />
          Utilizar Unidade da Página e Escala (opcional)
        </label>

        <label className="checkbox-row" htmlFor="analysis-grid-labels">
          <input
            id="analysis-grid-labels"
            type="checkbox"
            checked={gridLabels}
            onChange={(event) => setGridLabels(event.target.checked)}
          />
          Rotular as células com o ShapeName (opcional)
        </label>

        {gridPageScale && (
          <div className="field">
            <label htmlFor="analysis-grid-scale">Escala do Mapa (opcional)</label>
            <input
              id="analysis-grid-scale"
              type="text"
              placeholder="Ex.: 1:24000"
              value={gridScale}
              onChange={(event) => setGridScale(event.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="analysis-grid-width">Largura do Polígono (opcional)</label>
          <div className="field-inline">
            <input
              id="analysis-grid-width"
              type="number"
              min={0}
              step="any"
              value={gridWidth}
              onChange={(event) => setGridWidth(event.target.value)}
            />
            <select
              aria-label="Unidade da Largura do Polígono"
              value={gridUnitValue}
              onChange={(event) => setGridUnit(event.target.value as GridUnit)}
            >
              {gridUnits.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="analysis-grid-height">Altura do Polígono (opcional)</label>
          <div className="field-inline">
            <input
              id="analysis-grid-height"
              type="number"
              min={0}
              step="any"
              value={gridHeight}
              onChange={(event) => setGridHeight(event.target.value)}
            />
            <select
              aria-label="Unidade da Altura do Polígono"
              value={gridUnitValue}
              onChange={(event) => setGridUnit(event.target.value as GridUnit)}
            >
              {gridUnits.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {cellPreview && (
          <div className="muted" id="analysis-grid-cell-preview">
            Cada célula medirá <strong>{cellPreview}</strong> no terreno.
          </div>
        )}

        {gridPageScale && (
          <>
            <div className="field">
              <label>Coordenadas de Origem da Grade do Polígono (opcional)</label>
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="analysis-grid-origin-x">Coordenada X</label>
                  <input
                    id="analysis-grid-origin-x"
                    type="number"
                    step="any"
                    placeholder="-35,4547"
                    value={gridOriginX}
                    onChange={(event) => setGridOriginX(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="analysis-grid-origin-y">Coordenada Y</label>
                  <input
                    id="analysis-grid-origin-y"
                    type="number"
                    step="any"
                    placeholder="-8,0004"
                    value={gridOriginY}
                    onChange={(event) => setGridOriginY(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="analysis-grid-rows">Número de Linhas (opcional)</label>
                  <input
                    id="analysis-grid-rows"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="5"
                    value={gridRows}
                    onChange={(event) => setGridRows(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="analysis-grid-cols">Número de Colunas (opcional)</label>
                  <input
                    id="analysis-grid-cols"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="5"
                    value={gridCols}
                    onChange={(event) => setGridCols(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="analysis-grid-start-page">Iniciando Número de Página (opcional)</label>
              <input
                id="analysis-grid-start-page"
                type="number"
                min={1}
                step={1}
                value={gridStartPage}
                onChange={(event) => setGridStartPage(event.target.value)}
              />
            </div>
          </>
        )}

        <div className="muted">
          {gridOrigin === 'selection'
            ? `Entrada: ${selectedCount} feição(ões) selecionada(s). `
            : gridOrigin === 'layer'
              ? `Entrada: ${describeLayer(resolvedGridBase)?.name ?? 'camada'}. `
              : ''}
          {gridClip
            ? gridOrigin === 'view'
              ? 'Interseção ativa: as células vazias são removidas usando as camadas carregadas. '
              : 'Interseção ativa: só as células que tocam as Feições de Entrada são mantidas. '
            : ''}
          {gridPageScale
            ? 'A Largura/Altura são convertidas para metros pela unidade escolhida e multiplicadas pela escala (vazia = 1:1); a origem usa graus decimais WGS84. '
            : 'A grade é gerada no sistema UTM local e convertida para WGS84. '}
          Máximo de 20.000 células.
        </div>

        <div className="btn-row">
          <button className="btn primary" onClick={runGrid}>
            Criar feições de índice da grade
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="selection" title="Seleção">
        <div className="stats-grid">
          <div className="stat-box">
            <div className="stat-value">{selectedCount}</div>
            <div className="stat-label">Feições selecionadas</div>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" disabled={selectedCount === 0} onClick={() => clearSelection()}>
            Limpar seleção
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="measurement" title="Última medição">
        {measurement ? (
          <div className="stat-box">
            <div className="stat-value">{measurement}</div>
            <div className="stat-label">Medição corrente</div>
          </div>
        ) : (
          <div className="muted">
            Nenhuma medição realizada. Use “Medir distância” ou “Medir área” na barra superior.
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="results" title="Resultados">
        {entries.length === 0 ? (
          <div className="muted">Nenhuma execução registrada ainda.</div>
        ) : (
          entries.map((entry) => (
            <div className="btn-row" key={entry.id}>
              <span className="badge" style={entry.ok ? undefined : errorBadgeStyle}>
                {entry.ok ? 'OK' : 'Erro'}
              </span>
              <span className="muted">
                {entry.time} — {entry.text}
              </span>
            </div>
          ))
        )}
      </CollapsibleCard>
    </>
  );
}
