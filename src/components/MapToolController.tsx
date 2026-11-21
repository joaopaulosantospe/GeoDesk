/**
 * MapToolController
 *
 * Componente "headless" (renderiza null) responsável por ativar e desativar
 * as interações do mapa (Identificar, Medir Distância, Medir Área) sempre
 * que o estado `tool` do store muda.
 *
 * Deve ser montado uma única vez no nível do App para garantir que as
 * ferramentas funcionem independentemente do painel lateral estar aberto.
 */
import { useEffect } from 'react';
import { useAppStore } from '../store';
import { getMap, whenMapReady } from '../map/mapContext';
import * as identify from '../analysis/identify';
import * as measure from '../analysis/measure';
import * as streetView from '../analysis/streetView';
import type Map from 'ol/Map.js';

const ARMED_TOOLS = ['measure-distance', 'measure-area', 'identify', 'street-view'] as const;

export default function MapToolController() {
  const tool = useAppStore((s) => s.tool);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;

    const arm = (map: Map) => {
      if (cancelled || useAppStore.getState().tool !== tool) return;
      if (tool === 'measure-distance') {
        measure.activateDistance(map);
        setStatus('Ferramenta: Medir Distância (clique no mapa para traçar, duplo-clique para concluir)');
      } else if (tool === 'measure-area') {
        measure.activateArea(map);
        setStatus('Ferramenta: Medir Área (clique para desenhar polígono, duplo-clique para concluir)');
      } else if (tool === 'identify') {
        identify.activateIdentify(map);
        setStatus('Ferramenta: Identificar Feição (clique em qualquer feição no mapa)');
      } else if (tool === 'street-view') {
        streetView.activateStreetView(map);
        setStatus('Ferramenta: Street View 360° (clique em qualquer via ou ponto no mapa para ver imagens 360°)');
      }
    };

    if (tool && (ARMED_TOOLS as readonly string[]).includes(tool)) {
      const existing = getMap();
      if (existing) {
        arm(existing);
      } else {
        whenMapReady()
          .then(arm)
          .catch(() => undefined);
      }
    } else {
      measure.deactivate();
      identify.deactivate();
      streetView.deactivateStreetView();
      if (tool === null) {
        setStatus('Modo Navegar / Cursor ativo');
      }
    }

    return () => {
      cancelled = true;
      measure.deactivate();
      identify.deactivate();
      streetView.deactivateStreetView();
    };
  }, [tool, setStatus]);

  return null;
}
