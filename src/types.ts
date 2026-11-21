export type LayerSourceKind =
  | 'shp'
  | 'geojson'
  | 'gpkg'
  | 'qgis'
  | 'arcgis'
  | 'arcgis-rest'
  | 'sample'
  | 'analysis';

export type BasemapId =
  | 'dark'
  | 'light'
  | 'osm'
  | 'satellite'
  | 'google_hybrid'
  | 'google_satellite'
  | 'google_streets';

export interface FieldDef {
  name: string;
  type: string;
}

/** Formato do ícone usado para feições de ponto. */
export type PointShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'triangle-down'
  | 'star'
  | 'hexagon'
  | 'pentagon'
  | 'cross'
  | 'x'
  | 'pin'
  | 'pin-outline'
  | 'pin-dot'
  | 'pin-solid'
  | 'bullseye';

/** Tabela externa ligada (Join) ou relacionada (Relate) à camada. */
export interface JoinedTable {
  /** Nome do arquivo da tabela. */
  name: string;
  /** Campo da camada usado como chave. */
  keyLayer: string;
  /** Campo da tabela usado como chave. */
  keyTable: string;
  /** Ligar (Join) agrega as colunas; Relacionar (Relate) mantém a tabela separada. */
  mode: 'join' | 'relate';
  /** Colunas agregadas à camada (somente Ligar). */
  fields: FieldDef[];
  /** Cabeçalhos da tabela (somente Relacionar). */
  headers?: string[];
  /** Linhas da tabela (somente Relacionar). */
  rows?: Record<string, string>[];
  /** Feições que têm registros na tabela. */
  matched: number;
}

/** Posição do rótulo em relação à feição de ponto. */
export type LabelPlacement =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'center';

/** Rótulos das feições (ArcMap: Propriedades da Camada > Rótulos). */
export interface LabelStyle {
  enabled: boolean;
  /** Campo usado como texto do rótulo. */
  field: string;
  /** Cor do texto (hex ou rgba). */
  color: string;
  /** Família da fonte ("Arial", "Segoe UI" ou pilho completo). */
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  /** Máscara: contorno ao redor do texto (padrão: branco 92%). */
  haloColor?: string;
  /** Espessura da máscara em pixels (0 = sem máscara). */
  haloWidth?: number;
  /** Posicionamento do rótulo relativo ao ponto ('top', 'right', 'bottom', 'left', 'center'). */
  placement?: LabelPlacement;
}

export interface LayerStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  pointRadius: number;
  /** Formato do ícone de ponto (padrão: círculo). */
  pointShape?: PointShape;
  /** Rótulos desenhados sobre as feições. */
  labels?: LabelStyle;
}

export interface LayerRecord {
  id: string;
  name: string;
  kind: LayerSourceKind;
  visible: boolean;
  opacity: number;
  crs: string;
  fields: FieldDef[];
  featureCount: number;
  geometryTypes: string[];
  style: LayerStyle;
  /** Tabela ligada/relacionada (ArcMap: "Ligar e Relacionar"). */
  join?: JoinedTable;
  error?: string;
  url?: string;
  sourceLabel?: string;
}

export type ToolId =
  | 'measure-distance'
  | 'measure-area'
  | 'buffer'
  | 'intersect'
  | 'grid'
  | 'identify'
  | 'edit'
  | 'street-view'
  | null;

export type RightTab = 'attributes' | 'analysis' | 'report';
