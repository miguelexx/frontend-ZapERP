import { useCallback, useEffect, useRef } from "react";
import { fetchChats, CHAT_LIST_PRESERVE_MAX_PAGES } from "../chatService";
import { useChatStore } from "../chatsStore";
import { getChatListRowsCacheRevision, persistChatListRowsForFilterToSession, persistChatListSidebarToSession } from "../chatListSidebarCache";
import {
  isAppAdmin,
  getChatListPageLimit,
  TABS_HIDE_OPTIMISTIC_CLOSED,
  sortChatRowsByOrder,
  dedupeChatRowsByStableKey,
  mergeChatRowsPreservingCurrent,
  buildChatListPageState,
  isAbortError,
} from "../chatListQueryHelpers";

/**
 * Paginação da lista: load more, limites, fim da lista, cancelamento por generation
 * e avanço automático quando a página SQL vem vazia.
 * Cache e ordem das rows permanecem os atuais.
 */
export function useChatListPagination({
  chatListPage,
  setChatListPage,
  chatListPageRef,
  lastListParamsRef,
  loadRequestIdRef,
  emptyPageAdvanceRef,
  tab,
  tabRef,
  listLoading,
  hasListRows,
  isMobileLayout,
  adminAtendenteFilterId,
  mineOnly,
  user,
  order,
  setChats,
  setMinhaFilaList,
  filterScopeKey,
  filterRequestKey,
  emAtendimentoBadgeCount,
  aguardandoClienteBadgeCount,
  mensagensDisparadasCount,
  filterOptimisticRemovedForTab,
}) {
  const requestRef = useRef(null);
  useEffect(() => () => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
  }, [filterScopeKey, filterRequestKey]);

  const handleLoadMoreChats = useCallback(async () => {
    const page = chatListPageRef.current;
    const baseParams = lastListParamsRef.current;
    if (!baseParams || !page?.hasMore || !page?.nextCursor || page.loading) return;

    const requestId = loadRequestIdRef.current;
    // Ref trava chamadas no mesmo frame, antes de React publicar loading=true.
    if (requestRef.current?.requestId === requestId) return;
    requestRef.current?.controller.abort();
    const cacheRevision = getChatListRowsCacheRevision(filterScopeKey);
    setChatListPage((prev) => ({ ...prev, loading: true, error: "" }));
    const loadMoreAbort = new AbortController();
    const request = { requestId, controller: loadMoreAbort };
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request &&
      !loadMoreAbort.signal.aborted && requestId === loadRequestIdRef.current;

    try {
      const data = await fetchChats(
        {
          ...baseParams,
          cursor: page.nextCursor,
          cursorId: page.nextCursorId,
          limit: getChatListPageLimit(isMobileLayout),
        },
        { signal: loadMoreAbort.signal }
      );
      if (!isCurrent()) return;

      const adminPorFuncionario =
        adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
      let list = Array.isArray(data) ? data : [];
      const searchActive = Boolean(String(baseParams.palavra || "").trim());
      if (!searchActive && TABS_HIDE_OPTIMISTIC_CLOSED.has(String(tabRef.current || ""))) {
        list = filterOptimisticRemovedForTab(list, tabRef.current);
      }
      if (!adminPorFuncionario && mineOnly && user?.id && !isAppAdmin(user)) {
        list = list.filter((c) => String(c.atendente_id) === String(user.id));
      }
      list = sortChatRowsByOrder(dedupeChatRowsByStableKey(list), order);
      const nextPagesLoaded = Math.min(
        CHAT_LIST_PRESERVE_MAX_PAGES,
        Math.max(1, Number(page.pagesLoaded || 1) + 1)
      );
      setChatListPage(buildChatListPageState(data, nextPagesLoaded));

      if (!searchActive && !adminPorFuncionario && tabRef.current === "minha_fila") {
        setChats((prev) => mergeChatRowsPreservingCurrent(prev || [], list, order));
        persistChatListRowsForFilterToSession(filterScopeKey, filterRequestKey, useChatStore.getState().chats || [], { revision: cacheRevision });
        setMinhaFilaList((prev) => {
          const merged = mergeChatRowsPreservingCurrent(prev || [], list, order);
          persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
            minhaFila: merged,
          });
          return merged;
        });
        return;
      }

      setChats((prev) => mergeChatRowsPreservingCurrent(prev || [], list, order));
      persistChatListRowsForFilterToSession(
        filterScopeKey,
        filterRequestKey,
        useChatStore.getState().chats || [],
        { revision: cacheRevision }
      );
      persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
        emAtendimentoBadgeCount,
        aguardandoClienteBadgeCount,
        mensagensDisparadasCount,
      });
    } catch (e) {
      if (!isCurrent() || isAbortError(e)) return;
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Não foi possível carregar mais conversas.";
      setChatListPage((prev) => ({ ...prev, loading: false, error: String(msg) }));
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, [
    adminAtendenteFilterId,
    mineOnly,
    user?.id,
    order,
    setChats,
    setMinhaFilaList,
    filterScopeKey,
    filterRequestKey,
    emAtendimentoBadgeCount,
    aguardandoClienteBadgeCount,
    mensagensDisparadasCount,
    filterOptimisticRemovedForTab,
    isMobileLayout,
  ]);

  // Página SQL filtrada ficou vazia mas ainda há has_more: avança sozinho (senão a lista parece “sumida”).
  useEffect(() => {
    if (tab === "minha_fila" && !String(lastListParamsRef.current?.palavra || "").trim()) {
      emptyPageAdvanceRef.current = 0;
      return;
    }
    if (listLoading || chatListPage.loading) return;
    if (!chatListPage.hasMore || !chatListPage.nextCursor) {
      emptyPageAdvanceRef.current = 0;
      return;
    }
    if (hasListRows) {
      emptyPageAdvanceRef.current = 0;
      return;
    }
    if (emptyPageAdvanceRef.current >= 5) return;
    emptyPageAdvanceRef.current += 1;
    void handleLoadMoreChats();
  }, [
    tab,
    listLoading,
    hasListRows,
    chatListPage.hasMore,
    chatListPage.nextCursor,
    chatListPage.loading,
    handleLoadMoreChats,
  ]);

  return { handleLoadMoreChats };
}
