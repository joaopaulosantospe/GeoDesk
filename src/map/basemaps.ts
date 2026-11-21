import type { BasemapId } from '../types';

export interface BasemapDef {
  id: BasemapId;
  label: string;
  online: boolean;
  url?: string;
  overlayUrl?: string;
  attribution?: string;
  maxZoom?: number;
}

export const basemaps: BasemapDef[] = [
  { id: 'dark', label: 'Escuro (Vetor)', online: false },
  { id: 'light', label: 'Claro (Vetor)', online: false },
  {
    id: 'google_hybrid',
    label: 'Google Híbrido (Satélite + Ruas)',
    online: true,
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20,
  },
  {
    id: 'google_satellite',
    label: 'Google Satélite',
    online: true,
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20,
  },
  {
    id: 'google_streets',
    label: 'Google Ruas',
    online: true,
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20,
  },
  {
    id: 'satellite',
    label: 'Esri Satélite',
    online: true,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    online: true,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
];
