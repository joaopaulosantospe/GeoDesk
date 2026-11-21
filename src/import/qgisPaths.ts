/**
 * Interpretação dos caminhos de dados gravados pelo QGIS no projeto.
 * Módulo puro (sem dependências do app) para poder ser testado fora do
 * navegador — ver scripts/diag-gpkg.mjs.
 */

export interface OgrSource {
  /** Caminho do arquivo, relativo ao projeto ou absoluto. */
  path: string;
  /** Nome da tabela/camada dentro de um GeoPackage, quando declarado. */
  table?: string;
}

/**
 * Datasource do QGIS no provedor OGR. Formatos comuns:
 *   ./camadas/estados.shp
 *   ./dados.gpkg|layername=estados
 *   GPKG:./dados.gpkg:estados
 *   C:/projetos/limite.shp
 */
export function parseOgrSource(raw: string): OgrSource | null {
  let value = raw.trim().replace(/^"|"$/g, '');
  if (value === '') return null;

  let table: string | undefined;
  const gpkgPrefix = /^GPKG:(.+)$/i.exec(value);
  if (gpkgPrefix) {
    const rest = gpkgPrefix[1];
    const lastColon = rest.lastIndexOf(':');
    // "> 2" preserva letras de unidade ("C:/…"), onde o ":" está na posição 1.
    if (lastColon > 2) {
      table = rest.slice(lastColon + 1).trim() || undefined;
      value = rest.slice(0, lastColon);
    } else {
      value = rest;
    }
  } else {
    const pipeIndex = value.indexOf('|');
    if (pipeIndex >= 0) {
      const options = value.slice(pipeIndex + 1);
      value = value.slice(0, pipeIndex);
      const layerName = /layername=([^|]+)/i.exec(options);
      if (layerName) table = layerName[1].trim() || undefined;
    }
  }

  value = stripFileUrl(value).trim();
  // Conexões de banco (dbname=, host=…) e URLs não são caminhos de arquivo.
  if (value === '' || /^(dbname|service|host=|url=|http)/i.test(value)) return null;
  return { path: value, table };
}

/** "file:///C:/dados/x.shp" → "C:/dados/x.shp"; no POSIX mantém "/home/…". */
function stripFileUrl(value: string): string {
  if (!/^file:\/\//i.test(value)) return value;
  const withoutScheme = value.replace(/^file:\/\//i, '');
  return /^\/[a-zA-Z]:\//.test(withoutScheme) ? withoutScheme.slice(1) : withoutScheme;
}

/** Extensão em minúsculas (ignora consulta/fragmento de URL). */
export function extensionOf(name: string): string {
  const clean = name.split(/[?#]/)[0];
  const index = clean.lastIndexOf('.');
  return index === -1 ? '' : clean.slice(index).toLowerCase();
}

/** Nome do arquivo sem pastas e sem extensão. */
export function baseNameOf(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const index = file.lastIndexOf('.');
  return index === -1 ? file : file.slice(0, index);
}
