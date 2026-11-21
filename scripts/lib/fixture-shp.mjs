import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gera um shapefile mínimo (2 pontos, campos COD e VALOR) em `dir`:
 * .shp + .dbf + .prj (WGS84) + .cpg. Usado pelos testes para simular o
 * usuário que escolhe apenas o arquivo .shp no diálogo.
 */
export function writeShapefileFixture(dir, name) {
  mkdirSync(dir, { recursive: true });
  const feats = [
    { x: -47.0, y: -22.5, cod: 'P1', valor: 10 },
    { x: -47.1, y: -22.6, cod: 'P2', valor: 20 },
  ];

  // --- .shp: dois pontos ---
  const shp = Buffer.alloc(100 + feats.length * 28);
  shp.writeInt32BE(9994, 0); // file code
  shp.writeInt32BE(shp.length / 2, 24); // file length em palavras de 16 bits
  shp.writeInt32LE(1000, 28); // version
  shp.writeInt32LE(1, 32); // shape type = Point
  const xs = feats.map((f) => f.x);
  const ys = feats.map((f) => f.y);
  shp.writeDoubleLE(Math.min(...xs), 36);
  shp.writeDoubleLE(Math.min(...ys), 44);
  shp.writeDoubleLE(Math.max(...xs), 52);
  shp.writeDoubleLE(Math.max(...ys), 60);
  let off = 100;
  feats.forEach((f, i) => {
    shp.writeInt32BE(i + 1, off); // record number
    shp.writeInt32BE(10, off + 4); // content length (20 bytes / 2)
    shp.writeInt32LE(1, off + 8); // Point
    shp.writeDoubleLE(f.x, off + 12);
    shp.writeDoubleLE(f.y, off + 20);
    off += 28;
  });
  writeFileSync(join(dir, `${name}.shp`), shp);

  // --- .dbf: COD (C,10) e VALOR (N,8,0) ---
  const recSize = 1 + 10 + 8;
  const headerSize = 32 + 32 * 2 + 1;
  const dbf = Buffer.alloc(headerSize + feats.length * recSize + 1);
  dbf[0] = 0x03; // dBase III
  const now = new Date();
  dbf[1] = now.getFullYear() - 1900;
  dbf[2] = now.getMonth() + 1;
  dbf[3] = now.getDate();
  dbf.writeUInt32LE(feats.length, 4);
  dbf.writeUInt16LE(headerSize, 8);
  dbf.writeUInt16LE(recSize, 10);
  const field = (at, fname, type, len, dec) => {
    dbf.write(fname, at, 'ascii');
    dbf[at + 11] = type.charCodeAt(0);
    dbf[at + 16] = len;
    dbf[at + 17] = dec;
  };
  field(32, 'COD', 'C', 10, 0);
  field(64, 'VALOR', 'N', 8, 0);
  dbf[headerSize - 1] = 0x0d; // fim dos descritores
  feats.forEach((f, i) => {
    const rec = headerSize + i * recSize;
    dbf[rec] = 0x20; // ativa
    dbf.write(String(f.cod).padEnd(10, ' '), rec + 1, 'ascii');
    dbf.write(String(f.valor).padStart(8, ' '), rec + 11, 'ascii');
  });
  dbf[dbf.length - 1] = 0x1a; // EOF
  writeFileSync(join(dir, `${name}.dbf`), dbf);

  writeFileSync(
    join(dir, `${name}.prj`),
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
    'utf8',
  );
  writeFileSync(join(dir, `${name}.cpg`), 'UTF-8', 'utf8');
}
