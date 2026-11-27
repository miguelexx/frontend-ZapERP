import { memo, useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";
import { Ban, Bell, BellOff, CircleCheck, Eraser, Pin, PinOff, Star, StarOff, Trash2 } from "lucide-react";
import { useChatStore } from "./chatsStore";
import { chatListsStoreEquivalent } from "./chatListStoreCompare";
import { useConversaStore } from "../conversa/conversaStore";
import { isGroupConversation } from "../utils/conversaUtils";
import { useNotificationStore } from "../notifications/notificationStore";
import { useConversationActionMenu } from "./useConversationActionMenu";
import { useChatListFilters } from "./hooks/useChatListFilters";
import { useChatListCounts, getActiveFilterTotalCount } from "./hooks/useChatListCounts";
import { rowPrefs } from "./chatListRowAtendimento";
import { getDisplayName } from "./chatListDisplay";
import {
  getKnownContactBlockState,
  mergePrefsFromPatchResponse,
  toggleFavoriteConversation,
  toggleMuteConversation,
  togglePinConversation,
} from "./conversationActionsService";
import { friendlyApiError } from "../utils/friendlyApiError";
import { initZapDomEnhancements } from "./zapDomEnhancements";
import { CHAT_LIST_VIRTUAL_THRESHOLD } from "./ChatListRows";
import ChatListToolbar from "./ChatListToolbar";
import ChatListRowsPane from "./ChatListRowsPane";

/*
 * Ícones do menu da conversa (A3-04): lucide, como o menu da bolha e a thread — antes eram
 * emoji coloridos, desenhados diferente em cada sistema e com a estrela em glifo de texto.
 * Elementos criados uma vez: o menu não recria SVG a cada abertura.
 */
const MENU_ICON = { size: 16, strokeWidth: 1.8, "aria-hidden": true };
const ICON_MUTE = <BellOff {...MENU_ICON} />;
const ICON_UNMUTE = <Bell {...MENU_ICON} />;
const ICON_PIN = <Pin {...MENU_ICON} />;
const ICON_UNPIN = <PinOff {...MENU_ICON} />;
const ICON_FAVORITE = <Star {...MENU_ICON} />;
const ICON_UNFAVORITE = <StarOff {...MENU_ICON} />;
const ICON_BLOCK = <Ban {...MENU_ICON} />;
const ICON_UNBLOCK = <CircleCheck {...MENU_ICON} />;
const ICON_CLEAR = <Eraser {...MENU_ICON} />;
const ICON_DELETE = <Trash2 {...MENU_ICON} />;

/**
 * Único bloco que assina `chats` na store.
 * Toolbar (busca/chips) e linhas ficam em filhos memoizados para reduzir re-render em cascata.
 */
function ChatListBody({
  scrollRef,
  scrollSaveRef,
  scrollTopNoncePrevRef,
  searchRef,
  searchClearNonce,
  searchInput,
  onSearchInputChange,
  onSearchDebounced,
  onClearSearch,
  isMobileLayout,
  rowCurrentUserId,
  user,
  separarMensagensDisparadasLigado,
  debouncedSearch,
  statusFilter,
  tagFilter,
  departamentoFilter,
  atendenteFilter,
  whatsappInstanceFilter,
  mineOnly,
  order,
  tab,
  minhaFilaList,
  adminAtendenteFilterId,
  onlyFinalizadasAusencia,
  aguardandoClienteOnly,
  pagamentosPendentesOnly,
  emAtrasoOnly,
  isFinanceiroUser,
  pendentesFuncionarioSet,
  minhaFilaCount,
  chatFilterCounts,
  activeListTotalCount,
  emAtendimentoBadgeCount,
  aguardandoClienteBadgeCount,
  pagamentosPendentesBadgeCount,
  emAtrasoBadgeCount,
  mensagensDisparadasCount,
  supervisaoResumo,
  pendentesFuncionarioIds,
  zapFilterSkeleton,
  setZapFilterSkeleton,
  adminPorFuncionarioAtivo,
  atendentes,
  adminAtendentePanelOpen,
  setAdminAtendentePanelOpen,
  setAdminAtendenteFilterId,
  clearAdminAtendenteFilter,
  setShowNovoMenu,
  setShowFilters,
  setTab,
  onClearPendenciaAtiva,
  setNovoContatoModalOpen,
  onSelect,
  onOpenClienteSemConversa,
  onRequestConfirmClear,
  onRequestConfirmDelete,
  onRequestConfirmBlock,
  onReloadList,
  onRetryList,
  canLoadMoreChats = false,
  loadingMoreChats = false,
  loadMoreChatsError = "",
  onLoadMoreChats,
  listRefreshing = false,
  middleSlot = null,
  filtersPanelSlot = null,
  conversaIdsPendenciaAtiva = null,
  hasActivePendencia = false,
}) {
  const chats = useChatStore((s) => s.chats || [], chatListsStoreEquivalent);
  const chatsLength = chats?.length ?? 0;
  const hasStoreChats = chatsLength > 0;
  const { loading, chatListScrollToTopNonce } = useChatStore(
    (s) => ({
      loading: s.loading,
      chatListScrollToTopNonce: s.chatListScrollToTopNonce ?? 0,
    }),
    shallow
  );

  const showToast = useNotificationStore((s) => s.showToast);

  // useDeferredValue: mantém a digitação fluida — sob pressão, o refiltro da lista
  // roda num render de prioridade baixa em vez de bloquear cada tecla.
  const deferredSearchInput = useDeferredValue(searchInput);

  const { chatsFiltrados } = useChatListFilters({
    chats,
    minhaFilaList,
    debouncedSearch: deferredSearchInput,
    statusFilter,
    tagFilter,
    departamentoFilter,
    atendenteFilter,
    whatsappInstanceFilter,
    mineOnly,
    order,
    tab,
    user,
    adminAtendenteFilterId,
    onlyFinalizadasAusencia,
    aguardandoClienteOnly,
    pagamentosPendentesOnly,
    emAtrasoOnly,
    pendentesFuncionarioSet,
    conversaIdsPendenciaAtiva,
  });

  const {
    minhaFilaCount: minhaFilaCountFromServer,
    total,
    countHoje,
    countAbertas,
    countEmAtendimento,
    countFinalizadas,
    countFinalizadasAuto,
    countAguardandoCliente,
    countAguardandoAtendente,
    countPagamentosPendentes,
    countEmAtraso,
    countAguardandoFuncionario,
    mensagensDisparadasCount: mensagensDisparadasFromServer,
    campanhasCount,
    aguardandoFuncionarioVisualState,
  } = useChatListCounts({
    chatFilterCounts,
    supervisaoResumo,
    pendentesFuncionarioIds,
    separarMensagensDisparadasLigado,
  });

  const minhaFilaCountResolved = minhaFilaCountFromServer ?? minhaFilaCount ?? 0;
  const countEmAtendimentoResolved = countEmAtendimento ?? emAtendimentoBadgeCount ?? 0;
  const countAguardandoClienteResolved = countAguardandoCliente ?? aguardandoClienteBadgeCount ?? 0;
  const countPagamentosPendentesResolved = countPagamentosPendentes ?? pagamentosPendentesBadgeCount ?? 0;
  const countEmAtrasoResolved = countEmAtraso ?? emAtrasoBadgeCount ?? 0;
  const mensagensDisparadasResolved = mensagensDisparadasFromServer ?? mensagensDisparadasCount ?? 0;

  const activeFilterTotalCount = getActiveFilterTotalCount({
    tab,
    counts: chatFilterCounts,
    activeListTotalCount,
    adminPorFuncionarioAtivo,
    countAguardandoFuncionario,
  });

  const filteredCount = chatsFiltrados.length;
  const chatsFiltradosLayoutKey = useMemo(
    () => chatsFiltrados.map((c) => String(c?.id ?? "")).join("\n"),
    [chatsFiltrados]
  );

  useEffect(() => {
    if (isMobileLayout && chatsLength >= CHAT_LIST_VIRTUAL_THRESHOLD) {
      return undefined;
    }
    const cleanup = initZapDomEnhancements(document.querySelector(".chat-list-root") || document);
    return cleanup;
  }, [isMobileLayout, chatsLength]);

  const visibleConversationIds = useMemo(
    () => chatsFiltrados.map((c) => String(c?.id)).filter(Boolean),
    [chatsFiltrados]
  );

  const { openConversationId, anchorRect, openMenu, closeMenu } = useConversationActionMenu({
    visibleConversationIds,
    resetKey: `${tab}-${adminAtendenteFilterId ?? ""}`,
  });

  const openMenuChat = useMemo(
    () => chatsFiltrados.find((c) => String(c?.id) === String(openConversationId)) || null,
    [chatsFiltrados, openConversationId]
  );

  const menuActions = useMemo(() => {
    const chat = openMenuChat;
    if (!chat) return [];
    const isGroup = isGroupConversation(chat);
    const p = rowPrefs(chat);
    // Bloqueio de contato só existe no Whapi (blacklist). No UltraMSG o item fica oculto.
    const isWhapi = String(chat?.whatsapp_instance_provider || "").toLowerCase() === "whapi";
    const canBlock = !isGroup && isWhapi;
    // Uma ação só (A3-12): o backend não informa o bloqueio na linha. Conhecido nesta sessão
    // (resposta do último bloquear/desbloquear) → a ação contrária; desconhecido → "Bloquear",
    // o caso de quase todo contato (bloquear de novo quem já está bloqueado não muda nada).
    const bloqueado = canBlock ? getKnownContactBlockState(chat) === true : false;
    return [
      {
        id: "mute",
        label: p.silenciado ? "Remover silêncio" : "Silenciar notificações",
        icon: p.silenciado ? ICON_UNMUTE : ICON_MUTE,
        visible: true,
        disabled: false,
      },
      {
        id: "pin",
        label: p.fixada ? "Desafixar conversa" : "Fixar conversa",
        icon: p.fixada ? ICON_UNPIN : ICON_PIN,
        visible: true,
        disabled: false,
      },
      {
        id: "favorite",
        label: p.favorita ? "Remover dos favoritos" : "Adicionar aos favoritos",
        icon: p.favorita ? ICON_UNFAVORITE : ICON_FAVORITE,
        visible: true,
        disabled: false,
      },
      {
        id: "block",
        label: "Bloquear contato",
        icon: ICON_BLOCK,
        visible: canBlock && !bloqueado,
        disabled: isGroup,
      },
      {
        id: "unblock",
        label: "Desbloquear contato",
        icon: ICON_UNBLOCK,
        visible: canBlock && bloqueado,
        disabled: isGroup,
      },
      {
        id: "clear",
        label: "Limpar conversa",
        icon: ICON_CLEAR,
        visible: true,
        disabled: false,
      },
      {
        id: "delete",
        label: "Apagar conversa",
        icon: ICON_DELETE,
        danger: true,
        visible: true,
        disabled: isGroup,
        tooltip: isGroup ? "Grupos não podem ser apagados por esta ação." : undefined,
      },
    ];
  }, [openMenuChat]);

  const activateMainTab = useCallback(
    (nextTab) => {
      if (hasActivePendencia) onClearPendenciaAtiva?.();
      onClearSearch?.();
      setTab(nextTab);
    },
    [hasActivePendencia, onClearPendenciaAtiva, onClearSearch, setTab]
  );

  const onTabMinhaFila = useCallback(() => activateMainTab("minha_fila"), [activateMainTab]);
  const onTabCampanhas = useCallback(() => activateMainTab("campanhas"), [activateMainTab]);
  const onTabTodas = useCallback(() => activateMainTab("todas"), [activateMainTab]);
  const onTabAguardandoAtendente = useCallback(() => activateMainTab("aguardando_atendente"), [activateMainTab]);
  const onTabHoje = useCallback(() => activateMainTab("hoje"), [activateMainTab]);
  const onTabAbertas = useCallback(() => activateMainTab("abertas"), [activateMainTab]);
  const onTabMensagensDisparadas = useCallback(() => activateMainTab("mensagens_disparadas"), [activateMainTab]);
  const onTabEmAtendimento = useCallback(() => activateMainTab("em_atendimento"), [activateMainTab]);
  const onTabFinalizadas = useCallback(() => activateMainTab("finalizadas"), [activateMainTab]);
  const onTabFinalizadasAuto = useCallback(() => activateMainTab("finalizadas_auto"), [activateMainTab]);
  const onTabAguardandoCliente = useCallback(() => activateMainTab("aguardando_cliente"), [activateMainTab]);
  const onTabPagamentosPendentes = useCallback(() => activateMainTab("pagamentos_pendentes"), [activateMainTab]);
  const onTabEmAtraso = useCallback(() => activateMainTab("em_atraso"), [activateMainTab]);
  const onTabAguardandoFuncionario = useCallback(() => activateMainTab("aguardando_funcionario"), [activateMainTab]);

  const onAdminSelectUser = useCallback(
    (u) => {
      if (u?.id == null) return;
      onClearSearch?.();
      setAdminAtendenteFilterId(String(u.id));
    },
    [onClearSearch, setAdminAtendenteFilterId]
  );

  const onAdminBeforeOpen = useCallback(() => {
    setShowNovoMenu(false);
    setShowFilters(false);
    closeMenu();
  }, [setShowNovoMenu, setShowFilters, closeMenu]);

  const onNovoContato = useCallback(() => setNovoContatoModalOpen(true), [setNovoContatoModalOpen]);

  const handleMenuAction = useCallback(
    async (action) => {
      if (!action || action.disabled || !openMenuChat?.id) return;
      const chatId = openMenuChat.id;
      const prefs = rowPrefs(openMenuChat);
      const currentSelectedId = useConversaStore.getState().selectedId;
      const isOpenConversation = String(currentSelectedId || "") === String(chatId);

      if (action.id === "clear") {
        onRequestConfirmClear({ chatId, isOpenConversation });
        closeMenu();
        return;
      }
      if (action.id === "delete") {
        onRequestConfirmDelete({ chatId, isOpenConversation });
        closeMenu();
        return;
      }
      if (action.id === "block" || action.id === "unblock") {
        // Confirmação no ConfirmDialog do chatList (A3-03), como Limpar e Apagar — antes era o
        // window.confirm cinza do navegador.
        const bloquear = action.id === "block";
        const nome = getDisplayName(openMenuChat) || "este contato";
        onRequestConfirmBlock?.({ chatId, bloquear, nome });
        closeMenu();
        return;
      }

      closeMenu();

      try {
        if (action.id === "mute") {
          const nextMuted = !prefs.silenciado;
          useChatStore.getState().updateChat({ id: chatId, silenciado: nextMuted });
          const data = await toggleMuteConversation(chatId, nextMuted);
          useChatStore.getState().updateChat({ id: chatId, ...mergePrefsFromPatchResponse(data) });
          showToast({
            type: "success",
            title: nextMuted ? "Notificações silenciadas" : "Silêncio removido",
            message: nextMuted ? "Esta conversa foi silenciada." : "Esta conversa voltou a notificar.",
          });
          return;
        }
        if (action.id === "pin") {
          const nextPinned = !prefs.fixada;
          useChatStore
            .getState()
            .updateChat({
              id: chatId,
              fixada: nextPinned,
              fixada_em: nextPinned ? new Date().toISOString() : null,
            });
          const data = await togglePinConversation(chatId, nextPinned);
          useChatStore.getState().updateChat({ id: chatId, ...mergePrefsFromPatchResponse(data) });
          // Grupo fixado entra/sai da Minha fila: tira a linha dos caches das abas (sem isso a
          // Minha fila em cache mostrava o estado antigo até o GET) e reconcilia lista + chip já.
          if (isGroupConversation(openMenuChat)) {
            useChatStore.getState().requestChatListResync({ force: true, chatId });
          }
          showToast({
            type: "success",
            title: nextPinned ? "Conversa fixada" : "Conversa desafixada",
            message: nextPinned
              ? "A conversa subiu para o topo da lista."
              : "A conversa voltou à ordenação padrão.",
          });
          return;
        }
        if (action.id === "favorite") {
          const nextFavorite = !prefs.favorita;
          useChatStore.getState().updateChat({ id: chatId, favorita: nextFavorite });
          const data = await toggleFavoriteConversation(chatId, nextFavorite);
          useChatStore.getState().updateChat({ id: chatId, ...mergePrefsFromPatchResponse(data) });
          showToast({
            type: "success",
            title: nextFavorite ? "Favorito adicionado" : "Favorito removido",
            message: nextFavorite
              ? "Conversa marcada como favorita."
              : "Conversa removida dos favoritos.",
          });
        }
      } catch (e) {
        showToast({
          type: "error",
          title: "Ação não concluída",
          message: friendlyApiError(e, "Não foi possível concluir esta ação. Tente de novo."),
        });
        onReloadList();
      }
    },
    [openMenuChat, closeMenu, showToast, onRequestConfirmClear, onRequestConfirmDelete, onRequestConfirmBlock, onReloadList]
  );

  return (
    <>
      <ChatListToolbar
        searchRef={searchRef}
        searchClearNonce={searchClearNonce}
        searchInput={searchInput}
        searchPending={String(searchInput || "").trim() !== String(debouncedSearch || "").trim()}
        onSearchInputChange={onSearchInputChange}
        onSearchDebounced={onSearchDebounced}
        tab={tab}
        user={user}
        separarMensagensDisparadasLigado={separarMensagensDisparadasLigado}
        minhaFilaCount={minhaFilaCountResolved}
        total={total}
        countHoje={countHoje}
        countAbertas={countAbertas}
        countEmAtendimento={countEmAtendimentoResolved}
        countFinalizadas={countFinalizadas}
        countFinalizadasAuto={countFinalizadasAuto}
        countAguardandoCliente={countAguardandoClienteResolved}
        countAguardandoAtendente={countAguardandoAtendente}
        isFinanceiroUser={isFinanceiroUser}
        countPagamentosPendentes={countPagamentosPendentesResolved}
        countEmAtraso={countEmAtrasoResolved}
        countAguardandoFuncionario={countAguardandoFuncionario}
        aguardandoFuncionarioVisualState={aguardandoFuncionarioVisualState}
        mensagensDisparadasCount={mensagensDisparadasResolved}
        campanhasCount={campanhasCount}
        listRefreshing={listRefreshing}
        loading={loading}
        hasStoreChats={hasStoreChats}
        filteredCount={filteredCount}
        activeFilterTotalCount={activeFilterTotalCount}
        adminPorFuncionarioAtivo={adminPorFuncionarioAtivo}
        atendentes={atendentes}
        adminAtendenteFilterId={adminAtendenteFilterId}
        adminAtendentePanelOpen={adminAtendentePanelOpen}
        onAdminPanelOpenChange={setAdminAtendentePanelOpen}
        onAdminSelectUser={onAdminSelectUser}
        onAdminClear={clearAdminAtendenteFilter}
        onAdminBeforeOpen={onAdminBeforeOpen}
        onTabMinhaFila={onTabMinhaFila}
        onTabCampanhas={onTabCampanhas}
        onTabTodas={onTabTodas}
        onTabAguardandoAtendente={onTabAguardandoAtendente}
        onTabHoje={onTabHoje}
        onTabAbertas={onTabAbertas}
        onTabMensagensDisparadas={onTabMensagensDisparadas}
        onTabEmAtendimento={onTabEmAtendimento}
        onTabFinalizadas={onTabFinalizadas}
        onTabFinalizadasAuto={onTabFinalizadasAuto}
        onTabAguardandoCliente={onTabAguardandoCliente}
        onTabPagamentosPendentes={onTabPagamentosPendentes}
        onTabEmAtraso={onTabEmAtraso}
        onTabAguardandoFuncionario={onTabAguardandoFuncionario}
        middleSlot={middleSlot}
        filtersPanelSlot={filtersPanelSlot}
        hasActivePendencia={hasActivePendencia}
      />

      <ChatListRowsPane
        scrollRef={scrollRef}
        scrollSaveRef={scrollSaveRef}
        scrollTopNoncePrevRef={scrollTopNoncePrevRef}
        chatsFiltrados={chatsFiltrados}
        chatsFiltradosLayoutKey={chatsFiltradosLayoutKey}
        loading={loading}
        hasStoreChats={hasStoreChats}
        tab={tab}
        minhaFilaList={minhaFilaList}
        adminPorFuncionarioAtivo={adminPorFuncionarioAtivo}
        zapFilterSkeleton={zapFilterSkeleton}
        isMobileLayout={isMobileLayout}
        rowCurrentUserId={rowCurrentUserId}
        rowCurrentUserName={String(user?.nome ?? user?.name ?? user?.email ?? "").trim()}
        chatListScrollToTopNonce={chatListScrollToTopNonce}
        onSelect={onSelect}
        onOpenClienteSemConversa={onOpenClienteSemConversa}
        openConversationId={openConversationId}
        onToggleMenu={openMenu}
        pendentesFuncionarioSet={pendentesFuncionarioSet}
        onNovoContato={onNovoContato}
        searchAtivo={Boolean(String(searchInput || "").trim())}
        menuIsOpen={!!openConversationId}
        menuAnchorRect={anchorRect}
        menuActions={menuActions}
        onMenuClose={closeMenu}
        onMenuAction={handleMenuAction}
        canLoadMoreChats={canLoadMoreChats}
        loadingMoreChats={loadingMoreChats}
        loadMoreChatsError={loadMoreChatsError}
        onLoadMoreChats={onLoadMoreChats}
        onRetryList={onRetryList}
        listRefreshing={listRefreshing}
      />
    </>
  );
}

export default memo(ChatListBody);
