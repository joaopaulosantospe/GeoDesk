import { getMap, whenRendered } from '../map/mapContext';
import { downloadBlob } from './download';

function timestamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
}

export async function composeMapCanvas(): Promise<HTMLCanvasElement> {
  await whenRendered();
  const map = getMap();
  if (!map) throw new Error('Mapa indisponível');
  const viewport = map.getViewport();
  if (!viewport) throw new Error('Visualização do mapa indisponível');
  const canvases = Array.from(viewport.querySelectorAll('canvas')).filter(
    (canvas) => canvas.width > 0 && canvas.height > 0,
  );
  if (canvases.length === 0) throw new Error('Nenhum quadro do mapa disponível');
  const base = canvases.reduce((largest, canvas) =>
    canvas.width * canvas.height > largest.width * largest.height ? canvas : largest,
  );
  const output = document.createElement('canvas');
  output.width = base.width;
  output.height = base.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível');
  context.fillStyle = viewport.style.backgroundColor || '#ffffff';
  context.fillRect(0, 0, output.width, output.height);
  canvases.forEach((canvas) => context.drawImage(canvas, 0, 0));
  return output;
}

export async function exportMapPNG(filename?: string): Promise<void> {
  const canvas = await composeMapCanvas();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Falha ao gerar a imagem PNG');
  const base = (filename ?? 'mapa-geodesk').replace(/\.png$/i, '');
  downloadBlob(`${base}-${timestamp()}.png`, blob);
}
