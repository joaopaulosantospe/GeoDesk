import type Geometry from 'ol/geom/Geometry.js';
import type GeometryCollection from 'ol/geom/GeometryCollection.js';
import type LineString from 'ol/geom/LineString.js';
import type MultiLineString from 'ol/geom/MultiLineString.js';
import type MultiPoint from 'ol/geom/MultiPoint.js';
import type MultiPolygon from 'ol/geom/MultiPolygon.js';
import type Point from 'ol/geom/Point.js';
import type Polygon from 'ol/geom/Polygon.js';

/** Coordenada plana [x, y] (metros do mapa, EPSG:3857). */
export type XY = [number, number];

/**
 * Forma plana de uma geometria, pré-computada para os testes da ligação
 * espacial (o OpenLayers 10 não expõe interseção/distância entre geometrias).
 */
export interface Shape {
  /** Todos os vértices. */
  points: XY[];
  /** Arestas (linhas e anéis de polígonos). */
  segments: [XY, XY][];
  /** Polígonos como lista de anéis (externo + furos). */
  polygons: XY[][][];
  /** Extensão [minX, minY, maxX, maxY]. */
  extent: [number, number, number, number];
}

export function shapeOf(geometry: Geometry | undefined | null): Shape {
  const points: XY[] = [];
  const segments: [XY, XY][] = [];
  const polygons: XY[][][] = [];

  const addLine = (coords: XY[]): void => {
    for (let index = 0; index < coords.length; index++) {
      points.push(coords[index]);
      if (index > 0) segments.push([coords[index - 1], coords[index]]);
    }
  };

  const addRing = (ring: XY[]): void => {
    addLine(ring);
    if (ring.length > 1) segments.push([ring[ring.length - 1], ring[0]]);
  };

  const addPolygonRings = (rings: XY[][]): void => {
    rings.forEach(addRing);
    polygons.push(rings);
  };

  if (geometry) {
    switch (geometry.getType()) {
      case 'Point':
        addLine([(geometry as Point).getCoordinates() as XY]);
        break;
      case 'MultiPoint':
        addLine((geometry as MultiPoint).getCoordinates() as XY[]);
        break;
      case 'LineString':
        addLine((geometry as LineString).getCoordinates() as XY[]);
        break;
      case 'MultiLineString':
        (geometry as MultiLineString).getCoordinates().forEach((coords) => addLine(coords as XY[]));
        break;
      case 'Polygon':
        addPolygonRings((geometry as Polygon).getCoordinates() as XY[][]);
        break;
      case 'MultiPolygon':
        (geometry as MultiPolygon)
          .getCoordinates()
          .forEach((rings) => addPolygonRings(rings as XY[][]));
        break;
      case 'GeometryCollection':
        for (const child of (geometry as GeometryCollection).getGeometries()) {
          const part = shapeOf(child);
          points.push(...part.points);
          segments.push(...part.segments);
          polygons.push(...part.polygons);
        }
        break;
      default:
        break;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (points.length === 0) {
    minX = minY = maxX = maxY = 0;
  }

  return { points, segments, polygons, extent: [minX, minY, maxX, maxY] };
}

/** As duas formas se tocam ou se cruzam? */
export function shapesIntersect(a: Shape, b: Shape): boolean {
  if (!extentsOverlap(a.extent, b.extent)) return false;

  // Vértice de uma geometria dentro do polígono da outra.
  if (a.polygons.length > 0) {
    for (const [x, y] of b.points) {
      if (polygonsContain(a.polygons, x, y)) return true;
    }
  }
  if (b.polygons.length > 0) {
    for (const [x, y] of a.points) {
      if (polygonsContain(b.polygons, x, y)) return true;
    }
  }

  // Arestas que se cruzam (inclusive colineares que se tocam).
  if (a.segments.length > 0 && b.segments.length > 0) {
    for (const [a1, a2] of a.segments) {
      for (const [b1, b2] of b.segments) {
        if (segmentsCross(a1, a2, b1, b2)) return true;
      }
    }
  }

  // Dois pontos sem arestas: mesma localização.
  if (a.segments.length === 0 && b.segments.length === 0) {
    for (const p of a.points) {
      for (const q of b.points) {
        if (p[0] === q[0] && p[1] === q[1]) return true;
      }
    }
  }

  return false;
}

/** Distância plana entre as formas (0 quando se tocam). */
export function shapesDistance(a: Shape, b: Shape): number {
  if (shapesIntersect(a, b)) return 0;
  let best = Infinity;
  for (const p of a.points) {
    for (const [b1, b2] of b.segments) best = Math.min(best, pointSegmentDistance(p, b1, b2));
  }
  for (const p of b.points) {
    for (const [a1, a2] of a.segments) best = Math.min(best, pointSegmentDistance(p, a1, a2));
  }
  for (const [a1, a2] of a.segments) {
    for (const [b1, b2] of b.segments) best = Math.min(best, segmentsDistance(a1, a2, b1, b2));
  }
  for (const p of a.points) {
    for (const q of b.points) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * Tolerância (metros, coordenadas EPSG:3857) para considerar um ponto sobre a
 * borda de um polígono. Tolerância de 5 metros cobre variações cartográficas,
 * imprecisões de reprojeção (UTM ↔ 4326 ↔ 3857) e símbolos visuais na borda da célula.
 */
export const BOUNDARY_EPS = 5.0;

function extentsOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
  margin: number = BOUNDARY_EPS,
): boolean {
  return (
    a[0] <= b[2] + margin &&
    b[0] <= a[2] + margin &&
    a[1] <= b[3] + margin &&
    b[1] <= a[3] + margin
  );
}

function polygonsContain(polygons: XY[][][], x: number, y: number): boolean {
  for (const rings of polygons) {
    if (rings.length === 0 || !ringCovers(rings[0], x, y)) continue;
    let inHole = false;
    for (let index = 1; index < rings.length; index++) {
      // Só o interior do furo exclui: ponto na borda do furo segue dentro do polígono.
      if (ringContains(rings[index], x, y)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * Ponto dentro do anel OU sobre a sua borda — como no ArcMap, feições que
 * caem exatamente sobre a linha da célula são contadas (e a distância é 0).
 */
function ringCovers(ring: XY[], x: number, y: number): boolean {
  if (ringContains(ring, x, y)) return true;
  if (ring.length < 2) return false;
  for (let index = 1; index <= ring.length; index++) {
    if (pointSegmentDistance([x, y], ring[index - 1], ring[index % ring.length]) <= BOUNDARY_EPS) {
      return true;
    }
  }
  return false;
}

/** Ponto dentro do anel (número de varredura; borda fica a critério do algoritmo). */
function ringContains(ring: XY[], x: number, y: number): boolean {
  let winding = 0;
  let x1 = ring[ring.length - 1][0];
  let y1 = ring[ring.length - 1][1];
  for (const [x2, y2] of ring) {
    if (y1 <= y) {
      if (y2 > y && cross(x1, y1, x2, y2, x, y) > 0) winding++;
    } else if (y2 <= y && cross(x1, y1, x2, y2, x, y) < 0) {
      winding--;
    }
    x1 = x2;
    y1 = y2;
  }
  return winding !== 0;
}

/** Produto vetorial orientado do segmento (x1,y1)-(x2,y2) em relação ao ponto. */
function cross(x1: number, y1: number, x2: number, y2: number, x: number, y: number): number {
  return (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
}

function orientation(o: XY, a: XY, b: XY): number {
  return Math.sign((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]));
}

function onSegment(a: XY, b: XY, p: XY): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** Segmentos que se cruzam ou se tocam (inclusive colineares). */
function segmentsCross(a1: XY, a2: XY, b1: XY, b2: XY): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
  if (o1 === 0 && onSegment(a1, a2, b1)) return true;
  if (o2 === 0 && onSegment(a1, a2, b2)) return true;
  if (o3 === 0 && onSegment(b1, b2, a1)) return true;
  if (o4 === 0 && onSegment(b1, b2, a2)) return true;
  return false;
}

function pointSegmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsDistance(a1: XY, a2: XY, b1: XY, b2: XY): number {
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
}
