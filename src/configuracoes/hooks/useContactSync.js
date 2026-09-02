import { useCallback, useEffect, useRef, useState } from 'react';
import { sincronizarContatos, statusSincronizacaoContatos } from '../../chats/chatService';

// Somente iniciar() escreve. Mount, F5 e eventos apenas acompanham a importação.
export function useContactSync(onRefresh) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const current = useRef({ active: false, jobId: null, generation: 0 });
  const mounted = useRef(false);

  const apply = useCallback((result) => {
    if (!mounted.current || !result || result.status === 'idle') return;
    if (result.tipo && result.tipo !== 'sync_contatos') return;
    if (current.current.active && current.current.jobId && result.job_id !== current.current.jobId) return;
    current.current.active = result.running === true;
    current.current.jobId = result.job_id || null;
    setSyncing(result.running === true);
    setSyncResult(result);
    Promise.resolve(refresh.current?.()).catch(() => {});
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let timer;
    const poll = async (initial = false) => {
      const generation = current.current.generation;
      try {
        if (initial || (current.current.active && current.current.jobId)) {
          const result = await statusSincronizacaoContatos(current.current.jobId);
          if (!disposed && generation === current.current.generation && (!initial || result?.running)) apply(result);
        }
      } catch {
        if (!disposed && current.current.active) {
          setSyncResult((previous) => ({ ...previous, aviso: 'Aguardando atualização do servidor. A consulta será repetida automaticamente.' }));
        }
      } finally {
        if (!disposed) timer = setTimeout(() => poll(), 3000);
      }
    };
    poll(true);
    const onSync = (event) => {
      if (event.detail?.tipo === 'sync_contatos') apply(event.detail);
    };
    window.addEventListener('zapi_sync_contatos', onSync);
    return () => {
      disposed = true;
      mounted.current = false;
      clearTimeout(timer);
      window.removeEventListener('zapi_sync_contatos', onSync);
    };
  }, [apply]);

  const iniciar = useCallback(async () => {
    if (current.current.active) return;
    current.current = { active: true, jobId: null, generation: current.current.generation + 1 };
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await sincronizarContatos();
      if (result?.ok === false) throw new Error(result.error || result.message || 'Erro ao iniciar sincronização.');
      apply(result);
    } catch (error) {
      // A resposta pode ter se perdido após enfileirar; consulte antes de liberar outro clique.
      try {
        const status = await statusSincronizacaoContatos();
        if (status?.running) { apply(status); return; }
      } catch { /* exibir a falha original */ }
      current.current.active = false;
      if (mounted.current) {
        setSyncing(false);
        setSyncResult({ error: error.response?.data?.error || error.message || 'Erro ao iniciar sincronização.' });
      }
    }
  }, [apply]);

  return { syncing, syncResult, iniciar };
}
