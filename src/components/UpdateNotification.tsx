/**
 * UpdateNotification
 *
 * Verifica automaticamente se existe atualização disponível quando o app inicia.
 * Mostra o modal premium informando o usuário com as opções:
 *   - "Atualizar agora" (baixa e instala ou abre no navegador)
 *   - "Lembrar depois" (fecha o modal e mostra novamente na próxima abertura)
 *
 * Respeita um atraso de 3 segundos após a montagem para não atrapalhar o carregamento.
 * Se o usuário clicou "Lembrar depois", não incomoda de novo na mesma sessão.
 */
import { useState, useEffect, useCallback } from 'react';
import UpdateModal from './UpdateModal';

export default function UpdateNotification() {
  const [check, setCheck] = useState<GeodeskUpdateCheck | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificação automática na abertura com 3s de atraso
  useEffect(() => {
    const api = window.geodeskUpdate;
    if (!api) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const result = await api.check();
        if (!cancelled && result.status === 'available') {
          setCheck(result);
        }
      } catch {
        // Silencioso na verificação automática — o menu manual trata erros.
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Listeners de progresso do electron-updater
  useEffect(() => {
    const api = window.geodeskUpdate;
    if (!api?.onUpdateProgress) return;

    const offProgress = api.onUpdateProgress((p) => {
      setProgress(typeof p?.percent === 'number' ? p.percent : null);
    });
    const offDownloaded = api.onUpdateDownloaded(() => {
      setDownloaded(true);
      setDownloading(false);
      setProgress(100);
    });
    const offError = api.onUpdateError((message) => {
      setDownloading(false);
      setError(message || 'Falha ao baixar a atualização.');
    });

    return () => {
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!check || !window.geodeskUpdate) return;

    if (check.mode !== 'app') {
      const url = check.url;
      if (url) {
        await window.geodeskUpdate.openExternal(url);
        setDismissed(true);
      }
      return;
    }

    setDownloading(true);
    setError(null);
    setProgress(0);
    try {
      const result = await window.geodeskUpdate.downloadUpdate();
      if (result.status === 'downloaded') {
        setDownloaded(true);
        setDownloading(false);
        setProgress(100);
      } else {
        setDownloading(false);
        setError(result.message || 'Falha ao baixar a atualização.');
      }
    } catch (err) {
      setDownloading(false);
      setError(`Falha: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [check]);

  const handleInstall = useCallback(async () => {
    if (!window.geodeskUpdate) return;
    await window.geodeskUpdate.installUpdate();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!check || dismissed || check.status !== 'available') return null;

  return (
    <UpdateModal
      check={check}
      onClose={handleDismiss}
      onDownload={handleUpdate}
      onInstall={handleInstall}
      downloading={downloading}
      progress={progress}
      downloaded={downloaded}
      error={error}
    />
  );
}
