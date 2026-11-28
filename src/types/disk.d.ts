/**
 * API exposta pelo preload (electron/preload.cjs) para completar um
 * shapefile: o usuário pode escolher só o .shp e os arquivos irmãos
 * (.dbf/.prj/.cpg) são lidos da mesma pasta no disco.
 */
interface GeodeskDiskApi {
  /** Caminho absoluto do arquivo selecionado no diálogo de arquivos. */
  pathForFile(file: File): string;
  /** Lê um arquivo irmão na pasta do shapefile; null quando não existe. */
  readSidecar(shpPath: string, ext: '.dbf' | '.prj' | '.cpg'): Promise<Uint8Array | null>;
  /**
   * Lê qualquer arquivo referenciado por um projeto (QGIS/ArcGIS).
   * `referencePath` pode ser absoluto ou relativo à pasta de `basePath`;
   * devolve null quando o arquivo não existe ou não é legível.
   */
  readRelated(
    basePath: string,
    referencePath: string,
  ): Promise<{ name: string; data: Uint8Array } | null>;
  /**
   * Arquivo que o Windows passou ao abrir o aplicativo (duplo clique ou
   * "Abrir com"); null quando o app foi aberto sem arquivo.
   */
  getStartupFile(): Promise<string | null>;
  /** Salva diretamente o conteúdo de texto em um arquivo no disco. */
  saveFile(filePath: string, content: string): Promise<boolean>;
  /** Abre o diálogo nativo do sistema para Salvar Como. */
  showSaveDialog(defaultName?: string): Promise<string | null>;
  /** Pergunta ao usuário se deseja salvar alterações antes de fechar o sistema. */
  confirmSaveBeforeClose(projectName?: string): Promise<'save' | 'dontsave' | 'cancel'>;
  /** Força o fechamento da janela do aplicativo sem nova interceptação. */
  forceClose(): Promise<void>;
  /** Fecha o aplicativo (passa pelo ciclo de verificação de alterações não salvas). */
  quit(): Promise<void>;
  /** Registra listener para pedidos de fechamento da janela (X ou Alt+F4). */
  onRequestClose?(callback: () => void): () => void;
  /** Registra listener para arquivos abertos enquanto o aplicativo já está em execução. */
  onOpenFile?(callback: (filePath: string) => void): () => void;
}

interface Window {
  geodeskDisk?: GeodeskDiskApi;
}
