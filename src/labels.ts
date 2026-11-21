import type { LabelStyle, LayerRecord } from './types';

/** Separa uma cor "#rrggbb" ou "rgba(r, g, b, a)" em hex e alfa. */
export function parseHexColor(color: string): { hex: string; alpha: number } {
  const value = (color ?? '').trim();
  if (value.startsWith('#')) {
    if (value.length === 4) {
      return {
        hex: `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`,
        alpha: 1,
      };
    }
    // "#rrggbbaa" (padrão do app para preenchimento translúcido)
    if (value.length === 9) {
      return {
        hex: value.slice(0, 7),
        alpha: Math.round((parseInt(value.slice(7, 9), 16) / 255) * 100) / 100,
      };
    }
    return { hex: value.slice(0, 7), alpha: 1 };
  }
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    const hex =
      '#' +
      parts
        .slice(0, 3)
        .map((channel) =>
          Math.max(0, Math.min(255, Number.isFinite(channel) ? channel : 0))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
    return { hex, alpha };
  }
  return { hex: '#38bdf8', alpha: 1 };
}

/** Combina "#rrggbbaa" aplicando o alfa informado. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (alpha >= 1) return `#${clean}`;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

/**
 * Campos disponíveis para rótulos: os declarados da camada ou, na ausência,
 * as propriedades de uma feição de amostra.
 */
export function layerFieldNames(
  layer: LayerRecord,
  sampleProperties?: Record<string, unknown>,
): string[] {
  const declared = layer.fields.map((field) => field.name);
  if (declared.length > 0) return declared;
  return Object.keys(sampleProperties ?? {}).filter((key) => key !== 'geometry');
}

/** Família de fonte sem aspas (para exibir no seletor do diálogo). */
export function fontFamilyName(family: string): string {
  const first = (family ?? '').split(',')[0] ?? '';
  return first.trim().replace(/^['"]|['"]$/g, '') || 'Arial';
}

/** String de fonte válida para o canvas: 'Arial' -> '"Arial", sans-serif'. */
export function fontStack(family: string): string {
  const trimmed = (family ?? '').trim() || 'Arial';
  return /['",]/.test(trimmed) ? trimmed : `"${trimmed}", sans-serif`;
}

/** Rótulos padrão de uma camada (desligados, primeiro campo, acima do ponto). */
export function defaultLabelStyle(fields: string[]): LabelStyle {
  return {
    enabled: false,
    field: fields[0] ?? '',
    color: '#0b0f17',
    fontFamily: 'Arial',
    fontSize: 10,
    placement: 'top',
  };
}

/** Fontes oferecidas no diálogo de rótulos (famílias web-safe, como o ArcMap). */
export const LABEL_FONTS = [
  'Arial',
  'Segoe UI',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Trebuchet MS',
];

/** Tamanhos oferecidos no diálogo de rótulos (em pontos, como no ArcMap). */
export const LABEL_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72];

/** Estilos pré-definidos do botão "Estilos do Rótulo…". */
export const LABEL_PRESETS: {
  name: string;
  style: Pick<LabelStyle, 'fontFamily' | 'fontSize' | 'color' | 'bold' | 'italic'>;
}[] = [
  { name: 'Padrão', style: { fontFamily: 'Arial', fontSize: 10, color: '#0b0f17' } },
  { name: 'Pequeno', style: { fontFamily: 'Arial', fontSize: 8, color: '#111827' } },
  {
    name: 'Destaque',
    style: { fontFamily: 'Arial', fontSize: 12, color: '#7c2d12', bold: true },
  },
  {
    name: 'Formal',
    style: { fontFamily: 'Times New Roman', fontSize: 12, color: '#1f2937', italic: true },
  },
];
