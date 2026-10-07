import { useEffect, useState } from "react";
import { audioMsgKey, ensureAudioOfflineUrl } from "../../offlineAudioCache";

/**
 * objectURL do áudio cacheado offline para esta bolha (null enquanto não houver).
 * Carregamento assíncrono do IndexedDB; a mudança de candidatos no MEIO de uma
 * reprodução é segura — o useAudioPlayback adia a adoção (playList/pendingList).
 */
export function useOfflineAudioSource(msg, isAudioOrVoice) {
  const msgKey = isAudioOrVoice ? audioMsgKey(msg) : null;
  const [offlineUrl, setOfflineUrl] = useState(null);

  useEffect(() => {
    let cancelado = false;
    if (!msgKey) {
      setOfflineUrl(null);
      return undefined;
    }
    void ensureAudioOfflineUrl(msgKey)
      .then((url) => {
        if (!cancelado) setOfflineUrl(url || null);
      })
      .catch(() => {
        if (!cancelado) setOfflineUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [msgKey]);

  return offlineUrl;
}
