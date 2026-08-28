import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import { useMatchMedia } from "../hooks/useMatchMedia";
import {
  fetchChats,
  fetchChatsPages,
  fetchMinhaFilaChatsCompleto,
  CHAT_LIST_PRESERVE_MAX_PAGES,
  fetchChatCounts,
  getChatsPageMeta,
  abrirConversaCliente,
  postFinalizacaoAusenciaLote,
} from "./chatService";
import { useChatStore } from "./chatsStore";
import { useConversaStore } from "../conversa/conversaStore";
import { listarTags } from "../api/tagService";
import { useAuthStore } from "../auth/authStore";
import { isSupervisorOrAdmin } from "../auth/permissions";
import {
  isGroupConversation,
  getStatusAtendimentoEffective,
} from "../utils/conversaUtils";
import api from "../api/http";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotificationStore } from "../notifications/notificationStore";
import ConfirmDialog from "../components/feedback/ConfirmDialog";
import "../components/feedback/empty-state.css";
import "../components/feedback/skeleton.css";
import "../components/ui/button.css";
import "./chatList.css";
import "./chatList.chips-premium.css";
import "../styles/zap-animations.css";
import NovoContatoModal from "./NovoContatoModal";
import { ZAPERP_FOCUS_CHAT_SEARCH_EVENT } from "../atendimento/atendimentoUiEvents";
import { getDisplayName, pickPreferredAvatarUrl } from "./chatListDisplay";
const ProdutoConsultaPanel = lazy(() => import("../conversa/ProdutoConsultaPanel"));
export { getDisplayName };
import {
  isConversaAguardandoCliente,
  isConversaAguardandoFuncionario,
  isConversaEmAtendimentoBadge,
  isConversaPagamentoPendente,
  isConversaEmAtrasoPagamento,
  sortChatListByRecent,
  mergeChatRowListaAtividade,
} from "./chatListRowAtendimento";
import { isUsuarioSetorFinanceiro } from "../utils/financeiroSector";
import { useAdminAtendenteFilter } from "./useAdminAtendenteFilter";
import { scheduleAfterInitialPaint } from "./scheduleAfterInitialPaint";
import {
  buildChatListFiltersScopeKey,
  getChatListFiltersDataCache,
  hydrateChatListFiltersFromSession,
  loadChatListAtendentesOnce,
  loadChatListFiltersDataOnce,
  setChatListFiltersScope,
} from "./chatListFiltersData";
import {
  hydrateChatListRowsForFilterFromSession,
  hydrateChatListSidebarFromSession,
  persistChatListSidebarToSession,
  persistChatListRowsForFilterToSession,
} from "./chatListSidebarCache";
import {
  resetAuxBadgeRequestsForScope,
  runAuxBadgeFetch,
} from "./chatListAuxBadgeRequests";
import ChatListBody from "./ChatListBody";
import ChatListHeaderBar from "./ChatListHeaderBar";
import ChatListAdvancedFiltersPanel from "./ChatListAdvancedFiltersPanel";
import MinhasPendenciasCard from "./MinhasPendenciasCard";
import { useMinhasPendencias } from "./hooks/useMinhasPendencias";
import { useWhatsappInstanceStatus } from "./hooks/useWhatsappInstanceStatus";
import { useChatListFilterState } from "./hooks/useChatListFilterState";
import { useChatListResync } from "./hooks/useChatListResync";
import { useChatListPagination } from "./hooks/useChatListPagination";
import { markPushEntryReady } from "../push/deferredPushSync";
import { getClientesPendentesSupervisao, getResumoSupervisao } from "../api/supervisaoService";
import { clearConversation, deleteConversation } from "./conversationActionsService";
import {
  isAppAdmin,
  countDistinctConversas,
  TABS_HIDE_OPTIMISTIC_CLOSED,
  shouldHideOptimisticClosedFromTab,
  getOptimisticRemovedRow,
  pruneExpiredOptimisticRemoved,
  sortChatRowsByOrder,
  dedupeChatRowsByStableKey,
  mergeChatRowsPreservingCurrent,
  mergeEmAtendimentoBackgroundRows,
  buildChatListPageState,
  buildCountsQueryParams,
  buildChatListFetchParams,
  isAbortError,
  isNetworkError,
} from "./chatListQueryHelpers";

/** Admin UI (filtro lateral por funcionário): aceita role/perfil legado. */
const CONFIRM_LOTE_AUSENCIA = "FINALIZAR_LOTE_AUSENCIA_CLIENTE";
const MOBILE_SECONDARY_REFRESH_DELAY_MS = 2800;
const MOBILE_COUNTS_DELAY_MS = 2600;
const MOBILE_FILTERS_BOOT_DELAY_MS = 3600;
const MOBILE_FILTERS_PREWARM_DELAY_MS = 5200;
const MOBILE_SUPERVISAO_POLL_DELAY_MS = 6000;
const MOBILE_PENDENCIAS_INITIAL_DELAY_MS = 2600;
const MOBILE_PENDENCIAS_RESYNC_DELAY_MS = 1400;
const OPTIMISTIC_MINHA_FILA_REMOVE_TTL_MS = 12000;
/** Contato oficial do Suporte ZapERP (DDD 34). */
const SUPORTE_ZAPERP_WHATSAPP_URL = "https://wa.me/5534999911246";

/** IDs de conversas individuais em atendimento (para assistente de lote por ausência). */
function collectEmAtendimentoIdsFromChats(list, max = 50) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => !isGroupConversation(c) && c?.id && !c.sem_conversa)
    .filter((c) => getStatusAtendimentoEffective(c) === "em_atendimento" && c.atendente_id != null)
    .map((c) => Number(c.id))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, max);
}

export default function ChatList() {
  const { setChats, setLoading, setUnread, addChat } = useChatStore(
    (s) => ({
      setChats: s.setChats,
      setLoading: s.setLoading,
      setUnread: s.setUnread,
      addChat: s.addChat,
    }),
    shallow
  );

  const navigate = useNavigate();
  const location = useLocation();

  const carregarConversa = useConversaStore((s) => s.carregarConversa);
  const queueComposerAppend = useConversaStore((s) => s.queueComposerAppend);
  const isMobileLayout = useMatchMedia("(max-width: 640px)");
  const { zapiConnected, zapiStatusLoaded } = useWhatsappInstanceStatus(isMobileLayout);
  const listLoading = useChatStore((s) => s.loading);
  const hasListRows = useChatStore((s) => (s.chats?.length ?? 0) > 0);

  const { user, rowCurrentUserId, separarMensagensDisparadasLigado, userRole } = useAuthStore(
    (s) => {
      const u = s.user;
      return {
        user: u,
        rowCurrentUserId: u?.id != null ? Number(u.id) : null,
        separarMensagensDisparadasLigado: u?.separar_mensagens_disparadas === true,
        userRole: String(u?.role || u?.perfil || "").toLowerCase(),
      };
    },
    shallow
  );

  const filterScopeKey = useMemo(() => buildChatListFiltersScopeKey(user), [user]);
  const {
    minhasPendencias,
    pendenciaAtiva,
    loadingPendencias,
    loadingPendenciaCategoria,
    conversaIdsPendenciaAtiva,
    onPendenciaClick,
    clearPendenciaAtiva,
    refresh: refreshMinhasPendencias,
  } = useMinhasPendencias(filterScopeKey, {
    skipInitial: isMobileLayout,
    initialDelayMs: isMobileLayout ? MOBILE_PENDENCIAS_INITIAL_DELAY_MS : 0,
    resyncDelayMs: isMobileLayout ? MOBILE_PENDENCIAS_RESYNC_DELAY_MS : 0,
  });
  const refreshMinhasPendenciasRef = useRef(refreshMinhasPendencias);
  refreshMinhasPendenciasRef.current = refreshMinhasPendencias;
  const conversaIdsPendenciaQuery = useMemo(() => {
    if (conversaIdsPendenciaAtiva == null) return null;
    const ids = Array.from(conversaIdsPendenciaAtiva)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids.join(",") : "0";
  }, [conversaIdsPendenciaAtiva]);
  const [listRefreshing, setListRefreshing] = useState(false);
  const sessionBootRef = useRef(null);
  const auxScopeKeyRef = useRef(null);
  const canConsultarProdutos = ["admin", "supervisor", "atendente"].includes(userRole);
  const canVerSyncProdutos = ["admin", "supervisor"].includes(userRole);
  const canSincronizarProdutos = userRole === "admin";

  const {
    selectedUserId: adminAtendenteFilterId,
    setSelectedUserId: setAdminAtendenteFilterId,
    panelOpen: adminAtendentePanelOpen,
    setPanelOpen: setAdminAtendentePanelOpen,
    clearSelection: clearAdminAtendenteFilter,
  } = useAdminAtendenteFilter();

  const searchRef = useRef(null);

  const scrollRef = useRef(null);
  const scrollSaveRef = useRef(0);
  const scrollTopNoncePrevRef = useRef(0);
  const loadRequestIdRef = useRef(0);
  const loadAbortRef = useRef(null);
  const countsAbortRef = useRef(null);
  const countsRequestIdRef = useRef(0);
  const mobileCountsBootSkippedRef = useRef(false);
  /** Evita GET /chats paralelos quando vários resyncs disparam load() na mesma janela */
  const loadInFlightRef = useRef(false);
  const loadQueuedRef = useRef(null);
  /** Evita resync do socket logo após load() principal (login/F5). */
  const lastLoadFinishedAtRef = useRef(0);
  const loadSecondaryScheduleCancelRef = useRef(null);
  const lastListParamsRef = useRef(null);
  /** Evita loop se várias páginas consecutivas vierem vazias após filtro in-memory. */
  const emptyPageAdvanceRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { scrollSaveRef.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const [allTags, setAllTags] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [departamentos, setDepartamentos] = useState(() => {
    const cached = getChatListFiltersDataCache()?.departamentos;
    return Array.isArray(cached) ? cached : [];
  });
  const isFinanceiroUser = useMemo(
    () => isUsuarioSetorFinanceiro(user, departamentos),
    [user, departamentos]
  );
  const isFinanceiroUserRef = useRef(isFinanceiroUser);
  isFinanceiroUserRef.current = isFinanceiroUser;
  const financeiroBadgesPrimedRef = useRef(false);
  const [filtersAuxLoading, setFiltersAuxLoading] = useState(false);

  const {
    searchInput,
    debouncedSearch,
    searchClearNonce,
    handleSearchDebounced,
    handleSearchInputChange,
    clearChatSearch,
    statusFilter,
    setStatusFilter,
    tagFilter,
    dataInicio,
    dataFim,
    atendenteFilter,
    departamentoFilter,
    mineOnly,
    order,
    showFilters,
    setShowFilters,
    onlyFinalizadasAusencia,
    aguardandoClienteOnly,
    pagamentosPendentesOnly,
    emAtrasoOnly,
    tempoParadoFilter,
    tab,
    setTab,
    tabRef,
    filterRequestKey,
    filterRequestBaseKey,
    handleStatusFilterChange,
    handleTagFilterChange,
    handleDepartamentoFilterChange,
    handleAtendenteFilterChange,
    handleDataInicioChange,
    handleDataFimChange,
    handleMineOnlyChange,
    handleOnlyFinalizadasAusenciaChange,
    handleAguardandoClienteOnlyChange,
    handlePagamentosPendentesOnlyChange,
    handleEmAtrasoOnlyChange,
    handleOrderChange,
    handleTempoParadoFilterChange,
    handleToggleFilters,
    resetFiltersToDefault,
  } = useChatListFilterState({
    user,
    separarMensagensDisparadasLigado,
    isFinanceiroUser,
    adminAtendenteFilterId,
    conversaIdsPendenciaQuery,
    filterScopeKey,
  });

  const [chatListPage, setChatListPage] = useState({
    hasMore: false,
    nextCursor: null,
    nextCursorId: null,
    totalCount: null,
    pagesLoaded: 1,
    loading: false,
    error: "",
  });
  const [chatFilterCounts, setChatFilterCounts] = useState(null);
  const [activeListTotalCount, setActiveListTotalCount] = useState(null);
  const chatListPageRef = useRef(chatListPage);
  chatListPageRef.current = chatListPage;
  const [loteAusenciaBusy, setLoteAusenciaBusy] = useState(false);
  const [loteAusenciaMsg, setLoteAusenciaMsg] = useState("");
  const [loteAusenciaConfirm, setLoteAusenciaConfirm] = useState("");

  const [novoContatoModalOpen, setNovoContatoModalOpen] = useState(false);
  const [showProdutosPanel, setShowProdutosPanel] = useState(false);
  const [confirmClear, setConfirmClear] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // menu "Novo" (botão +)
  const [showNovoMenu, setShowNovoMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const novoBtnRef = useRef(null);
  const novoMenuRef = useRef(null);

  const handlePendenciaClick = useCallback(
    (categoria) => {
      clearChatSearch();
      setTab("todas");
      void onPendenciaClick(categoria);
    },
    [clearChatSearch, onPendenciaClick, setTab]
  );
  const [zapFilterSkeleton, setZapFilterSkeleton] = useState(false);

  /** GET /chats?minha_fila=1 — fila do atendente (abertas + em atendimento comigo); sem status_atendimento na query. */
  const [minhaFilaList, setMinhaFilaList] = useState(null);
  const minhaFilaListRef = useRef(null);
  const optimisticRemovedMinhaFilaRef = useRef(new Map());
  const filterRequestKeyRef = useRef("");
  const filterRequestBaseKeyRef = useRef("");
  const filterRequestSearchRef = useRef("");
  minhaFilaListRef.current = minhaFilaList;
  const filterOptimisticRemovedMinhaFila = useCallback((list) => {
    const arr = Array.isArray(list) ? list : [];
    const removed = optimisticRemovedMinhaFilaRef.current;
    if (!removed?.size) return arr;
    pruneExpiredOptimisticRemoved(removed);
    if (!removed.size) return arr;
    return arr.filter((c) => !removed.has(String(c?.id)));
  }, []);
  const [minhaFilaCount, setMinhaFilaCount] = useState(0);
  /** Contador do chip “Em atendimento”: sempre GET /chats?status_atendimento=em_atendimento (escopo backend). */
  const [emAtendimentoBadgeCount, setEmAtendimentoBadgeCount] = useState(0);
  /** Contador do chip “Aguardando cliente”: sempre GET /chats?aguardando_cliente=1 (escopo do backend), nunca length de “Todas”. */
  const [aguardandoClienteBadgeCount, setAguardandoClienteBadgeCount] = useState(0);
  const [pagamentosPendentesBadgeCount, setPagamentosPendentesBadgeCount] = useState(0);
  const [emAtrasoBadgeCount, setEmAtrasoBadgeCount] = useState(0);
  /** Contador do chip “Mensagens Disparadas”: GET /chats?status_atendimento=mensagem_disparada (escopo backend). */
  const [mensagensDisparadasCount, setMensagensDisparadasCount] = useState(0);

  useEffect(() => {
    const applyCachedFilterRows = (cachedRows) => {
      if (!Array.isArray(cachedRows) || !cachedRows.length) return false;
      const cachedList = sortChatRowsByOrder(dedupeChatRowsByStableKey(cachedRows), order);
      setChats(cachedList);
      if (tab === "minha_fila") setMinhaFilaList(cachedList);
      return true;
    };

    if (!filterRequestKeyRef.current) {
      filterRequestKeyRef.current = filterRequestKey;
      filterRequestBaseKeyRef.current = filterRequestBaseKey;
      filterRequestSearchRef.current = debouncedSearch;
      if (!(useChatStore.getState().chats?.length > 0)) {
        applyCachedFilterRows(
          hydrateChatListRowsForFilterFromSession(filterScopeKey, filterRequestKey)
        );
      }
      return;
    }
    if (filterRequestKeyRef.current === filterRequestKey) return;
    const previousBaseKey = filterRequestBaseKeyRef.current;
    const previousSearch = filterRequestSearchRef.current;
    const onlySearchChanged =
      previousBaseKey === filterRequestBaseKey &&
      String(previousSearch || "") !== String(debouncedSearch || "");
    const hasRowsToPreserve = (useChatStore.getState().chats?.length ?? 0) > 0;
    /*
     * Digitar na busca só troca o termo — a aba e os filtros continuam os mesmos. Limpar as
     * linhas e mostrar esqueleto a cada lote de teclas fazia a lista piscar no desktop a
     * cada 350 ms. Mantemos as linhas atuais até a resposta chegar (o `load` corre em
     * background e substitui-as); o esqueleto fica reservado a mudanças reais de filtro/aba.
     */
    const preserveRowsDuringSearch = onlySearchChanged && hasRowsToPreserve;
    const cachedNextFilterRows = !preserveRowsDuringSearch
      ? hydrateChatListRowsForFilterFromSession(filterScopeKey, filterRequestKey)
      : null;
    const hasCachedNextFilter = Array.isArray(cachedNextFilterRows) && cachedNextFilterRows.length > 0;
    filterRequestKeyRef.current = filterRequestKey;
    filterRequestBaseKeyRef.current = filterRequestBaseKey;
    filterRequestSearchRef.current = debouncedSearch;
    setActiveListTotalCount(null);
    setChatListPage({
      hasMore: false,
      nextCursor: null,
      nextCursorId: null,
      totalCount: null,
      pagesLoaded: 1,
      loading: false,
      error: "",
    });
    if (preserveRowsDuringSearch) {
      setZapFilterSkeleton(false);
    } else if (hasCachedNextFilter) {
      setZapFilterSkeleton(false);
      applyCachedFilterRows(cachedNextFilterRows);
    } else {
      setZapFilterSkeleton(true);
      setChats([]);
      if (tab === "minha_fila") setMinhaFilaList(null);
    }
  }, [filterRequestKey, filterRequestBaseKey, debouncedSearch, tab, setChats, filterScopeKey, order]);

  /** Hidratação antes da pintura: lista + Minha fila + filtros auxiliares (F5). */
  useLayoutEffect(() => {
    if (!filterScopeKey) return;
    if (auxScopeKeyRef.current !== filterScopeKey) {
      auxScopeKeyRef.current = filterScopeKey;
      resetAuxBadgeRequestsForScope(filterScopeKey);
    }
    setChatListFiltersScope(filterScopeKey);
    if (hydrateChatListFiltersFromSession(filterScopeKey)) {
      const cached = getChatListFiltersDataCache();
      setAllTags(cached.tags ?? []);
      setAtendentes(cached.atendentes ?? []);
      setDepartamentos(cached.departamentos ?? []);
    }
    if (sessionBootRef.current === filterScopeKey) return;
    sessionBootRef.current = filterScopeKey;
    const boot = hydrateChatListSidebarFromSession(filterScopeKey);
    if (!boot?.chats?.length) return;
    if (!(useChatStore.getState().chats?.length > 0)) {
      setChats(boot.chats);
    }
    if (boot.minhaFila != null) {
      setMinhaFilaList((prev) => (prev == null ? filterOptimisticRemovedMinhaFila(boot.minhaFila) : prev));
    }
    if (boot.minhaFilaCount != null) {
      setMinhaFilaCount(boot.minhaFilaCount);
    }
    if (boot.emAtendimentoBadgeCount != null) {
      setEmAtendimentoBadgeCount(boot.emAtendimentoBadgeCount);
    }
    if (boot.aguardandoClienteBadgeCount != null) {
      setAguardandoClienteBadgeCount(boot.aguardandoClienteBadgeCount);
    }
    if (boot.mensagensDisparadasCount != null) {
      setMensagensDisparadasCount(boot.mensagensDisparadasCount);
    }
  }, [filterScopeKey, setChats, filterOptimisticRemovedMinhaFila]);

  /** Supervisão: resumo para badge e lista de conversas pendentes do funcionário. */
  const [supervisaoResumo, setSupervisaoResumo] = useState(null);
  const [pendentesFuncionarioIds, setPendentesFuncionarioIds] = useState([]);
  const pendentesFuncionarioSet = useMemo(
    () => new Set((pendentesFuncionarioIds || []).map((x) => String(x))),
    [pendentesFuncionarioIds]
  );
  const pendentesFuncionarioIdsRef = useRef(pendentesFuncionarioIds);
  pendentesFuncionarioIdsRef.current = pendentesFuncionarioIds;

  const showToast = useNotificationStore((s) => s.showToast);

  const handleSuporteZapERPClick = useCallback(() => {
    window.location.assign(SUPORTE_ZAPERP_WHATSAPP_URL);
  }, []);

  useEffect(() => {
    if (location.state?.openNovoContatoModal) {
      setNovoContatoModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const onFocusSearch = () => {
      searchRef.current?.focus?.();
      searchRef.current?.select?.();
    };
    window.addEventListener(ZAPERP_FOCUS_CHAT_SEARCH_EVENT, onFocusSearch);
    return () => window.removeEventListener(ZAPERP_FOCUS_CHAT_SEARCH_EVENT, onFocusSearch);
  }, []);

  useEffect(() => {
    setAdminAtendentePanelOpen(false);
  }, [location.pathname, setAdminAtendentePanelOpen]);

  useEffect(() => {
    if (!isAppAdmin(user)) clearAdminAtendenteFilter();
  }, [user?.perfil, user?.role, clearAdminAtendenteFilter]);

  const refreshChatFilterCounts = useCallback(async (opts = {}) => {
    const requestId = ++countsRequestIdRef.current;
    countsAbortRef.current?.abort();
    const controller = new AbortController();
    countsAbortRef.current = controller;
    try {
      const params = buildCountsQueryParams({
        tagFilter,
        departamentoFilter,
        dataInicio,
        dataFim,
        debouncedSearch,
        adminAtendenteFilterId,
      });
      const data = await fetchChatCounts(params, {
        signal: controller.signal,
        silent: opts.silent === true,
      });
      if (requestId !== countsRequestIdRef.current) return;
      setChatFilterCounts(data || null);
      if (data?.minha_fila != null) {
        setMinhaFilaCount((prev) => {
          const next = Number(data.minha_fila) || 0;
          return prev === next ? prev : next;
        });
      }
    } catch (e) {
      if (isAbortError(e)) return;
      if (import.meta.env?.DEV && opts.silent !== true) {
        console.warn("Contadores de conversas indisponiveis; mantendo valores atuais.", e);
      }
    }
  }, [
    tagFilter,
    departamentoFilter,
    dataInicio,
    dataFim,
    debouncedSearch,
    adminAtendenteFilterId,
  ]);

  const refreshMinhaFila = useCallback(async () => {
    try {
      const t = tabRef.current;
      const finalAutoQuery = t === "finalizadas_auto" || onlyFinalizadasAusencia;
      /** Só minha_fila=1 aqui — nunca misturar com aguardando_cliente (endpoint com escopo próprio). */
      const params = {
        minha_fila: true,
        tag_id: tagFilter !== "todas" ? tagFilter : undefined,
        departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
        atendente_id: atendenteFilter !== "todos" ? atendenteFilter : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        incluir_todos_clientes: undefined,
      };
      if (finalAutoQuery) {
        params.status_atendimento = "fechada";
        params.finalizacao_motivo = "ausencia_cliente";
      }
      if (tempoParadoFilter) params.tempo_parado = tempoParadoFilter;
      const data = await fetchMinhaFilaChatsCompleto(params, { silent: true });
      const list = filterOptimisticRemovedMinhaFila(Array.isArray(data) ? data : []);
      const pageMeta = getChatsPageMeta(data);
      const count = pageMeta.totalCount ?? countDistinctConversas(list);
      setMinhaFilaCount((prev) => (prev === count ? prev : count));
      if (tabRef.current === "minha_fila") {
        setMinhaFilaList(list);
      }
      persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
        minhaFila: list,
        minhaFilaCount: count,
      });
    } catch (e) {
      console.error("Erro ao carregar Minha fila:", e);
    }
  }, [tagFilter, departamentoFilter, atendenteFilter, dataInicio, dataFim, onlyFinalizadasAusencia, tempoParadoFilter, filterScopeKey, filterOptimisticRemovedMinhaFila, isMobileLayout]);

  const refreshEmAtendimentoBadge = useCallback(async () => {
    try {
      const adminPorFuncionario =
        adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
      let params;
      if (adminPorFuncionario) {
        const aid = Number(adminAtendenteFilterId);
        const atendenteIdQuery =
          Number.isFinite(aid) && aid > 0 ? aid : adminAtendenteFilterId;
        params = {
          status_atendimento: "em_atendimento",
          atendente_id: atendenteIdQuery,
          tag_id: tagFilter !== "todas" ? tagFilter : undefined,
          departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          incluir_todos_clientes: undefined,
        };
      } else {
        params = {
          status_atendimento: "em_atendimento",
          tag_id: tagFilter !== "todas" ? tagFilter : undefined,
          departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          incluir_todos_clientes: undefined,
        };
      }
      const data = await fetchChats(params);
      const list = Array.isArray(data) ? data : [];
      const apenasEmAtendimento = list.filter((c) => isConversaEmAtendimentoBadge(c));
      const n = countDistinctConversas(apenasEmAtendimento);
      setEmAtendimentoBadgeCount((prev) => (prev === n ? prev : n));
      persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
        emAtendimentoBadgeCount: n,
      });
    } catch (e) {
      console.error("Erro ao carregar contagem Em atendimento:", e);
    }
  }, [
    adminAtendenteFilterId,
    tagFilter,
    departamentoFilter,
    dataInicio,
    dataFim,
    filterScopeKey,
  ]);

  const refreshAguardandoClienteBadge = useCallback(async () => {
    try {
      const adminPorFuncionario =
        adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
      let params;
      if (adminPorFuncionario) {
        const aid = Number(adminAtendenteFilterId);
        const atendenteIdQuery =
          Number.isFinite(aid) && aid > 0 ? aid : adminAtendenteFilterId;
        params = {
          aguardando_cliente: "1",
          atendente_id: atendenteIdQuery,
          tag_id: tagFilter !== "todas" ? tagFilter : undefined,
          departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          incluir_todos_clientes: undefined,
        };
      } else {
        // Sem "Por funcionário": respeitar escopo padrão da sessão no backend.
        params = {
          aguardando_cliente: "1",
          tag_id: tagFilter !== "todas" ? tagFilter : undefined,
          departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          incluir_todos_clientes: undefined,
        };
      }
      const data = await fetchChats(params);
      const list = Array.isArray(data) ? data : [];
      const apenasAguardando = list.filter((c) => isConversaAguardandoCliente(c));
      const n = countDistinctConversas(apenasAguardando);
      setAguardandoClienteBadgeCount((prev) => (prev === n ? prev : n));
      persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
        aguardandoClienteBadgeCount: n,
      });
    } catch (e) {
      console.error("Erro ao carregar contagem Aguardando cliente:", e);
    }
  }, [
    adminAtendenteFilterId,
    tagFilter,
    departamentoFilter,
    atendenteFilter,
    dataInicio,
    dataFim,
    filterScopeKey,
  ]);

  const refreshPagamentosPendentesBadge = useCallback(async () => {
    if (!isFinanceiroUser) {
      setPagamentosPendentesBadgeCount((prev) => (prev === 0 ? prev : 0));
      return;
    }
    try {
      const params = {
        pagamento_pendente: "1",
        tag_id: tagFilter !== "todas" ? tagFilter : undefined,
        departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        incluir_todos_clientes: undefined,
      };
      const data = await fetchChats(params);
      const list = Array.isArray(data) ? data : [];
      const n = countDistinctConversas(list.filter((c) => isConversaPagamentoPendente(c)));
      setPagamentosPendentesBadgeCount((prev) => (prev === n ? prev : n));
    } catch (e) {
      console.error("Erro ao carregar contagem Pagamentos pendentes:", e);
    }
  }, [isFinanceiroUser, tagFilter, departamentoFilter, dataInicio, dataFim]);

  const refreshEmAtrasoBadge = useCallback(async () => {
    if (!isFinanceiroUser) {
      setEmAtrasoBadgeCount((prev) => (prev === 0 ? prev : 0));
      return;
    }
    try {
      const params = {
        em_atraso: "1",
        tag_id: tagFilter !== "todas" ? tagFilter : undefined,
        departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        incluir_todos_clientes: undefined,
      };
      const data = await fetchChats(params);
      const list = Array.isArray(data) ? data : [];
      const n = countDistinctConversas(list.filter((c) => isConversaEmAtrasoPagamento(c)));
      setEmAtrasoBadgeCount((prev) => (prev === n ? prev : n));
    } catch (e) {
      console.error("Erro ao carregar contagem Em atraso:", e);
    }
  }, [isFinanceiroUser, tagFilter, departamentoFilter, dataInicio, dataFim]);

  const refreshMensagensDisparadasBadge = useCallback(async () => {
    if (!separarMensagensDisparadasLigado) {
      setMensagensDisparadasCount((prev) => (prev === 0 ? prev : 0));
      return;
    }
    try {
      const params = {
        status_atendimento: "mensagem_disparada",
        tag_id: tagFilter !== "todas" ? tagFilter : undefined,
        departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        incluir_todos_clientes: "0",
      };
      const data = await fetchChats(params);
      const list = Array.isArray(data) ? data : [];
      const n = countDistinctConversas(list);
      setMensagensDisparadasCount((prev) => (prev === n ? prev : n));
      persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
        mensagensDisparadasCount: n,
      });
    } catch (e) {
      console.error("Erro ao carregar contagem Mensagens Disparadas:", e);
    }
  }, [tagFilter, departamentoFilter, dataInicio, dataFim, separarMensagensDisparadasLigado, filterScopeKey]);

  const refreshSupervisaoData = useCallback(async () => {
    if (!isSupervisorOrAdmin(user)) {
      setSupervisaoResumo(null);
      setPendentesFuncionarioIds([]);
      return;
    }
    try {
      const [resumoData, pendentesData] = await Promise.all([
        getResumoSupervisao(),
        getClientesPendentesSupervisao(),
      ]);
      setSupervisaoResumo(resumoData || {});
      const ids = (Array.isArray(pendentesData) ? pendentesData : [])
        .map((item) => String(item?.conversa_id ?? item?.conversaId ?? ""))
        .filter(Boolean);
      setPendentesFuncionarioIds(ids);
    } catch {
      setPendentesFuncionarioIds([]);
    }
  }, [user]);

  /** Primeira carga de supervisão vem após GET principal (runSecondaryRefreshes); aqui só o polling periódico. */
  useEffect(() => {
    if (!isSupervisorOrAdmin(user)) return undefined;
    let intervalId;
    const delay = isMobileLayout ? MOBILE_SUPERVISAO_POLL_DELAY_MS : 800;
    const cancelSchedule = scheduleAfterInitialPaint(() => {
      intervalId = window.setInterval(() => {
        void runAuxBadgeFetch(filterScopeKey, "supervisao", () => refreshSupervisaoData());
      }, 30000);
    }, delay);
    return () => {
      cancelSchedule();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [user, refreshSupervisaoData, filterScopeKey, isMobileLayout]);

  async function load(opts = {}) {
    const hasVisibleChatsAtStart = (useChatStore.getState().chats?.length ?? 0) > 0;
    if (loadInFlightRef.current) {
      const foreground = opts.background !== true;
      if (!foreground) {
        loadQueuedRef.current = { background: true };
        return;
      }
      if (!hasVisibleChatsAtStart) {
        setZapFilterSkeleton(true);
      }
    }
    loadInFlightRef.current = true;
    const requestId = ++loadRequestIdRef.current;
    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    loadSecondaryScheduleCancelRef.current?.();
    loadSecondaryScheduleCancelRef.current = null;
    const hasVisibleChats = hasVisibleChatsAtStart;
    const background =
      opts.background === true || (opts.background !== false && hasVisibleChats);
    if (!background) {
      setLoading(true);
      setListRefreshing((prev) => (prev ? false : prev));
    } else {
      setListRefreshing((prev) => (prev ? prev : true));
    }
    try {
      const {
        params,
        searchTerm,
        pageLimit,
        adminPorFuncionario,
        aguardandoQuery,
        aguardandoAtendenteQuery,
      } = buildChatListFetchParams({
        tab,
        statusFilter,
        tagFilter,
        departamentoFilter,
        atendenteFilter,
        dataInicio,
        dataFim,
        debouncedSearch,
        adminAtendenteFilterId,
        onlyFinalizadasAusencia,
        aguardandoClienteOnly,
        pagamentosPendentesOnly,
        emAtrasoOnly,
        tempoParadoFilter,
        conversaIdsPendenciaQuery,
        separarMensagensDisparadasLigado,
        isFinanceiroUser,
        isMobileLayout,
        user,
        pendentesFuncionarioIds: pendentesFuncionarioIdsRef.current,
        isSupervisorOrAdminFn: isSupervisorOrAdmin,
      });
      lastListParamsRef.current = { ...params };

      /** Lista estrita: só o que a API devolveu — o merge com `prev` não pode reintroduzir conversas de outras abas. */
      const strictMensagemDisparadaQuery =
        separarMensagensDisparadasLigado &&
        String(params.status_atendimento || "").toLowerCase() === "mensagem_disparada";

      const minhaFilaTab = !adminPorFuncionario && tab === "minha_fila";
      if (!background) {
        const cachedRows = hydrateChatListRowsForFilterFromSession(filterScopeKey, filterRequestKey);
        if (cachedRows?.length) {
          const cachedList = sortChatRowsByOrder(dedupeChatRowsByStableKey(cachedRows), order);
          if (minhaFilaTab) {
            setMinhaFilaList((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : cachedList));
            setChats((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : cachedList));
          } else {
            setChats((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : cachedList));
          }
        }
      }
      // Após "Carregar mais", resync/background não pode voltar só a 1ª página
      // (isso fazia conversas antigas "sumirem" da lista).
      const pagesLoadedTarget = Math.min(
        CHAT_LIST_PRESERVE_MAX_PAGES,
        Math.max(1, Number(chatListPageRef.current?.pagesLoaded) || 1)
      );
      const data = minhaFilaTab
        ? await fetchMinhaFilaChatsCompleto(params, { signal: abortController.signal })
        : pagesLoadedTarget > 1
          ? await fetchChatsPages(params, {
              signal: abortController.signal,
              pageLimit,
              maxPages: pagesLoadedTarget,
            })
          : await fetchChats(params, { signal: abortController.signal });
      if (requestId !== loadRequestIdRef.current) return;
      let list = Array.isArray(data) ? data : [];
      if (minhaFilaTab || TABS_HIDE_OPTIMISTIC_CLOSED.has(String(tabRef.current || ""))) {
        list = filterOptimisticRemovedMinhaFila(list);
      }
      const pageState = buildChatListPageState(
        data,
        minhaFilaTab ? 1 : pagesLoadedTarget
      );
      setChatListPage(pageState);
      if (pageState.totalCount != null) {
        setActiveListTotalCount(pageState.totalCount);
      }
      if (!adminPorFuncionario && mineOnly && user?.id && !isAppAdmin(user)) {
        list = list.filter((c) => String(c.atendente_id) === String(user.id));
      }
      // Desduplicar por id (conversas) ou por cliente_id (clientes sem conversa) — NÃO descartar itens com id null
      list = sortChatRowsByOrder(dedupeChatRowsByStableKey(list), order);
      if (!adminPorFuncionario && tabRef.current === "minha_fila" && !searchTerm) {
        setMinhaFilaList(list);
      }
      // Merge defensivo: nunca sobrescrever contato_nome/foto_perfil com undefined ou string vazia. Preserva chats locais não retornados pela API.
      setChats((prev) => {
        if (requestId !== loadRequestIdRef.current) return prev;
        const arr = Array.isArray(prev) ? prev : [];
        const byIdPrev = new Map(arr.map((c) => [String(c.id), c]));
        const fromApi = new Set(list.map((c) => String(c?.id)).filter(Boolean));
        const nomeUsuario = (user?.nome ?? user?.name ?? "").trim().toLowerCase();
        const merged = list.map((c) => {
          const existing = c?.id != null ? byIdPrev.get(String(c.id)) : null;
          let nomeApi = (c?.contato_nome ?? c?.nome ?? "").trim();
          const nomeContatoCache = (c?.nome_contato_cache ?? "").trim();
          const nomeCliente = (c?.cliente?.nome ?? c?.clientes?.nome ?? "").trim();
          if (nomeUsuario && nomeApi.toLowerCase() === nomeUsuario) {
            nomeApi = nomeContatoCache || nomeCliente || nomeApi;
          }
          const nomeJaExiste = (existing?.contato_nome || existing?.nome || "").trim();
          const contato_nome = nomeApi || nomeJaExiste || nomeContatoCache || nomeCliente || existing?.contato_nome || c?.contato_nome || c?.nome;
          // Respostas parciais podem voltar com foto_perfil=null. Isso não significa remoção:
          // preservamos a última URL válida e também aceitamos cache/nested/paths relativos.
          const foto_perfil = pickPreferredAvatarUrl(c, existing);
          const mergedRow = mergeChatRowListaAtividade(
            {
              ...c,
              contato_nome,
              foto_perfil,
              nome_grupo: c?.nome_grupo || existing?.nome_grupo,
              foto_grupo: c?.foto_grupo || existing?.foto_grupo,
              cliente: c?.cliente || existing?.cliente,
            },
            existing
          );
          return mergedRow;
        });
        const extra = arr.filter((c) => c?.id != null && !fromApi.has(String(c.id)));
        const strictListTabs = new Set([
          "todas",
          "minha_fila",
          "campanhas",
          "hoje",
          "abertas",
          "em_atendimento",
          "finalizadas",
          "finalizadas_auto",
          "aguardando_cliente",
          "aguardando_atendente",
          "aguardando_funcionario",
          "pagamentos_pendentes",
          "em_atraso",
        ]);
        if (tab === "em_atendimento" && background) {
          return mergeEmAtendimentoBackgroundRows(arr, merged, order, {
            user,
            adminAtendenteFilterId,
            pendentesFuncionarioSet,
          });
        }
        if (strictListTabs.has(tab)) return sortChatListByRecent(merged);
        if (aguardandoQuery || aguardandoAtendenteQuery) return sortChatListByRecent(merged);
        if (tempoParadoFilter) return sortChatListByRecent(merged);
        if (strictMensagemDisparadaQuery) return sortChatListByRecent(merged);
        if (extra.length === 0) return sortChatListByRecent(merged);
        const combined = sortChatListByRecent([...merged, ...extra]);
        return order === "antigas" ? [...combined].reverse() : combined;
      });
      if (requestId === loadRequestIdRef.current) {
        if (!background) markPushEntryReady();
        if (list.length > 0) {
          persistChatListRowsForFilterToSession(filterScopeKey, filterRequestKey, list);
        }
        const storeChats = useChatStore.getState().chats || [];
        persistChatListSidebarToSession(filterScopeKey, storeChats, {
          emAtendimentoBadgeCount,
          aguardandoClienteBadgeCount,
          mensagensDisparadasCount,
        });
      }
      const rid = requestId;
      const minhaFilaAuxPrimed =
        !adminPorFuncionario && tabRef.current === "minha_fila";
      const runSecondaryRefreshes = () => {
        if (rid !== loadRequestIdRef.current) return;
        const scope = filterScopeKey;
        void runAuxBadgeFetch(scope, "chatCounts", () => refreshChatFilterCounts({ silent: true }));
        void runAuxBadgeFetch(scope, "supervisao", () => refreshSupervisaoData());
        void refreshMinhasPendenciasRef.current?.();
      };
      if (minhaFilaAuxPrimed) {
        persistChatListSidebarToSession(filterScopeKey, useChatStore.getState().chats || [], {
          minhaFila: list,
          chatFilterCounts,
        });
      }
      const secondaryRefreshDelay = isMobileLayout
        ? MOBILE_SECONDARY_REFRESH_DELAY_MS
        : tabRef.current === "todas" ? 450 : 120;
      loadSecondaryScheduleCancelRef.current = scheduleAfterInitialPaint(
        runSecondaryRefreshes,
        secondaryRefreshDelay
      );
    } catch (e) {
      if (isAbortError(e)) return;
      if (requestId !== loadRequestIdRef.current) return;
      if (!isNetworkError(e)) {
        console.error("Erro ao carregar conversas:", e);
      }
      if (!(useChatStore.getState().chats?.length > 0)) {
        setChats([]);
      }
      setChatListPage((prev) => ({
        ...prev,
        loading: false,
        error: e?.response?.data?.error || e?.message || "Erro ao carregar conversas.",
      }));
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
        setListRefreshing((prev) => (prev ? false : prev));
        setZapFilterSkeleton(false);
        lastLoadFinishedAtRef.current = Date.now();
        loadInFlightRef.current = false;
        if (loadQueuedRef.current) {
          const queuedOpts = loadQueuedRef.current;
          loadQueuedRef.current = null;
          queueMicrotask(() => loadRef.current?.(queuedOpts));
        }
      }
    }
  }

  useEffect(() => {
    load();
  }, [
    tab,
    debouncedSearch,
    tagFilter,
    departamentoFilter,
    statusFilter,
    atendenteFilter,
    dataInicio,
    dataFim,
    mineOnly,
    order,
    adminAtendenteFilterId,
    onlyFinalizadasAusencia,
    aguardandoClienteOnly,
    pagamentosPendentesOnly,
    emAtrasoOnly,
    tempoParadoFilter,
    conversaIdsPendenciaQuery,
    separarMensagensDisparadasLigado,
    isFinanceiroUser,
    filterScopeKey,
  ]);

  // loadRef para sync/interval — deve estar definido antes dos effects que o usam
  const loadRef = useRef(load);
  loadRef.current = load;

  useChatListResync({
    loadRef,
    loadInFlightRef,
    loadQueuedRef,
    lastLoadFinishedAtRef,
    tabRef,
    refreshChatFilterCounts,
    isMobileLayout,
    filterScopeKey,
    atendimentoModoSimples: user?.atendimento_modo_simples,
  });

  const { handleLoadMoreChats } = useChatListPagination({
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
    filterOptimisticRemovedMinhaFila,
  });

  useEffect(() => {
    return () => {
      loadSecondaryScheduleCancelRef.current?.();
      loadSecondaryScheduleCancelRef.current = null;
    };
  }, []);

  const handleLoteAusenciaSimular = useCallback(async () => {
    setLoteAusenciaMsg("");
    const ids = collectEmAtendimentoIdsFromChats(useChatStore.getState().chats);
    if (!ids.length) {
      setLoteAusenciaMsg("Nenhuma conversa em atendimento na lista atual.");
      return;
    }
    setLoteAusenciaBusy(true);
    try {
      const r = await postFinalizacaoAusenciaLote({ conversa_ids: ids, dry_run: true });
      const res = Array.isArray(r?.resultados) ? r.resultados : [];
      const ok = res.filter((x) => x.ok).length;
      setLoteAusenciaMsg(`Simulação: ${ok} de ${ids.length} conversa(s) elegível(is) ao critério do servidor.`);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Falha na simulação";
      showToast({ type: "error", title: "Lote por ausência", message: String(msg) });
      setLoteAusenciaMsg(String(msg));
    } finally {
      setLoteAusenciaBusy(false);
    }
  }, [showToast]);

  const handleLoteAusenciaExecutar = useCallback(async () => {
    setLoteAusenciaMsg("");
    const ids = collectEmAtendimentoIdsFromChats(useChatStore.getState().chats);
    if (!ids.length) {
      setLoteAusenciaMsg("Nenhuma conversa em atendimento na lista atual.");
      return;
    }
    if (String(loteAusenciaConfirm).trim() !== CONFIRM_LOTE_AUSENCIA) {
      showToast({
        type: "info",
        title: "Confirmação necessária",
        message: `Digite exatamente: ${CONFIRM_LOTE_AUSENCIA}`,
      });
      return;
    }
    setLoteAusenciaBusy(true);
    try {
      const r = await postFinalizacaoAusenciaLote({
        conversa_ids: ids,
        dry_run: false,
        execute: true,
        confirm: CONFIRM_LOTE_AUSENCIA,
      });
      const res = Array.isArray(r?.resultados) ? r.resultados : [];
      const ok = res.filter((x) => x.ok).length;
      setLoteAusenciaMsg(`Concluído: ${ok} conversa(s) processada(s).`);
      setLoteAusenciaConfirm("");
      loadRef.current?.();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Falha na execução";
      showToast({ type: "error", title: "Lote por ausência", message: String(msg) });
      setLoteAusenciaMsg(String(msg));
    } finally {
      setLoteAusenciaBusy(false);
    }
  }, [showToast, loteAusenciaConfirm]);

  /** Supervisão: ao atualizar IDs pendentes, refetch da aba "Aguardando atendente". */
  useEffect(() => {
    if (tabRef.current !== "aguardando_funcionario") return;
    if (!isSupervisorOrAdmin(user)) return;
    loadRef.current?.({ background: true });
  }, [pendentesFuncionarioIds, user]);

  const chatListOptimisticMutationNonce = useChatStore((s) => s.chatListOptimisticMutationNonce);
  useEffect(() => {
    if (!chatListOptimisticMutationNonce) return;
    const mutation = useChatStore.getState().chatListOptimisticMutation;
    if (!mutation?.id) return;
    const id = String(mutation.id);
    const patch = mutation.patch && typeof mutation.patch === "object" ? mutation.patch : null;
    const hideClosedFromActiveList = shouldHideOptimisticClosedFromTab(tabRef.current, mutation);

    if (hideClosedFromActiveList) {
      setChats((prev) => (Array.isArray(prev) ? prev.filter((c) => String(c?.id) !== id) : []));
    } else if (patch) {
      setChats((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) =>
          String(c?.id) === id
            ? {
                ...c,
                ...patch,
                tags: Array.isArray(patch.tags) ? patch.tags : c.tags,
              }
            : c
        )
      );
      const currentMinhaFila = Array.isArray(minhaFilaListRef.current) ? minhaFilaListRef.current : null;
      if (currentMinhaFila?.some((c) => String(c?.id) === id)) {
        setMinhaFilaList(
          currentMinhaFila.map((c) =>
            String(c?.id) === id
              ? {
                  ...c,
                  ...patch,
                  tags: Array.isArray(patch.tags) ? patch.tags : c.tags,
                }
              : c
          )
        );
      }
    }

    if (mutation.removeFromMinhaFila) {
      const current = Array.isArray(minhaFilaListRef.current) ? minhaFilaListRef.current : null;
      const rowForRestore = mutation.row || (patch ? { id, ...patch } : null);
      const existingRemovedEntry = optimisticRemovedMinhaFilaRef.current.get(id);
      const removalReason =
        existingRemovedEntry?.reason === "encerrar_conversa" ? "encerrar_conversa" : mutation.type || null;
      const removalExpiresAt =
        existingRemovedEntry?.reason === "encerrar_conversa" && existingRemovedEntry?.expiresAt != null
          ? existingRemovedEntry.expiresAt
          : Date.now() + OPTIMISTIC_MINHA_FILA_REMOVE_TTL_MS;
      if (rowForRestore) {
        optimisticRemovedMinhaFilaRef.current.set(id, {
          row: rowForRestore,
          reason: removalReason,
          expiresAt: removalExpiresAt,
        });
      }
      if (current) {
        const removed = current.find((c) => String(c?.id) === id);
        const next = current.filter((c) => String(c?.id) !== id);
        if (removed) {
          optimisticRemovedMinhaFilaRef.current.set(id, {
            row: removed,
            reason: removalReason,
            expiresAt: removalExpiresAt,
          });
        }
        if (removed && next.length !== current.length) {
          setMinhaFilaList(next);
          const nextCount = countDistinctConversas(next);
          setMinhaFilaCount((prev) => (prev === nextCount ? prev : nextCount));
        }
      }
    }

    if (mutation.restoreMinhaFila) {
      const removedEntry = optimisticRemovedMinhaFilaRef.current.get(id);
      const isCloseTombstone = removedEntry?.reason === "encerrar_conversa";
      const isAllowedCloseRestore =
        mutation.type === "encerrar_conversa_revert" || mutation.type === "reabrir_conversa";
      if (isCloseTombstone && !isAllowedCloseRestore) {
        return;
      }
      optimisticRemovedMinhaFilaRef.current.delete(id);
      const current = Array.isArray(minhaFilaListRef.current) ? minhaFilaListRef.current : [];
      if (!current.some((c) => String(c?.id) === id)) {
        const restored = mutation.row || getOptimisticRemovedRow(removedEntry);
        if (restored) {
          const next = [restored, ...current];
          setMinhaFilaList(next);
          const nextCount = countDistinctConversas(next);
          setMinhaFilaCount((prev) => (prev === nextCount ? prev : nextCount));
        }
      }
    }
  }, [chatListOptimisticMutationNonce, setChats]);

  const applyFiltersDataToState = useCallback((data) => {
    setAllTags(data?.tags ?? []);
    setAtendentes(data?.atendentes ?? []);
    setDepartamentos(data?.departamentos ?? []);
  }, []);

  /**
   * Departamentos no mount: chips/filtros Financeiro dependem do nome "Financeiro" na lista.
   * Antes só carregava ao abrir o painel de filtros ou após F5 (sessionStorage).
   */
  useEffect(() => {
    if (!filterScopeKey) return undefined;
    financeiroBadgesPrimedRef.current = false;
    const cached = getChatListFiltersDataCache();
    if (Array.isArray(cached?.departamentos) && cached.departamentos.length > 0) {
      setDepartamentos(cached.departamentos);
      return undefined;
    }
    let cancelled = false;
    const run = () => {
      loadChatListFiltersDataOnce({ listarTags, api, scopeKey: filterScopeKey }).then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.departamentos) && data.departamentos.length > 0) {
          setDepartamentos(data.departamentos);
        }
      });
    };
    if (isMobileLayout) {
      const cancel = scheduleAfterInitialPaint(run, MOBILE_FILTERS_BOOT_DELAY_MS);
      return () => {
        cancelled = true;
        cancel();
      };
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [filterScopeKey, isMobileLayout]);

  useEffect(() => {
    if (!filterScopeKey) return undefined;
    if (isMobileLayout && !hasListRows) {
      mobileCountsBootSkippedRef.current = true;
      return undefined;
    }
    if (isMobileLayout && mobileCountsBootSkippedRef.current) {
      mobileCountsBootSkippedRef.current = false;
      return undefined;
    }
    let cancelled = false;
    const delay = isMobileLayout ? MOBILE_COUNTS_DELAY_MS : 0;
    const run = () => {
      if (!cancelled) void refreshChatFilterCounts();
    };
    if (delay > 0) {
      const cancel = scheduleAfterInitialPaint(run, delay);
      return () => {
        cancelled = true;
        cancel();
      };
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    filterScopeKey,
    tagFilter,
    departamentoFilter,
    dataInicio,
    dataFim,
    debouncedSearch,
    adminAtendenteFilterId,
    refreshChatFilterCounts,
    isMobileLayout,
    hasListRows,
  ]);

  /** Tags/atendentes/setores: sob demanda ao abrir painel; fetch imediato se cache incompleto. */
  useEffect(() => {
    if (!showFilters) return undefined;
    const cached = getChatListFiltersDataCache();
    if (cached.tags != null) setAllTags(cached.tags);
    if (cached.atendentes != null) setAtendentes(cached.atendentes);
    if (cached.departamentos != null) setDepartamentos(cached.departamentos);
    if (cached.tags != null && cached.atendentes != null && cached.departamentos != null) {
      setFiltersAuxLoading(false);
      return undefined;
    }
    let cancelled = false;
    setFiltersAuxLoading(true);
    loadChatListFiltersDataOnce({ listarTags, api, scopeKey: filterScopeKey })
      .then((data) => {
        if (cancelled) return;
        applyFiltersDataToState(data);
      })
      .finally(() => {
        if (!cancelled) setFiltersAuxLoading(false);
      });
    return () => {
      cancelled = true;
      setFiltersAuxLoading(false);
    };
  }, [showFilters, filterScopeKey, applyFiltersDataToState]);

  /** Pré-aquece tags/atendentes em idle (departamentos já no mount para chips Financeiro). */
  useEffect(() => {
    if (listLoading && !hasListRows) return undefined;
    const cached = getChatListFiltersDataCache();
    if (cached.tags != null && cached.atendentes != null && cached.departamentos != null) {
      return undefined;
    }
    let cancelled = false;
    const delay = isMobileLayout
      ? MOBILE_FILTERS_PREWARM_DELAY_MS
      : hasListRows ? 400 : 900;
    const cancel = scheduleAfterInitialPaint(() => {
      loadChatListFiltersDataOnce({ listarTags, api, scopeKey: filterScopeKey }).then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.departamentos) && data.departamentos.length > 0) {
          setDepartamentos((prev) => (prev.length > 0 ? prev : data.departamentos));
        }
      });
    }, delay);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [listLoading, hasListRows, filterScopeKey, isMobileLayout]);

  /** Admin “Por funcionário”: só /usuarios, ao abrir o painel (não no mount). */
  useEffect(() => {
    if (!adminAtendentePanelOpen || !isAppAdmin(user)) return undefined;
    const cached = getChatListFiltersDataCache();
    if (cached.atendentes != null) {
      if (atendentes.length === 0) setAtendentes(cached.atendentes);
      return undefined;
    }
    let cancelled = false;
    loadChatListAtendentesOnce(api, filterScopeKey).then((list) => {
      if (!cancelled) setAtendentes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [adminAtendentePanelOpen, user, atendentes.length, filterScopeKey]);

  // atalhos
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key.toLowerCase();

      if (e.ctrlKey && k === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.ctrlKey && k === "f") {
        e.preventDefault();
        setShowFilters((v) => !v);
      }

      if (k === "escape") {
        if (novoContatoModalOpen) {
          setNovoContatoModalOpen(false);
          return;
        }
        if (adminAtendentePanelOpen) {
          setAdminAtendentePanelOpen(false);
          return;
        }
        if (showNovoMenu) {
          setShowNovoMenu(false);
          return;
        }
        /* Com conversa aberta, ESC sai da conversa (ConversaView) — não reseta filtros da lista. */
        if (useConversaStore.getState().selectedId != null) return;
        // ESC: fecha filtros e limpa busca
        clearAdminAtendenteFilter();
        resetFiltersToDefault();
        setLoteAusenciaMsg("");
        setLoteAusenciaConfirm("");
        setShowNovoMenu(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    novoContatoModalOpen,
    adminAtendentePanelOpen,
    setAdminAtendentePanelOpen,
    clearAdminAtendenteFilter,
    resetFiltersToDefault,
    showNovoMenu,
    user?.atendimento_modo_simples,
  ]);

  // posiciona menu abaixo do botão Novo
  useEffect(() => {
    if (!showNovoMenu || !novoBtnRef.current) return;
    const updatePosition = () => {
      const btn = novoBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = Math.min(240, Math.max(160, window.innerWidth - 16));
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        Math.max(8, window.innerWidth - menuWidth - 8)
      );
      const top = Math.min(
        Math.max(8, rect.bottom + 6),
        Math.max(8, window.innerHeight - 168)
      );
      setMenuPosition({ top, left, width: menuWidth });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showNovoMenu]);

  // fecha menu "Novo" ao clicar fora
  useEffect(() => {
    if (!showNovoMenu) return;

    function onPointerDown(e) {
      const btn = novoBtnRef.current;
      const menu = novoMenuRef.current;
      const target = e.target;
      if (!target) return;

      if (btn && btn.contains(target)) return;
      if (menu && menu.contains(target)) return;

      setShowNovoMenu(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showNovoMenu]);

  const emitNovoAction = useCallback(
    (type) => {
      setShowNovoMenu(false);

      if (type === "novo_contato") {
        setNovoContatoModalOpen(true);
        return;
      }

      const routes = {
        novo_grupo: "/atendimento/novo-grupo",
        nova_comunidade: "/atendimento/nova-comunidade",
      };

      const path = routes[type];
      if (path) navigate(path);
    },
    [navigate]
  );

  const handleToggleNovoMenu = useCallback((e) => {
    e.stopPropagation();
    setShowNovoMenu((v) => !v);
  }, []);

  const handleOpenProdutos = useCallback(() => {
    setShowProdutosPanel(true);
  }, []);

  const handleNovoContatoMenu = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      emitNovoAction("novo_contato");
    },
    [emitNovoAction]
  );

  const handleNovoGrupoMenu = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      emitNovoAction("novo_grupo");
    },
    [emitNovoAction]
  );

  const handleNovaComunidadeMenu = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      emitNovoAction("nova_comunidade");
    },
    [emitNovoAction]
  );

  const handleSelecionarConversa = useCallback((chatId) => {
    if (chatId == null || chatId === undefined || chatId === "") return;
    const st = useConversaStore.getState();
    if (
      String(st.selectedId ?? "") === String(chatId) &&
      st.conversa?.id != null &&
      String(st.conversa.id) === String(chatId) &&
      !st.loading &&
      !st.loadError
    ) {
      return;
    }
    if (isMobileLayout) {
      scrollSaveRef.current = scrollRef.current?.scrollTop ?? 0;
    }
    carregarConversa(chatId);
  }, [carregarConversa, isMobileLayout]);

  const handleOpenClienteSemConversa = useCallback(async (cliente_id, whatsapp_instance_id) => {
    if (!cliente_id) return;
    try {
      const { conversa } = await abrirConversaCliente(cliente_id, whatsapp_instance_id);
      if (conversa?.id) {
        addChat(conversa);
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
          scrollSaveRef.current = 0;
          if (scrollRef.current) scrollRef.current.scrollTop = 0;
        }
        carregarConversa(conversa.id);
      }
    } catch (e) {
      console.error("Erro ao abrir conversa do cliente:", e);
    }
  }, [addChat, carregarConversa]);

  const onRequestConfirmClear = useCallback((payload) => {
    setConfirmClear(payload);
  }, []);

  const onRequestConfirmDelete = useCallback((payload) => {
    setConfirmDelete(payload);
  }, []);

  const onReloadList = useCallback(() => {
    loadRef.current?.({ background: true });
  }, []);

  const runConfirmedClear = useCallback(async () => {
    if (!confirmClear?.chatId) return;
    const { chatId, isOpenConversation } = confirmClear;
    setConfirmClear(null);
    try {
      await clearConversation(chatId);
      useChatStore.getState().updateChat({
        id: chatId,
        ultima_mensagem: null,
        ultima_mensagem_preview: null,
        unread_count: 0,
        tem_novas_mensagens: false,
        tem_novas_mensagens_em_atendimento: false,
      });
      if (isOpenConversation) {
        useConversaStore.setState({ mensagens: [] });
      }
      showToast({
        type: "success",
        title: "Conversa limpa",
        message: "As mensagens foram removidas com sucesso.",
      });
      loadRef.current?.();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "Não foi possível limpar a conversa.";
      showToast({ type: "error", title: "Falha ao limpar", message: msg });
      loadRef.current?.();
    }
  }, [confirmClear, showToast]);

  const runConfirmedDelete = useCallback(async () => {
    if (!confirmDelete?.chatId) return;
    const { chatId, isOpenConversation } = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteConversation(chatId);
      useChatStore.getState().removeChat(chatId);
      if (isOpenConversation) {
        useConversaStore.setState({
          selectedId: null,
          conversa: null,
          mensagens: [],
          tags: [],
        });
      }
      showToast({
        type: "success",
        title: "Conversa apagada",
        message: "A conversa foi removida da lista.",
      });
      loadRef.current?.();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "Não foi possível apagar a conversa.";
      showToast({ type: "error", title: "Falha ao apagar", message: msg });
      loadRef.current?.();
    }
  }, [confirmDelete, showToast]);

  const adminPorFuncionarioAtivo =
    adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";

  const showSetorFilter = isAppAdmin(user);
  const showAusenciaLote = isSupervisorOrAdmin(user);

  const handleClearAdminAtendenteFilter = useCallback(() => {
    clearChatSearch();
    clearAdminAtendenteFilter();
  }, [clearAdminAtendenteFilter, clearChatSearch]);

  const advancedFiltersSlot = useMemo(
    () => (
      <ChatListAdvancedFiltersPanel
        open={showFilters}
        filtersAuxLoading={filtersAuxLoading}
        separarMensagensDisparadasLigado={separarMensagensDisparadasLigado}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        tagFilter={tagFilter}
        onTagFilterChange={handleTagFilterChange}
        allTags={allTags}
        showSetorFilter={showSetorFilter}
        departamentoFilter={departamentoFilter}
        onDepartamentoFilterChange={handleDepartamentoFilterChange}
        departamentos={departamentos}
        atendenteFilter={atendenteFilter}
        onAtendenteFilterChange={handleAtendenteFilterChange}
        atendentes={atendentes}
        dataInicio={dataInicio}
        onDataInicioChange={handleDataInicioChange}
        dataFim={dataFim}
        onDataFimChange={handleDataFimChange}
        mineOnly={mineOnly}
        onMineOnlyChange={handleMineOnlyChange}
        onlyFinalizadasAusencia={onlyFinalizadasAusencia}
        onOnlyFinalizadasAusenciaChange={handleOnlyFinalizadasAusenciaChange}
        aguardandoClienteOnly={aguardandoClienteOnly}
        onAguardandoClienteOnlyChange={handleAguardandoClienteOnlyChange}
        showFinanceiroFilters={isFinanceiroUser}
        pagamentosPendentesOnly={pagamentosPendentesOnly}
        onPagamentosPendentesOnlyChange={handlePagamentosPendentesOnlyChange}
        emAtrasoOnly={emAtrasoOnly}
        onEmAtrasoOnlyChange={handleEmAtrasoOnlyChange}
        order={order}
        onOrderChange={handleOrderChange}
        tempoParadoFilter={tempoParadoFilter}
        onTempoParadoFilterChange={handleTempoParadoFilterChange}
        showAusenciaLote={showAusenciaLote}
        loteAusenciaBusy={loteAusenciaBusy}
        loteAusenciaMsg={loteAusenciaMsg}
        loteAusenciaConfirm={loteAusenciaConfirm}
        onLoteAusenciaConfirmChange={setLoteAusenciaConfirm}
        loteAusenciaConfirmPhrase={CONFIRM_LOTE_AUSENCIA}
        onLoteAusenciaSimular={handleLoteAusenciaSimular}
        onLoteAusenciaExecutar={handleLoteAusenciaExecutar}
      />
    ),
    [
      showFilters,
      filtersAuxLoading,
      separarMensagensDisparadasLigado,
      statusFilter,
      handleStatusFilterChange,
      tagFilter,
      handleTagFilterChange,
      allTags,
      showSetorFilter,
      departamentoFilter,
      handleDepartamentoFilterChange,
      departamentos,
      atendenteFilter,
      handleAtendenteFilterChange,
      atendentes,
      dataInicio,
      handleDataInicioChange,
      dataFim,
      handleDataFimChange,
      mineOnly,
      handleMineOnlyChange,
      onlyFinalizadasAusencia,
      handleOnlyFinalizadasAusenciaChange,
      aguardandoClienteOnly,
      handleAguardandoClienteOnlyChange,
      isFinanceiroUser,
      pagamentosPendentesOnly,
      handlePagamentosPendentesOnlyChange,
      emAtrasoOnly,
      handleEmAtrasoOnlyChange,
      order,
      handleOrderChange,
      tempoParadoFilter,
      handleTempoParadoFilterChange,
      showAusenciaLote,
      loteAusenciaBusy,
      loteAusenciaMsg,
      loteAusenciaConfirm,
      handleLoteAusenciaSimular,
      handleLoteAusenciaExecutar,
    ]
  );

  const toolbarMetaLeftSlot = useMemo(
    () => (
      <MinhasPendenciasCard
        minhasPendencias={minhasPendencias}
        pendenciaAtiva={pendenciaAtiva}
        loadingPendencias={loadingPendencias}
        loadingPendenciaCategoria={loadingPendenciaCategoria}
        onPendenciaClick={handlePendenciaClick}
      />
    ),
    [
      minhasPendencias,
      pendenciaAtiva,
      loadingPendencias,
      loadingPendenciaCategoria,
      handlePendenciaClick,
    ]
  );

  return (
    <div className="chat-list-root">
      {zapiStatusLoaded && zapiConnected === false && (
        <div className="chat-list-zapi-alert" role="alert">
          <span className="chat-list-zapi-alert__icon" aria-hidden>⚠️</span>
          <span>
            WhatsApp desconectado — mensagens não serão entregues.{" "}
            <button
              type="button"
              className="chat-list-zapi-alert__link"
              onClick={() => navigate("/configuracoes")}
            >
              Reconectar
            </button>
          </span>
        </div>
      )}
      <ChatListHeaderBar
        novoBtnRef={novoBtnRef}
        showNovoMenu={showNovoMenu}
        menuPosition={menuPosition}
        novoMenuRef={novoMenuRef}
        onToggleNovoMenu={handleToggleNovoMenu}
        onToggleFilters={handleToggleFilters}
        onNovoContato={handleNovoContatoMenu}
        onNovoGrupo={handleNovoGrupoMenu}
        onNovaComunidade={handleNovaComunidadeMenu}
        canConsultarProdutos={canConsultarProdutos}
        onOpenProdutos={handleOpenProdutos}
      />

      <ChatListBody
        scrollRef={scrollRef}
        scrollSaveRef={scrollSaveRef}
        scrollTopNoncePrevRef={scrollTopNoncePrevRef}
        searchRef={searchRef}
        searchClearNonce={searchClearNonce}
        searchInput={searchInput}
        onSearchInputChange={handleSearchInputChange}
        onSearchDebounced={handleSearchDebounced}
        onClearSearch={clearChatSearch}
        isMobileLayout={isMobileLayout}
        rowCurrentUserId={rowCurrentUserId}
        user={user}
        separarMensagensDisparadasLigado={separarMensagensDisparadasLigado}
        debouncedSearch={debouncedSearch}
        statusFilter={statusFilter}
        tagFilter={tagFilter}
        departamentoFilter={departamentoFilter}
        atendenteFilter={atendenteFilter}
        mineOnly={mineOnly}
        order={order}
        tab={tab}
        minhaFilaList={minhaFilaList}
        chatFilterCounts={chatFilterCounts}
        activeListTotalCount={activeListTotalCount}
        adminAtendenteFilterId={adminAtendenteFilterId}
        onlyFinalizadasAusencia={onlyFinalizadasAusencia}
        aguardandoClienteOnly={aguardandoClienteOnly}
        pagamentosPendentesOnly={pagamentosPendentesOnly}
        emAtrasoOnly={emAtrasoOnly}
        isFinanceiroUser={isFinanceiroUser}
        pendentesFuncionarioSet={pendentesFuncionarioSet}
        minhaFilaCount={minhaFilaCount}
        emAtendimentoBadgeCount={emAtendimentoBadgeCount}
        aguardandoClienteBadgeCount={aguardandoClienteBadgeCount}
        pagamentosPendentesBadgeCount={pagamentosPendentesBadgeCount}
        emAtrasoBadgeCount={emAtrasoBadgeCount}
        mensagensDisparadasCount={mensagensDisparadasCount}
        supervisaoResumo={supervisaoResumo}
        pendentesFuncionarioIds={pendentesFuncionarioIds}
        zapFilterSkeleton={zapFilterSkeleton}
        setZapFilterSkeleton={setZapFilterSkeleton}
        adminPorFuncionarioAtivo={adminPorFuncionarioAtivo}
        atendentes={atendentes}
        adminAtendentePanelOpen={adminAtendentePanelOpen}
        setAdminAtendentePanelOpen={setAdminAtendentePanelOpen}
        setAdminAtendenteFilterId={setAdminAtendenteFilterId}
        clearAdminAtendenteFilter={handleClearAdminAtendenteFilter}
        setShowNovoMenu={setShowNovoMenu}
        setShowFilters={setShowFilters}
        setTab={setTab}
        onClearPendenciaAtiva={clearPendenciaAtiva}
        setNovoContatoModalOpen={setNovoContatoModalOpen}
        onSelect={handleSelecionarConversa}
        onOpenClienteSemConversa={handleOpenClienteSemConversa}
        onRequestConfirmClear={onRequestConfirmClear}
        onRequestConfirmDelete={onRequestConfirmDelete}
        onReloadList={onReloadList}
        canLoadMoreChats={chatListPage.hasMore}
        loadingMoreChats={chatListPage.loading}
        loadMoreChatsError={chatListPage.error}
        onLoadMoreChats={handleLoadMoreChats}
        listRefreshing={listRefreshing}
        middleSlot={toolbarMetaLeftSlot}
        filtersPanelSlot={advancedFiltersSlot}
        conversaIdsPendenciaAtiva={conversaIdsPendenciaAtiva}
        hasActivePendencia={!!pendenciaAtiva}
        onSuporteClick={handleSuporteZapERPClick}
      />

      <ConfirmDialog
        open={confirmClear != null}
        title="Limpar esta conversa?"
        confirmLabel="Limpar mensagens"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => {
          void runConfirmedClear();
        }}
      >
        <p style={{ margin: 0 }}>
          Todas as mensagens serão removidas. A conversa permanece na lista.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete != null}
        title="Apagar conversa permanentemente?"
        confirmLabel="Apagar"
        cancelLabel="Cancelar"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          void runConfirmedDelete();
        }}
      >
        <p style={{ margin: 0 }}>
          Esta ação não pode ser desfeita. O histórico e dados vinculados podem ser removidos conforme as regras do sistema.
        </p>
      </ConfirmDialog>

      {showProdutosPanel && canConsultarProdutos ? (
        <Suspense fallback={null}>
          <ProdutoConsultaPanel
            open
            onClose={() => setShowProdutosPanel(false)}
            canViewSyncStatus={canVerSyncProdutos}
            canTriggerManualSync={canSincronizarProdutos}
            showToast={showToast}
            onEnviarParaConversa={(template) => queueComposerAppend(template)}
          />
        </Suspense>
      ) : null}

      <NovoContatoModal
        open={novoContatoModalOpen}
        onClose={() => setNovoContatoModalOpen(false)}
        onSuccess={(conversa, extra) => {
          if (conversa?.id) {
            addChat(conversa);
            load();
            carregarConversa(conversa.id);
            setUnread(conversa.id, 0);
            showToast({
              type: "success",
              title: "Contato pronto",
              message: "Conversa iniciada. Você já pode enviar mensagens.",
            });
            return;
          }
          if (extra?.cliente?.id != null) {
            load();
            showToast({
              type: "success",
              title: "Cliente cadastrado",
              message: "O contato foi salvo. Abra a conversa depois pelo telefone ou pela lista de clientes.",
            });
          }
        }}
      />
    </div>
  );
}
