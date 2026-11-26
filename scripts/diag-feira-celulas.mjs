import proj4 from 'proj4';
import { readFileSync } from 'node:fs';

import { tmpdir } from 'node:os';
const SHP = path.join(tmpdir(), 'opencode/feira/TRAFOS.shp');
const buf = readFileSync(SHP);

// Cabeçalho .shp: bbox em Xmin(36), Ymin(44), Xmax(52), Ymax(60) — doubles little-endian.
const bbox = [36, 44, 52, 60].map((o) => buf.readDoubleLE(o));
console.log('bbox WGS84:', bbox.map((v) => v.toFixed(5)).join(', '));

// Registros do tipo Point (shape type 1).
const pts = [];
let offset = 100;
while (offset + 8 <= buf.length) {
  const contentLength = buf.readInt32BE(offset + 4) * 2;
  const shapeType = buf.readInt32LE(offset + 8);
  if (shapeType === 1 && offset + 28 <= buf.length) {
    pts.push([buf.readDoubleLE(offset + 12), buf.readDoubleLE(offset + 20)]);
  }
  offset += 8 + contentLength;
}
console.log('pontos:', pts.length);

proj4.defs('utm24s', '+proj=utm +zone=24 +south +datum=WGS84 +units=m +no_defs');
const utm = pts.map((p) => proj4('EPSG:4326', 'utm24s', p));
const x0 = Math.min(...utm.map((p) => p[0]));
const x1 = Math.max(...utm.map((p) => p[0]));
const y0 = Math.min(...utm.map((p) => p[1]));
const y1 = Math.max(...utm.map((p) => p[1]));
console.log('extensão UTM:', ((x1 - x0) / 1000).toFixed(2), 'km ×', ((y1 - y0) / 1000).toFixed(2), 'km');

for (const size of [500, 1000, 1500, 2000, 2500, 3000]) {
  const cells = new Set();
  for (const [x, y] of utm) {
    cells.add(`${Math.floor((y - y0) / size)}:${Math.floor((x - x0) / size)}`);
  }
  const cols = Math.ceil((x1 - x0) / size);
  const rows = Math.ceil((y1 - y0) / size);
  console.log(
    `${size} m (grade ${cols}x${rows} = ${cols * rows}) -> ${cells.size} células com pontos`,
  );
}

console.log('\n--- origem pelo retângulo projetado (como o app) vs. caixa real dos pontos ---');
// Caixa do app: extensão em 3857 (bbox dos pontos) -> projetar os cantos para UTM.
const to3857 = (lonLat) => {
  const [lon, lat] = lonLat;
  const x = (lon * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.34 / 180);
  return [x, y];
};
const corners3857 = [
  [bbox[0], bbox[1]],
  [bbox[2], bbox[1]],
  [bbox[2], bbox[3]],
  [bbox[0], bbox[3]],
].map(to3857);
const cornersUtm = corners3857.map((c) => proj4('EPSG:3857', 'utm24s', c));
const appX0 = Math.min(...cornersUtm.map((c) => c[0]));
const appY0 = Math.min(...cornersUtm.map((c) => c[1]));
const appX1 = Math.max(...cornersUtm.map((c) => c[0]));
const appY1 = Math.max(...cornersUtm.map((c) => c[1]));
console.log(
  `origem real (pontos): x0=${x0.toFixed(1)} y0=${y0.toFixed(1)} | origem 4 cantos: x0=${appX0.toFixed(1)} y0=${appY0.toFixed(1)} | deslocamento ${(appX0 - x0).toFixed(1)} m / ${(appY0 - y0).toFixed(1)} m`,
);
for (const size of [3200]) {
  for (const [rotulo, ox, oy] of [
    ['pontos', x0, y0],
    ['4 cantos', appX0, appY0],
  ]) {
    const cells = new Set();
    for (const [x, y] of utm) {
      cells.add(`${Math.floor((y - oy) / size)}:${Math.floor((x - ox) / size)}`);
    }
    console.log(`${size} m, origem ${rotulo} -> ${cells.size} células`);
  }
}

console.log('\n--- varredura fina (procurando 17 células) ---');
for (let size = 3000; size <= 3800; size += 50) {
  const cells = new Set();
  for (const [x, y] of utm) {
    cells.add(`${Math.floor((y - y0) / size)}:${Math.floor((x - x0) / size)}`);
  }
  const cols = Math.ceil((x1 - x0) / size);
  const rows = Math.ceil((y1 - y0) / size);
  const total = cols * rows;
  const marcador = cells.size === 17 ? '  <== 17 (igual ao ArcMap)' : '';
  console.log(
    `${size} m = ${(size / 1000).toFixed(3)} km (grade ${cols}x${rows} = ${total}) -> ${cells.size} células${marcador}`,
  );
}
