import { useEffect, useRef } from "react";
import { useChatStore } from "../chatsStore";
import { removeChatIdFromFilterRowCaches } from "../chatListSidebarCache";

/**
 * Agrupamento (coalescing) do GET /chats de reconciliação.
 *
 * A lista VISÍVEL já é atualizada em tempo real pelos patches do socket na store
 * (`setUltimaMensagemEBump` / `updateChat` / `addChat`) + a refiltragem reativa do
 * `useMemo` de `chatsFiltrados`. O GET disparado por `chatListResyncNonce` é apenas
 * uma RECONCILIAÇÃO — não é a fonte da liveness.
 *
 * Antes, em inbox movimentado (cada mensagem em modo simples faz o backend emitir
 * `conversa_atualizada` com `modo_simples_aguardando`), o GET rodava a cada evento e
 * sobrecarregava/piscava a lista. Agora só recarregamos depois de acumular
 * `CHAT_LIST_RESYNC_COALESCE_COUNT` eventos, OU quando passa o teto de espera
 * `CHAT_LIST_RESYNC_COALESCE_MAX_WAIT_MS` (o que vier primeiro).
 *
 * Exceção: ações do próprio usuário (assumir/encerrar) chegam com `force` e reconciliam
 * imediatamente — são raras e precisam ser instantâneas.
 */
const CHAT_LIST_RESYNC_COALESCE_COUNT = 6;
const CHAT_LIST_RESYNC_COALESCE_MAX_WAIT_MS = 5000;

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
  const coalesceTimerRef = useRef(null);
  const pendingResyncCountRef = useRef(0);
  const firstPendingAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (coalesceTimerRef.current) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
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

    // Dispara o GET de reconciliação (respeitando um load em voo) e zera o lote.
    const runListLoad = () => {
      pendingResyncCountRef.current = 0;
      firstPendingAtRef.current = 0;
      if (coalesceTimerRef.current) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
      }
      if (loadInFlightRef.current) {
        loadQueuedRef.current = { background: true };
        return;
      }
      loadRef.current?.({ background: true });
    };

    // Ações do próprio usuário (assumir/encerrar/transferir) → reconciliar já.
    if (forceResync) {
      runListLoad();
      void refreshChatFilterCounts({ silent: true });
      return;
    }

    // Acumula o evento no lote atual. A lista já reagiu ao socket na store; aqui só
    // decidimos QUANDO vale a pena o GET de reconciliação. Os contadores dos chips
    // (`/chats/counts`) são pesados (varredura de milhares de linhas), então também só
    // são atualizados no flush do lote — não a cada evento.
    pendingResyncCountRef.current += 1;
    if (!firstPendingAtRef.current) {
      firstPendingAtRef.current = Date.now();
    }

    const waitedMs = Date.now() - firstPendingAtRef.current;
    const reachedCount = pendingResyncCountRef.current >= CHAT_LIST_RESYNC_COALESCE_COUNT;
    const waitedLong = waitedMs >= CHAT_LIST_RESYNC_COALESCE_MAX_WAIT_MS;

    if (reachedCount || waitedLong) {
      runListLoad();
      void refreshChatFilterCounts({ silent: true });
      return;
    }

    // Ainda dentro do lote: garante um flush no teto de espera para o "resto" do lote
    // (menos de X eventos) também reconciliar, sem depender de um novo evento chegar.
    if (!coalesceTimerRef.current) {
      const delay = Math.max(0, CHAT_LIST_RESYNC_COALESCE_MAX_WAIT_MS - waitedMs);
      coalesceTimerRef.current = setTimeout(() => {
        coalesceTimerRef.current = null;
        runListLoad();
        void refreshChatFilterCounts({ silent: true });
      }, delay);
    }
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
