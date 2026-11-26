import { create } from 'zustand';
import type { BasemapId, LayerRecord, LayerStyle, RightTab, ToolId } from './types';

export const layerPalette = [
  '#2563eb', // Royal Blue
  '#059669', // Forest Emerald
  '#d97706', // Warm Amber
  '#dc2626', // Crimson Red
  '#7c3aed', // Deep Violet
  '#0891b2', // Dark Teal
  '#c026d3', // Cartographic Fuchsia
  '#475569', // Slate
];

export function nextLayerStyle(index: number): LayerStyle {
  const c = layerPalette[index % layerPalette.length];
  return {
    strokeColor: c,
    fillColor: c + '33',
    strokeWidth: 1.8,
    pointRadius: 5,
  };
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AppState {
  layers: LayerRecord[];
  activeLayerId: string | null;
  basemapId: BasemapId;
  tool: ToolId;
  rightTab: RightTab;
  rightPanelOpen: boolean;
  status: string;
  streetViewLocation: { lat: number; lon: number } | null;
  addLayer: (layer: LayerRecord) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<LayerRecord>) => void;
  reorderLayer: (id: string, dir: -1 | 1) => void;
  moveLayerNear: (id: string, targetId: string, pos: 'above' | 'below') => void;
  bringLayerToFront: (id: string) => void;
  sendLayerToBack: (id: string) => void;
  setActiveLayer: (id: string | null) => void;
  setBasemap: (id: BasemapId) => void;
  setTool: (tool: ToolId) => void;
  setRightTab: (tab: RightTab) => void;
  setRightPanelOpen: (open: boolean) => void;
  openRightPanel: () => void;
  setStatus: (status: string) => void;
  setStreetViewLocation: (loc: { lat: number; lon: number } | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  layers: [],
  activeLayerId: null,
  basemapId: 'osm',
  tool: null,
  rightTab: 'attributes',
  rightPanelOpen: false,
  status: 'Pronto',
  streetViewLocation: null,

  addLayer: (layer) => set((s) => ({ layers: [...s.layers, layer], activeLayerId: layer.id })),

  removeLayer: (id) =>
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      activeLayerId: s.activeLayerId === id ? null : s.activeLayerId,
    })),

  updateLayer: (id, patch) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),

  reorderLayer: (id, dir) =>
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id);
      if (idx < 0) return s;
      const target = idx + dir;
      if (target < 0 || target >= s.layers.length) return s;
      const layers = [...s.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(target, 0, item);
      return { layers };
    }),

  // Reordenação por arrastar: posiciona `id` logo acima ('above') ou abaixo
  // ('below') de `targetId` na exibição do painel. A lista é mostrada invertida
  // (topo da pilha primeiro), então "acima" = índice maior = zIndex maior.
  moveLayerNear: (id, targetId, pos) =>
    set((s) => {
      if (id === targetId) return s;
      const from = s.layers.findIndex((l) => l.id === id);
      const hover = s.layers.findIndex((l) => l.id === targetId);
      if (from < 0 || hover < 0) return s;
      let insert = pos === 'above' ? hover + 1 : hover;
      const layers = [...s.layers];
      const [item] = layers.splice(from, 1);
      if (from < insert) insert -= 1;
      layers.splice(Math.max(0, Math.min(insert, layers.length)), 0, item);
      if (layers.every((l, i) => l === s.layers[i])) return s;
      return { layers };
    }),

  // Traz a camada para o topo visual da pilha (maior z-index no mapa).
  bringLayerToFront: (id) =>
    set((s) => {
      const index = s.layers.findIndex((l) => l.id === id);
      if (index < 0 || index >= s.layers.length - 1) return s;
      const layers = [...s.layers];
      const [item] = layers.splice(index, 1);
      layers.push(item);
      return { layers };
    }),

  // Envia a camada para o fundo da pilha (dados ficam por cima, como no ArcMap).
  sendLayerToBack: (id) =>
    set((s) => {
      const index = s.layers.findIndex((l) => l.id === id);
      if (index <= 0) return s;
      const layers = [...s.layers];
      const [item] = layers.splice(index, 1);
      layers.unshift(item);
      return { layers };
    }),

  setActiveLayer: (id) => set({ activeLayerId: id }),
  setBasemap: (id) => set({ basemapId: id }),
  setTool: (tool) =>
    set((s) => ({
      tool: tool === null ? null : s.tool === tool ? null : tool,
    })),
  setRightTab: (tab) => set({ rightTab: tab }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  // Exibe o Inspetor Lateral quando ele estiver fechado. Usado pelas opções que
  // mostram resultado no painel (Buffer, Interseção, Grade Cartográfica e
  // Tabela de Atributos), garantindo que o usuário veja a resposta da ação.
  openRightPanel: () => set((s) => (s.rightPanelOpen ? s : { rightPanelOpen: true })),
  setStatus: (status) => set({ status }),
  setStreetViewLocation: (loc) => set({ streetViewLocation: loc }),
}));
