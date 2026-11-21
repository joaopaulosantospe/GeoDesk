import { useEffect, useState } from 'react';
import { CircleDashed, Combine, LayoutGrid, MousePointerClick, Ruler, SquareDashedMousePointer } from 'lucide-react';
import { useAppStore } from '../store';
import { getMap, whenMapReady } from '../map/mapContext';
import * as identify from '../analysis/identify';
import * as measure from '../analysis/measure';
import type Map from 'ol/Map.js';

const ARMED_TOOLS = ['measure-distance', 'measure-area', 'identify'] as const;

export default function AnalysisTools() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const setRightTab = useAppStore((s) => s.setRightTab);

  useEffect(() => {
    let cancelled = false;

    const arm = (map: Map) => {
      if (cancelled || useAppStore.getState().tool !== tool) return;
      if (tool === 'measure-distance') measure.activateDistance(map);
      else if (tool === 'measure-area') measure.activateArea(map);
      else if (tool === 'identify') identify.activateIdentify(map);
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
    }

    return () => {
      cancelled = true;
      measure.deactivate();
      identify.deactivate();
    };
  }, [tool]);

  return (
    <>
      <button
        className={`tool-btn ${tool === 'measure-distance' ? 'active' : ''}`}
        title="Medir distância"
        onClick={() => setTool('measure-distance')}
      >
        <Ruler size={15} />
        Medir distância
      </button>
      <button
        className={`tool-btn ${tool === 'measure-area' ? 'active' : ''}`}
        title="Medir área"
        onClick={() => setTool('measure-area')}
      >
        <CircleDashed size={15} />
        Medir área
      </button>
      <button
        className={`tool-btn ${tool === 'buffer' ? 'active' : ''}`}
        title="Gerar buffer da camada ativa"
        onClick={() => {
          setRightTab('analysis');
          setTool('buffer');
        }}
      >
        <SquareDashedMousePointer size={15} />
        Buffer
      </button>
      <button
        className={`tool-btn ${tool === 'intersect' ? 'active' : ''}`}
        title="Interseção entre duas camadas"
        onClick={() => {
          setRightTab('analysis');
          setTool('intersect');
        }}
      >
        <Combine size={15} />
        Interseção
      </button>
      <button
        className={`tool-btn ${tool === 'grid' ? 'active' : ''}`}
        title="Criar feições de índice da grade (quadícula)"
        onClick={() => {
          setRightTab('analysis');
          setTool('grid');
        }}
      >
        <LayoutGrid size={15} />
        Quadícula
      </button>
      <button
        className={`tool-btn ${tool === 'identify' ? 'active' : ''}`}
        title="Identificar feição sob o cursor"
        onClick={() => setTool('identify')}
      >
        <MousePointerClick size={15} />
        Identificar
      </button>
    </>
  );
}
