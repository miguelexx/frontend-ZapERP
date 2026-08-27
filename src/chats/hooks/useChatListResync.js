import { useEffect } from "react";
import { useChatStore } from "../chatsStore";
import { clearChatListRowsFilterSessionCache } from "../chatListSidebarCache";

/**
 * Resync silencioso da lista: nonce do socket (debounce no store), auto-refresh 5 min,
 * fila se load() já estiver em voo, e uma última atualização após o voo atual.
 * Não altera contratos Socket.IO — só reage a `chatListResyncNonce`.
 */
export function useChatListResync({
  loadRef,
  loadInFlightRef,
  loadQueuedRef,
  lastLoadFinishedAtRef,
  tabRef,
  refreshChatFilterCounts,
  isMobileLayout,
  filterScopeKey,
  atendimentoModoSimples,
}) {
  // Atualização automática da lista (nomes, novas conversas) a cada 5 min — evita "refresh" constante
  useEffect(() => {
    const interval = setInterval(() => loadRef.current?.(), 300_000);
    return () => clearInterval(interval);
  }, [loadRef]);

  const chatListResyncNonce = useChatStore((s) => s.chatListResyncNonce);
  useEffect(() => {
    if (!chatListResyncNonce) return;
    const forceResync = useChatStore.getState().chatListResyncForce === true;
    if (forceResync) {
      useChatStore.setState({ chatListResyncForce: false });
    }
    if (loadInFlightRef.current) {
      loadQueuedRef.current = { background: true };
      void refreshChatFilterCounts({ silent: true });
      if (isMobileLayout) clearChatListRowsFilterSessionCache(filterScopeKey);
      return;
    }
    const hasVisibleChats = (useChatStore.getState().chats?.length ?? 0) > 0;
    const tabAtual = tabRef.current;
    const modoSimplesAtivo = atendimentoModoSimples === true;
    const bypassResyncThrottle =
      forceResync ||
      tabAtual === "aguardando_atendente" ||
      (modoSimplesAtivo && (tabAtual === "aguardando_cliente" || tabAtual === "todas"));
    const throttleResync =
      hasVisibleChats &&
      Date.now() - lastLoadFinishedAtRef.current < 2500 &&
      !bypassResyncThrottle;
    if (throttleResync) {
      void refreshChatFilterCounts({ silent: true });
      if (isMobileLayout) clearChatListRowsFilterSessionCache(filterScopeKey);
      return;
    }
    loadRef.current?.({ background: true });
    void refreshChatFilterCounts({ silent: true });
    if (isMobileLayout) clearChatListRowsFilterSessionCache(filterScopeKey);
  }, [
    chatListResyncNonce,
    refreshChatFilterCounts,
    isMobileLayout,
    filterScopeKey,
    atendimentoModoSimples,
    loadRef,
    loadInFlightRef,
    loadQueuedRef,
    lastLoadFinishedAtRef,
    tabRef,
  ]);

  useEffect(() => {
    function onSyncContatos() {
      loadRef.current?.();
    }
    window.addEventListener("zapi_sync_contatos", onSyncContatos);
    return () => window.removeEventListener("zapi_sync_contatos", onSyncContatos);
  }, [loadRef]);
}
