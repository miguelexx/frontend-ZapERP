import { useCallback, useEffect } from "react";
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
  const handleLoadMoreChats = useCallback(async () => {
    const page = chatListPageRef.current;
    const baseParams = lastListParamsRef.current;
    if (!baseParams || !page?.hasMore || !page?.nextCursor || page.loading) return;

    const requestId = loadRequestIdRef.current;
    const cacheRevision = getChatListRowsCacheRevision(filterScopeKey);
    setChatListPage((prev) => ({ ...prev, loading: true, error: "" }));
    const loadMoreAbort = new AbortController();

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
      if (requestId !== loadRequestIdRef.current) return;

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
      if (isAbortError(e)) return;
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Não foi possível carregar mais conversas.";
      setChatListPage((prev) => ({ ...prev, loading: false, error: String(msg) }));
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
