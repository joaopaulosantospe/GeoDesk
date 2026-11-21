/**
 * Resultado da verificação de atualizações feita pelo processo principal
 * (ipcMain 'geodesk:check-update').
 *
 * - App empacotado: electron-updater compara com o manifesto "latest.yml"
 *   publicado e o download/instalação acontecem dentro do app (mode 'app').
 * - Desenvolvimento: compara com o manifesto "version.json" e o link do
 *   instalador é aberto no navegador (mode 'browser').
 */
interface GeodeskUpdateCheck {
  /** 'available' = versão nova publicada; 'up-to-date' = já está atualizado. */
  status: 'available' | 'up-to-date' | 'error' | 'invalid';
  /** Como a atualização é aplicada quando há versão nova. */
  mode?: 'app' | 'browser';
  /** Versão do aplicativo em execução. */
  current: string;
  /** Versão publicada no manifesto; null quando não pôde ser lida. */
  latest?: string | null;
  /** URL do instalador (somente no modo 'browser'). */
  url?: string | null;
  /** Notas de liberação informadas no manifesto. */
  notes?: string | null;
  /** Data de liberação informada no manifesto (AAAA-MM-DD). */
  releasedAt?: string | null;
  /** true quando a atualização já foi baixada e está pronta para instalar. */
  downloaded?: boolean;
  /** Mensagem de falha quando status = 'error' | 'invalid'. */
  message?: string;
}

/** Progresso do download da atualização dentro do app. */
interface GeodeskUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

/** Resposta de 'geodesk:download-update'. */
interface GeodeskDownloadResult {
  status: 'downloaded' | 'error';
  message?: string;
}

/**
 * API de atualização exposta pelo preload (electron/preload.cjs) em
 * `window.geodeskUpdate`. Não existe em execução puramente no navegador.
 */
interface GeodeskUpdateApi {
  /** Versão do aplicativo em execução. */
  appVersion(): Promise<string>;
  /** Verifica se existe atualização publicada. */
  check(): Promise<GeodeskUpdateCheck>;
  /** Baixa a atualização dentro do app (modo 'app'). */
  downloadUpdate(): Promise<GeodeskDownloadResult>;
  /** Instala a atualização já baixada e reinicia o aplicativo. */
  installUpdate(): Promise<boolean>;
  /** Abre um link http(s) no navegador padrão do sistema. */
  openExternal(url: string): Promise<boolean>;
  /** Assina o progresso do download; devolve a função de cancelamento. */
  onUpdateProgress(callback: (progress: GeodeskUpdateProgress) => void): () => void;
  /** Assina o fim do download da atualização. */
  onUpdateDownloaded(callback: () => void): () => void;
  /** Assina erros do electron-updater durante o download. */
  onUpdateError(callback: (message: string) => void): () => void;
}

interface Window {
  geodeskUpdate?: GeodeskUpdateApi;
}
