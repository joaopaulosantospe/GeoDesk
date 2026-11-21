/**
 * Acesso a arquivos irmãos no disco (fora da pasta escolhida no diálogo).
 *
 * O Electron expõe window.geodeskDisk (electron/preload.cjs). No navegador essa
 * API não existe e as funções devolvem null — quem chama decide como reportar.
 */

/** Caminho absoluto do arquivo selecionado; null quando não há acesso ao disco. */
export function diskPathOf(file: File): string | null {
  const api = window.geodeskDisk;
  if (!api?.pathForFile) return null;
  try {
    return api.pathForFile(file) || null;
  } catch {
    return null;
  }
}

/**
 * Lê um arquivo referenciado por um projeto no disco (QGIS/ArcGIS).
 * `referencePath` pode ser absoluto ou relativo à pasta de `basePath`.
 */
export async function readRelatedFile(
  basePath: string,
  referencePath: string,
): Promise<{ name: string; data: Uint8Array } | null> {
  const api = window.geodeskDisk;
  if (!api?.readRelated) return null;
  try {
    const result = await api.readRelated(basePath, referencePath);
    if (!result || !(result.data instanceof Uint8Array)) return null;
    return result;
  } catch {
    return null;
  }
}

/** Lê um arquivo irmão como texto (companion .prj/.cpg, .qgs dentro do .qgz etc.). */
export async function readRelatedText(
  basePath: string,
  referencePath: string,
): Promise<string | null> {
  const file = await readRelatedFile(basePath, referencePath);
  if (!file) return null;
  return new TextDecoder('utf-8').decode(file.data);
}
