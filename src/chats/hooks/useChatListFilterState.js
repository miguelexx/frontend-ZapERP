import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../auth/authStore";
import { isSupervisorOrAdmin } from "../../auth/permissions";
import { getDefaultChatListTab } from "../chatListFilters";

/**
 * Estado serializável dos filtros da lista (abas, busca, avançados).
 *
 * Não substitui `useChatListFilters` em `useChatListFilters.js`: aquele hook
 * continua sendo o compute in-memory usado pelo ChatListBody.
 * Significado de cada filtro permanece o do ChatList original.
 */
export function useChatListFilterState({
  user,
  separarMensagensDisparadasLigado,
  isFinanceiroUser,
  adminAtendenteFilterId,
  conversaIdsPendenciaQuery,
  filterScopeKey,
}) {
  // O termo imediato filtra as linhas já carregadas; o debounced limita chamadas à API.
  // Assim a lista nunca exibe resultados sabidamente errados durante os 350 ms de espera.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchClearNonce, setSearchClearNonce] = useState(0);

  const handleSearchDebounced = useCallback((t) => {
    setDebouncedSearch(t);
  }, []);
  const handleSearchInputChange = useCallback((t) => {
    setSearchInput(t);
  }, []);
  const clearChatSearch = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setSearchClearNonce((n) => n + 1);
  }, []);

  const [statusFilter, setStatusFilter] = useState("todos");
  const [tagFilter, setTagFilter] = useState("todas");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [atendenteFilter, setAtendenteFilter] = useState("todos");
  const [departamentoFilter, setDepartamentoFilter] = useState("todos");
  const [mineOnly, setMineOnly] = useState(false);
  const [order, setOrder] = useState("recentes");
  const [showFilters, setShowFilters] = useState(false);
  /** Filtro avançado: conversas fechadas com finalização por ausência (reforça query GET /chats). */
  const [onlyFinalizadasAusencia, setOnlyFinalizadasAusencia] = useState(false);
  /** Filtro avançado: conversas em atendimento com humano aguardando resposta do cliente. */
  const [aguardandoClienteOnly, setAguardandoClienteOnly] = useState(false);
  /** Financeiro: filtros avançados de cobrança (somente setor Financeiro). */
  const [pagamentosPendentesOnly, setPagamentosPendentesOnly] = useState(false);
  const [emAtrasoOnly, setEmAtrasoOnly] = useState(false);
  /** GET /chats?tempo_parado= — conversas com aguardando_cliente_desde acima do limite (backend). */
  const [tempoParadoFilter, setTempoParadoFilter] = useState("");

  // tabs estilo WhatsApp (chip row)
  // todas | hoje | abertas | minha_fila | campanhas | em_atendimento | finalizadas | ...
  const [tab, setTab] = useState(() => getDefaultChatListTab(useAuthStore.getState().user));
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (tab === "nao_lidas") setTab("todas");
  }, [tab]);

  useEffect(() => {
    if (!isSupervisorOrAdmin(user) && tab === "aguardando_funcionario") {
      setTab(getDefaultChatListTab(user));
    }
  }, [user, tab]);

  useEffect(() => {
    if (user?.atendimento_modo_simples && tab === "minha_fila") {
      setTab("aguardando_atendente");
      return;
    }
    if (!user?.atendimento_modo_simples && tab === "aguardando_atendente") {
      setTab("minha_fila");
      return;
    }
    if (
      user?.atendimento_modo_simples &&
      tab !== "todas" &&
      tab !== "aguardando_atendente" &&
      tab !== "aguardando_cliente" &&
      tab !== "campanhas"
    ) {
      setTab(getDefaultChatListTab(user));
    }
  }, [user?.atendimento_modo_simples, tab]);

  useEffect(() => {
    if (!separarMensagensDisparadasLigado && tab === "mensagens_disparadas") {
      setTab(getDefaultChatListTab(user));
    }
  }, [separarMensagensDisparadasLigado, tab, user?.atendimento_modo_simples]);

  useEffect(() => {
    if (user?.modulo_campanhas_ativo !== true && tab === "campanhas") {
      setTab(getDefaultChatListTab(user));
    }
  }, [user?.modulo_campanhas_ativo, tab, user]);

  useEffect(() => {
    if (!isFinanceiroUser && (tab === "pagamentos_pendentes" || tab === "em_atraso")) {
      setTab(getDefaultChatListTab(user));
    }
  }, [isFinanceiroUser, tab, user?.atendimento_modo_simples]);

  useEffect(() => {
    if (!separarMensagensDisparadasLigado && statusFilter === "mensagem_disparada") {
      setStatusFilter("todos");
    }
  }, [separarMensagensDisparadasLigado, statusFilter]);

  const filterRequestKey = [
    tab,
    debouncedSearch,
    tagFilter,
    departamentoFilter,
    statusFilter,
    atendenteFilter,
    dataInicio,
    dataFim,
    mineOnly ? "mine" : "all",
    order,
    adminAtendenteFilterId ?? "",
    onlyFinalizadasAusencia ? "auto" : "",
    aguardandoClienteOnly ? "aguardando" : "",
    pagamentosPendentesOnly ? "pag-pendente" : "",
    emAtrasoOnly ? "em-atraso" : "",
    tempoParadoFilter,
    conversaIdsPendenciaQuery ?? "",
    separarMensagensDisparadasLigado ? "sep-disparadas" : "",
    filterScopeKey,
  ].join("|");
  const filterRequestBaseKey = [
    tab,
    tagFilter,
    departamentoFilter,
    statusFilter,
    atendenteFilter,
    dataInicio,
    dataFim,
    mineOnly ? "mine" : "all",
    order,
    adminAtendenteFilterId ?? "",
    onlyFinalizadasAusencia ? "auto" : "",
    aguardandoClienteOnly ? "aguardando" : "",
    pagamentosPendentesOnly ? "pag-pendente" : "",
    emAtrasoOnly ? "em-atraso" : "",
    tempoParadoFilter,
    conversaIdsPendenciaQuery ?? "",
    separarMensagensDisparadasLigado ? "sep-disparadas" : "",
    filterScopeKey,
  ].join("|");

  const handleStatusFilterChange = useCallback((value) => {
    clearChatSearch();
    setStatusFilter(value);
  }, [clearChatSearch]);

  const handleTagFilterChange = useCallback((value) => {
    clearChatSearch();
    setTagFilter(value);
  }, [clearChatSearch]);

  const handleDepartamentoFilterChange = useCallback((value) => {
    clearChatSearch();
    setDepartamentoFilter(value);
  }, [clearChatSearch]);

  const handleAtendenteFilterChange = useCallback((value) => {
    clearChatSearch();
    setAtendenteFilter(value);
  }, [clearChatSearch]);

  const handleDataInicioChange = useCallback((value) => {
    clearChatSearch();
    setDataInicio(value);
  }, [clearChatSearch]);

  const handleDataFimChange = useCallback((value) => {
    clearChatSearch();
    setDataFim(value);
  }, [clearChatSearch]);

  const handleMineOnlyChange = useCallback((on) => {
    clearChatSearch();
    setMineOnly(on);
  }, [clearChatSearch]);

  const handleOnlyFinalizadasAusenciaChange = useCallback((on) => {
    clearChatSearch();
    setOnlyFinalizadasAusencia(on);
    if (on) setStatusFilter("fechada");
  }, [clearChatSearch]);

  const handleAguardandoClienteOnlyChange = useCallback((on) => {
    clearChatSearch();
    setAguardandoClienteOnly(on);
  }, [clearChatSearch]);

  const handlePagamentosPendentesOnlyChange = useCallback((on) => {
    clearChatSearch();
    setPagamentosPendentesOnly(on);
  }, [clearChatSearch]);

  const handleEmAtrasoOnlyChange = useCallback((on) => {
    clearChatSearch();
    setEmAtrasoOnly(on);
  }, [clearChatSearch]);

  const handleOrderChange = useCallback((value) => {
    clearChatSearch();
    setOrder(value);
  }, [clearChatSearch]);

  const handleTempoParadoFilterChange = useCallback((value) => {
    clearChatSearch();
    setTempoParadoFilter(value);
  }, [clearChatSearch]);

  const handleToggleFilters = useCallback(() => {
    setShowFilters((v) => !v);
  }, []);

  const resetFiltersToDefault = useCallback(() => {
    clearChatSearch();
    setStatusFilter("todos");
    setTagFilter("todas");
    setDepartamentoFilter("todos");
    setMineOnly(false);
    setOrder("recentes");
    setTab(getDefaultChatListTab(user));
    setTempoParadoFilter("");
    setShowFilters(false);
  }, [clearChatSearch, user]);

  const serializableFilters = useMemo(
    () => ({
      searchInput,
      debouncedSearch,
      statusFilter,
      tagFilter,
      dataInicio,
      dataFim,
      atendenteFilter,
      departamentoFilter,
      mineOnly,
      order,
      tab,
      onlyFinalizadasAusencia,
      aguardandoClienteOnly,
      pagamentosPendentesOnly,
      emAtrasoOnly,
      tempoParadoFilter,
    }),
    [
      searchInput,
      debouncedSearch,
      statusFilter,
      tagFilter,
      dataInicio,
      dataFim,
      atendenteFilter,
      departamentoFilter,
      mineOnly,
      order,
      tab,
      onlyFinalizadasAusencia,
      aguardandoClienteOnly,
      pagamentosPendentesOnly,
      emAtrasoOnly,
      tempoParadoFilter,
    ]
  );

  return {
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
    serializableFilters,
  };
}
