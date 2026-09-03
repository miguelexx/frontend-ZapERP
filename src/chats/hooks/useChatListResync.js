import { useEffect, useRef } from "react";
import { useChatStore } from "../chatsStore";
import { removeChatIdFromFilterRowCaches } from "../chatListSidebarCache";

const CHAT_LIST_RESYNC_THROTTLE_MS = 2500;

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
  filterScopeKey,
  atendimentoModoSimples,
}) {
  const throttleLoadTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (throttleLoadTimerRef.current) {
        clearTimeout(throttleLoadTimerRef.current);
        throttleLoadTimerRef.current = null;
      }
    };
  }, []);

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
    const affectedIds = useChatStore.getState().chatListResyncChatIds || [];
    for (const chatId of affectedIds) {
      removeChatIdFromFilterRowCaches(filterScopeKey, chatId);
    }
    if (loadInFlightRef.current) {
      if (throttleLoadTimerRef.current) {
        clearTimeout(throttleLoadTimerRef.current);
        throttleLoadTimerRef.current = null;
      }
      loadQueuedRef.current = { background: true };
      void refreshChatFilterCounts({ silent: true });
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
      Date.now() - lastLoadFinishedAtRef.current < CHAT_LIST_RESYNC_THROTTLE_MS &&
      !bypassResyncThrottle;
    if (throttleResync) {
      void refreshChatFilterCounts({ silent: true });
      if (!throttleLoadTimerRef.current) {
        const waitMs = Math.max(
          0,
          CHAT_LIST_RESYNC_THROTTLE_MS - (Date.now() - lastLoadFinishedAtRef.current)
        );
        throttleLoadTimerRef.current = setTimeout(() => {
          throttleLoadTimerRef.current = null;
          if (loadInFlightRef.current) {
            loadQueuedRef.current = { background: true };
            return;
          }
          loadRef.current?.({ background: true });
        }, waitMs);
      }
      return;
    }
    if (throttleLoadTimerRef.current) {
      clearTimeout(throttleLoadTimerRef.current);
      throttleLoadTimerRef.current = null;
    }
    loadRef.current?.({ background: true });
    void refreshChatFilterCounts({ silent: true });
  }, [
    chatListResyncNonce,
    refreshChatFilterCounts,
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
