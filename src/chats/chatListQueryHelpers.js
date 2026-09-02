import { isSupervisorOrAdmin } from "../auth/permissions";
import {
  getStatusAtendimentoEffective,
  isClosedAttendance,
  isGroupConversation,
  isModoSimplesAguardandoAtendente,
  isModoSimplesAguardandoCliente,
} from "../utils/conversaUtils";
import {
  isConversaAguardandoCliente,
  isConversaAguardandoFuncionario,
  isConversaEmAtendimentoBadge,
  isConversaEmAtrasoPagamento,
  isConversaPagamentoPendente,
  getChatListSortTimestampMs,
  mergeChatRowListaAtividade,
} from "./chatListRowAtendimento";
import { chatRowStableKey } from "./chatRowStableKey";
import { getChatsPageMeta } from "./chatService";
import { viewerCanSeeConversationRow } from "../conversa/utils/conversaAccessHelpers";

/** Admin UI (filtro lateral por funcionário): aceita role/perfil legado. */
export function isAppAdmin(user) {
  return isSupervisorOrAdmin(user);
}

export function countDistinctConversas(list) {
  const arr = Array.isArray(list) ? list : [];
  const byKey = new Set();
  arr.forEach((c) => {
    const key = chatRowStableKey(c);
    if (key) byKey.add(String(key));
  });
  return byKey.size;
}

export const CHAT_LIST_DESKTOP_PAGE_LIMIT = 80;
export const CHAT_LIST_MOBILE_PAGE_LIMIT = 40;

export function getChatListPageLimit(isMobileLayout) {
  return isMobileLayout ? CHAT_LIST_MOBILE_PAGE_LIMIT : CHAT_LIST_DESKTOP_PAGE_LIMIT;
}

export const TABS_HIDE_OPTIMISTIC_CLOSED = new Set([
  "minha_fila",
  "abertas",
  "em_atendimento",
  "aguardando_cliente",
  "aguardando_atendente",
  "aguardando_funcionario",
  "pagamentos_pendentes",
  "em_atraso",
]);

/** Abas de fila/abertas: conversa fechada nunca pode permanecer visível (nem via cache/socket). */
export const TABS_THAT_EXCLUDE_CLOSED = new Set([
  ...TABS_HIDE_OPTIMISTIC_CLOSED,
  "campanhas",
  "mensagens_disparadas",
]);

export function isClosedAttendancePatch(patch) {
  const status = String(
    patch?.status_atendimento_real ?? patch?.status_atendimento ?? ""
  ).toLowerCase();
  return status === "fechada" || status === "encerrada" || status === "finalizada" || status === "finalizado";
}

export function shouldHideOptimisticClosedFromTab(tab, mutation, view = {}) {
  if (getAdminAtendenteFilterScope(view)) return false;
  if (mutation?.type === "encerrar_conversa_revert") return false;
  const patch = mutation?.patch ?? mutation;
  if (!isClosedAttendancePatch(patch)) return false;
  return TABS_HIDE_OPTIMISTIC_CLOSED.has(String(tab || ""));
}

/**
 * Após assumir (envio ou botão), a row sai das abas de fila que não são o recorte novo.
 * "Todas/Hoje" e busca global mantêm o card — só muda o badge.
 * Filtro admin por funcionário / setor da lista visível vale em qualquer aba.
 */
export function shouldDropChatFromActiveList(row, view = {}) {
  if (!row) return false;
  if (!rowMatchesPublishedListFilters(row, view)) return true;
  if (view.searchActive === true) return false;
  if (getAdminAtendenteFilterScope(view)) return false;
  const tab = String(view.tab || "");
  if (!tab || tab === "todas" || tab === "hoje") return false;
  return !rowStillBelongsToActiveTab(row, tab, view);
}

/**
 * Remove da lista visível: outro setor (atendente) OU aba que não comporta o status.
 * Admin nunca cai no recorte de setor.
 */
export function shouldRemoveChatFromViewerList(row, view = {}) {
  if (!row) return false;
  if (!viewerCanSeeConversationRow(row, view.user)) return true;
  return shouldDropChatFromActiveList(row, view);
}

/** Visão única da lista visível — store + user. Socket e ChatList consomem o mesmo objeto. */
export function buildActiveChatListViewFromStore(store, user) {
  const ids = store?.chatListPendentesFuncionarioIds || [];
  return {
    tab: store?.chatListActiveTab,
    searchActive: store?.chatListSearchActive === true,
    searchDebounced: store?.chatListSearchDebounced === true,
    user: user ?? null,
    hiddenClosed: store?.chatListHiddenClosed || {},
    adminAtendenteFilterId: store?.chatListAdminAtendenteFilterId ?? null,
    pendentesFuncionarioSet: new Set((Array.isArray(ids) ? ids : []).map((x) => String(x))),
    departamentoFilter: store?.chatListDepartamentoFilter || "todos",
    onlyFinalizadasAusencia: store?.chatListOnlyFinalizadasAusencia === true,
    aguardandoClienteOnly: store?.chatListAguardandoClienteOnly === true,
  };
}

/** Funcionário substitui a aba; preserva os refinamentos já enviados pelo GET. */
export function getAdminAtendenteFilterScope(view = {}) {
  const raw = view.adminAtendenteFilterId;
  if (raw == null || String(raw).trim() === "") return null;
  const id = Number(raw);
  return {
    atendenteId: Number.isFinite(id) && id > 0 ? id : raw,
    finalAutoQuery: !view.searchActive && (view.tab === "finalizadas_auto" || view.onlyFinalizadasAusencia === true),
    aguardandoQuery: !view.searchActive && (view.tab === "aguardando_cliente" || view.aguardandoClienteOnly === true),
  };
}

function rowMatchesAdminAtendenteFilter(row, adminAtendenteFilterId) {
  if (adminAtendenteFilterId == null || String(adminAtendenteFilterId).trim() === "") return true;
  if (!row || isGroupConversation(row)) return false;
  if (row.atendente_id == null) return false;
  return String(row.atendente_id) === String(adminAtendenteFilterId);
}

function rowMatchesDepartamentoFilter(row, departamentoFilter) {
  if (
    departamentoFilter == null ||
    String(departamentoFilter).trim() === "" ||
    String(departamentoFilter) === "todos"
  ) {
    return true;
  }
  return String(row?.departamento_id ?? "") === String(departamentoFilter);
}

/** Filtros publicados na store que recortam a lista visível (além da aba). */
export function rowMatchesPublishedListFilters(row, view = {}) {
  if (!row) return false;
  const adminScope = getAdminAtendenteFilterScope(view);
  if (adminScope) {
    if (!rowMatchesAdminAtendenteFilter(row, adminScope.atendenteId)) return false;
    if (adminScope.finalAutoQuery && (
      !isClosedAttendance(row) ||
      (String(row.finalizacao_motivo || "") !== "ausencia_cliente" && row.finalizada_automaticamente !== true)
    )) return false;
    if (adminScope.aguardandoQuery && !isConversaAguardandoCliente(row, view.user)) return false;
  }
  if (!rowMatchesDepartamentoFilter(row, view.departamentoFilter)) return false;
  return true;
}

export const CHAT_LIST_HIDDEN_CLOSED_TTL_MS = 90_000;

export function pruneHiddenClosedMap(map, now = Date.now()) {
  const src = map && typeof map === "object" ? map : {};
  const next = {};
  for (const [id, entry] of Object.entries(src)) {
    const expiresAt = Number(entry?.expiresAt ?? entry);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
    next[id] = entry && typeof entry === "object" ? entry : { expiresAt };
  }
  return next;
}

/** Tombstone de encerrar: GET atrasado com status ainda aberto não pode reinserir o card. */
export function shouldBlockHiddenClosedReinsert(hiddenMap, row, now = Date.now()) {
  if (!row?.id) return false;
  if (isClosedAttendance(row)) return false;
  const entry = hiddenMap?.[String(row.id)];
  const expiresAt = Number(entry?.expiresAt ?? entry);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * Classificação exclusiva dos chips de filtro (não do badge do card).
 * "Aguardando cliente" é subcondição de atendimento: a row pode continuar
 * `em_atendimento`, mas o chip conta só em um lado.
 */
export function chatRowChipCountKeys(row) {
  if (!row) return [];
  const s = getStatusAtendimentoEffective(row);
  if (isConversaAguardandoCliente(row) || s === "aguardando_cliente") {
    return ["aguardando_cliente"];
  }
  if (s === "em_atendimento" && row.atendente_id != null) return ["em_atendimento"];
  if (s === "aberta" && row.exibir_badge_aberta !== false) return ["abertas"];
  if (s === "pagamento_pendente") return ["pagamentos_pendentes"];
  if (s === "em_atraso") return ["em_atraso"];
  if (s === "mensagem_disparada") return ["mensagens_disparadas"];
  if (isClosedAttendance(row)) return ["finalizadas"];
  return [];
}

export function applyChatFilterCountsDelta(counts, keys, delta) {
  const next = { ...(counts && typeof counts === "object" ? counts : {}) };
  (Array.isArray(keys) ? keys : []).forEach((key) => {
    if (!key) return;
    const cur = Number(next[key]) || 0;
    next[key] = Math.max(0, cur + (Number(delta) || 0));
  });
  return next;
}

/**
 * Exclusão de pertinência em tempo real: só remove o que definitivamente
 * não pertence à aba. Não replica o GET (paginação/setor).
 */
export function chatRowIsStaleForTab(row, tab) {
  if (!row || row.sem_conversa) return false;
  const t = String(tab || "");
  const closed = isClosedAttendance(row);

  if (TABS_THAT_EXCLUDE_CLOSED.has(t) && closed) return true;

  if (t === "finalizadas") return !closed;

  if (t === "finalizadas_auto") {
    if (!closed) return true;
    return !(
      String(row?.finalizacao_motivo || "") === "ausencia_cliente" ||
      row?.finalizada_automaticamente === true
    );
  }

  if (t === "minha_fila") {
    if (row?.aguardando_resposta_campanha === true) return true;
    const s = getStatusAtendimentoEffective(row);
    return s === "mensagem_disparada";
  }

  if (t === "abertas") {
    const s = getStatusAtendimentoEffective(row);
    if (s && s !== "aberta") return true;
    if (row?.exibir_badge_aberta === false) return true;
    return false;
  }

  if (t === "em_atendimento") {
    const s = getStatusAtendimentoEffective(row);
    return (
      s === "aberta" ||
      s === "aguardando_cliente" ||
      s === "mensagem_disparada" ||
      s === "pagamento_pendente" ||
      s === "em_atraso"
    );
  }

  if (t === "aguardando_cliente") {
    const s = getStatusAtendimentoEffective(row);
    if (s === "aberta" || s === "mensagem_disparada" || s === "pagamento_pendente" || s === "em_atraso") return true;
    if (s === "em_atendimento" && !isConversaAguardandoCliente(row)) return true;
    return false;
  }

  if (t === "pagamentos_pendentes") {
    const s = getStatusAtendimentoEffective(row);
    return s !== "pagamento_pendente";
  }

  if (t === "em_atraso") {
    const s = getStatusAtendimentoEffective(row);
    return s !== "em_atraso";
  }

  if (t === "mensagens_disparadas") {
    return getStatusAtendimentoEffective(row) !== "mensagem_disparada";
  }

  if (t === "campanhas") {
    return row?.aguardando_resposta_campanha !== true || isGroupConversation(row);
  }

  return false;
}

/** Minha fila do usuário logado — mesma regra do socket (`lista_realtime`). */
export function conversaPertenceAMinhaFila(row, userId) {
  if (!row || isGroupConversation(row)) return false;
  if (row.aguardando_resposta_campanha === true) return false;
  const status = getStatusAtendimentoEffective(row);
  const atendenteId = row.atendente_id;
  if (status === "fechada" || status === "encerrada" || status === "mensagem_disparada") return false;
  if (
    status === "em_atendimento" ||
    status === "aguardando_cliente" ||
    status === "pagamento_pendente" ||
    status === "em_atraso"
  ) {
    return userId != null && atendenteId != null && String(atendenteId) === String(userId);
  }
  if (status === "aberta") {
    if (atendenteId != null && userId != null && String(atendenteId) !== String(userId)) return false;
    return row.exibir_badge_aberta !== false;
  }
  return false;
}

export function rowStillBelongsToActiveTab(row, tab, opts = {}) {
  if (!row || row.sem_conversa) return false;
  const view = { ...opts, tab };
  if (getAdminAtendenteFilterScope(view)) return rowMatchesPublishedListFilters(row, view);
  if (chatRowIsStaleForTab(row, tab)) return false;
  const t = String(tab || "");
  const user = opts.user;
  if (t === "todas" || t === "hoje") return true;
  if (t === "minha_fila") return conversaPertenceAMinhaFila(row, user?.id);
  if (t === "em_atendimento") return rowStillBelongsToEmAtendimentoLiveScope(row, opts);
  if (t === "abertas") return getStatusAtendimentoEffective(row) === "aberta" && row?.exibir_badge_aberta !== false;
  if (t === "aguardando_cliente") {
    if (isModoSimplesAguardandoCliente(row, user)) return true;
    return isConversaAguardandoCliente(row, user);
  }
  if (t === "aguardando_atendente") return isModoSimplesAguardandoAtendente(row, user);
  if (t === "aguardando_funcionario") {
    return isConversaAguardandoFuncionario(row, opts.pendentesFuncionarioSet, user);
  }
  if (t === "finalizadas") return isClosedAttendance(row);
  if (t === "finalizadas_auto") {
    return (
      isClosedAttendance(row) &&
      (String(row?.finalizacao_motivo || "") === "ausencia_cliente" || row?.finalizada_automaticamente === true)
    );
  }
  if (t === "pagamentos_pendentes") return isConversaPagamentoPendente(row);
  if (t === "em_atraso") return isConversaEmAtrasoPagamento(row);
  if (t === "mensagens_disparadas") return getStatusAtendimentoEffective(row) === "mensagem_disparada";
  if (t === "campanhas") return row?.aguardando_resposta_campanha === true && !isGroupConversation(row);
  return true;
}

/**
 * Socket/GET :id só podem inserir na lista visível se a row pertencer ao filtro ativo.
 * Busca global e "Todas/Hoje" aceitam inserção (o GET da aba não é um recorte de status).
 */
export function shouldInsertChatRowInActiveList(row, view = {}) {
  if (!row) return false;
  if (!viewerCanSeeConversationRow(row, view.user)) return false;
  if (shouldBlockHiddenClosedReinsert(view.hiddenClosed, row)) return false;
  if (!rowMatchesPublishedListFilters(row, view)) return false;
  // Janela de debounce: não inserir pela aba nem pela busca global (evita contaminar).
  if (view.searchActive && !view.searchDebounced) return false;
  if (view.searchDebounced) return true;
  if (getAdminAtendenteFilterScope(view)) return true;
  const tab = String(view.tab || "");
  if (!tab || tab === "todas" || tab === "hoje") return true;
  if (chatRowIsStaleForTab(row, tab)) return false;
  if (tab === "em_atendimento") {
    if (row?.atendente_id == null) return false;
    const s = getStatusAtendimentoEffective(row);
    if (s !== "em_atendimento" && s !== "aguardando_cliente") return false;
  }
  if (tab === "aguardando_funcionario") {
    if (isModoSimplesAguardandoAtendente(row, view.user)) {
      return rowStillBelongsToActiveTab(row, tab, view);
    }
    if (!view.pendentesFuncionarioSet?.has?.(String(row.id))) return false;
  }
  return rowStillBelongsToActiveTab(row, tab, view);
}

export function getOptimisticRemovedRow(entry) {
  return entry && typeof entry === "object" && "row" in entry ? entry.row : entry;
}

export function pruneExpiredOptimisticRemoved(map) {
  const now = Date.now();
  for (const [id, entry] of map.entries()) {
    if (entry?.expiresAt != null && Number(entry.expiresAt) <= now) {
      map.delete(id);
    }
  }
}

function getChatSortTs(c) {
  return getChatListSortTimestampMs(c) || 0;
}

export function sortChatRowsByOrder(list, order) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) =>
    order === "antigas"
      ? new Date(getChatSortTs(a)) - new Date(getChatSortTs(b))
      : new Date(getChatSortTs(b)) - new Date(getChatSortTs(a))
  );
}

export function dedupeChatRowsByStableKey(list) {
  const byKey = new Map();
  (Array.isArray(list) ? list : []).forEach((c) => {
    const key = chatRowStableKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  });
  return Array.from(byKey.values());
}

export function mergeChatRowsPreservingCurrent(current, incoming, order) {
  const byKey = new Map();
  const put = (row, preferIncoming = false) => {
    if (!row) return;
    const key = chatRowStableKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      return;
    }
    if (!preferIncoming) {
      byKey.set(key, mergeChatRowListaAtividade(row, prev));
      return;
    }
    const merged = mergeChatRowListaAtividade(row, prev);
    byKey.set(key, merged);
  };
  (Array.isArray(current) ? current : []).forEach((row) => put(row, false));
  (Array.isArray(incoming) ? incoming : []).forEach((row) => put(row, true));
  return sortChatRowsByOrder(Array.from(byKey.values()), order);
}

export function rowStillBelongsToEmAtendimentoLiveScope(row, { user, adminAtendenteFilterId, pendentesFuncionarioSet }) {
  if (!row || row.sem_conversa || isGroupConversation(row)) return false;
  const belongsToEmAtendimento =
    isConversaAguardandoCliente(row) ||
    isConversaAguardandoFuncionario(row, pendentesFuncionarioSet) ||
    isConversaEmAtendimentoBadge(row);
  if (!belongsToEmAtendimento) return false;

  const filtroAtendenteAtivo =
    adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
  if (filtroAtendenteAtivo) {
    return row.atendente_id != null && String(row.atendente_id) === String(adminAtendenteFilterId);
  }

  // Chip "Em atendimento": todos os atendimentos visíveis da empresa/setor, não só os meus.
  return row.atendente_id != null;
}

export function mergeActiveTabBackgroundRows(current, incoming, order, opts) {
  const tab = String(opts?.tab || "");
  // Minha fila busca todas as páginas: o GET é a lista inteira. Preservar extras
  // locais recolocava cards já assumidos/encerrados até o F5.
  if (opts?.incomingIsComplete === true) return incoming;
  const incomingKeys = new Set(
    (Array.isArray(incoming) ? incoming : [])
      .map((row) => chatRowStableKey(row))
      .filter(Boolean)
  );
  const hiddenIds = opts?.hiddenIds;
  const preserved = (Array.isArray(current) ? current : []).filter((row) => {
    const key = chatRowStableKey(row);
    if (!key || incomingKeys.has(key)) return false;
    if (hiddenIds?.has?.(String(row?.id))) return false;
    if (!viewerCanSeeConversationRow(row, opts?.user)) return false;
    return rowStillBelongsToActiveTab(row, tab, opts);
  });
  if (!preserved.length) return incoming;
  return mergeChatRowsPreservingCurrent(preserved, incoming, order);
}

export function mergeEmAtendimentoBackgroundRows(current, incoming, order, opts) {
  return mergeActiveTabBackgroundRows(current, incoming, order, {
    ...opts,
    tab: opts?.tab || "em_atendimento",
  });
}

export function buildChatListPageState(data, pagesLoaded = 1) {
  const meta = getChatsPageMeta(data);
  const fromMeta = Number(meta?.pagesLoaded);
  const safePages = Number.isFinite(fromMeta) && fromMeta > 0
    ? Math.floor(fromMeta)
    : Math.max(1, Math.floor(Number(pagesLoaded) || 1));
  return {
    hasMore: Boolean(meta?.hasMore && meta?.nextCursor),
    nextCursor: meta?.nextCursor || null,
    nextCursorId: meta?.nextCursorId ?? null,
    totalCount: meta?.totalCount ?? null,
    pagesLoaded: safePages,
    loading: false,
    error: "",
  };
}

export function buildCountsQueryParams({
  tagFilter,
  departamentoFilter,
  dataInicio,
  dataFim,
  debouncedSearch,
  adminAtendenteFilterId,
}) {
  const adminPorFuncionario =
    adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
  const searchTerm = String(debouncedSearch || "").trim();
  const params = {
    tag_id: tagFilter !== "todas" ? tagFilter : undefined,
    departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
    data_inicio: dataInicio || undefined,
    data_fim: dataFim || undefined,
    palavra: searchTerm || undefined,
  };
  if (adminPorFuncionario) {
    const aid = Number(adminAtendenteFilterId);
    params.atendente_id =
      Number.isFinite(aid) && aid > 0 ? aid : adminAtendenteFilterId;
  }
  return params;
}

export function isAbortError(err) {
  return (
    err?.name === "AbortError" ||
    err?.name === "CanceledError" ||
    err?.code === "ERR_CANCELED"
  );
}

export function isNetworkError(err) {
  return (
    err?.code === "ERR_NETWORK" ||
    err?.message === "Network Error" ||
    err?.request?.status === 0
  );
}

/**
 * Monta os params de GET /chats (e equivalentes) da lista.
 * Com termo de busca, `incluir_todos_clientes=1` e a aba/chip de estado são ignorados
 * (B01 — a busca não se limita às rows já carregadas nem ao filtro de fila ativo).
 */
export function buildChatListFetchParams({
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
  pendentesFuncionarioIds,
  isSupervisorOrAdminFn,
}) {
  const adminScope = getAdminAtendenteFilterScope({
    adminAtendenteFilterId, tab, onlyFinalizadasAusencia, aguardandoClienteOnly,
    searchActive: Boolean(String(debouncedSearch || "").trim()),
  });
  const adminPorFuncionario = adminScope != null;
  const finalAutoQuery = tab === "finalizadas_auto" || onlyFinalizadasAusencia;
  const aguardandoQuery = tab === "aguardando_cliente" || aguardandoClienteOnly;
  const aguardandoAtendenteQuery = tab === "aguardando_atendente";
  const pagamentoPendenteQuery =
    isFinanceiroUser && (tab === "pagamentos_pendentes" || pagamentosPendentesOnly);
  const emAtrasoQuery = isFinanceiroUser && (tab === "em_atraso" || emAtrasoOnly);
  const searchTerm = String(debouncedSearch || "").trim();
  const pageLimit = getChatListPageLimit(isMobileLayout);
  const includeAllForSearch = searchTerm ? "1" : undefined;
  const searchBypassesTabFilters = Boolean(searchTerm);

  let params;
  if (searchBypassesTabFilters) {
    params = {
      tag_id: tagFilter !== "todas" ? tagFilter : undefined,
      departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      palavra: searchTerm,
      incluir_todos_clientes: includeAllForSearch,
      limit: pageLimit,
    };
    if (adminPorFuncionario) {
      params.atendente_id = adminScope.atendenteId;
    } else if (atendenteFilter !== "todos") {
      params.atendente_id = atendenteFilter;
    }
  } else if (adminPorFuncionario) {
    params = {
      atendente_id: adminScope.atendenteId,
      tag_id: tagFilter !== "todas" ? tagFilter : undefined,
      departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      palavra: searchTerm || undefined,
      incluir_todos_clientes: includeAllForSearch,
      limit: pageLimit,
    };
    if (adminScope.finalAutoQuery) {
      params.finalizacao_motivo = "ausencia_cliente";
    }
    if (adminScope.aguardandoQuery) {
      params.aguardando_cliente = "1";
    }
  } else {
    params = {
      tag_id: tagFilter !== "todas" ? tagFilter : undefined,
      departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
      status_atendimento: statusFilter !== "todos" ? statusFilter : undefined,
      atendente_id: atendenteFilter !== "todos" ? atendenteFilter : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      palavra: searchTerm || undefined,
      incluir_todos_clientes: includeAllForSearch,
      limit: pageLimit,
    };
    if (tab === "minha_fila") {
      params.minha_fila = "1";
      delete params.status_atendimento;
      if (finalAutoQuery) {
        params.status_atendimento = "fechada";
        params.finalizacao_motivo = "ausencia_cliente";
      }
    } else if (tab === "campanhas") {
      params.campanhas = "1";
      delete params.status_atendimento;
      delete params.atendente_id;
    } else if (aguardandoQuery) {
      params.aguardando_cliente = "1";
      delete params.status_atendimento;
      delete params.atendente_id;
    } else if (aguardandoAtendenteQuery) {
      params.aguardando_atendente = "1";
      delete params.status_atendimento;
      delete params.atendente_id;
    } else if (pagamentoPendenteQuery) {
      params.pagamento_pendente = "1";
      delete params.status_atendimento;
      delete params.atendente_id;
    } else if (emAtrasoQuery) {
      params.em_atraso = "1";
      delete params.status_atendimento;
      delete params.atendente_id;
    } else if (finalAutoQuery) {
      params.status_atendimento = "fechada";
      params.finalizacao_motivo = "ausencia_cliente";
    } else if (tab === "abertas") {
      params.status_atendimento = "aberta";
    } else if (tab === "em_atendimento") {
      params.status_atendimento = "em_atendimento";
    } else if (tab === "finalizadas") {
      params.status_atendimento = "fechada";
    } else if (tab === "hoje") {
      params.hoje = "1";
      delete params.status_atendimento;
    } else if (tab === "mensagens_disparadas" && separarMensagensDisparadasLigado) {
      params.status_atendimento = "mensagem_disparada";
    } else if (tab === "aguardando_funcionario" && isSupervisorOrAdminFn(user)) {
      const ids = (pendentesFuncionarioIds || [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      params.conversa_ids = ids.length > 0 ? ids.join(",") : "0";
      delete params.status_atendimento;
      delete params.atendente_id;
    }
  }

  if (!searchBypassesTabFilters && tempoParadoFilter) params.tempo_parado = tempoParadoFilter;
  if (!searchBypassesTabFilters && conversaIdsPendenciaQuery != null) {
    params.conversa_ids = conversaIdsPendenciaQuery;
  }

  return {
    params,
    searchTerm,
    searchBypassesTabFilters,
    pageLimit,
    adminPorFuncionario,
    finalAutoQuery,
    aguardandoQuery,
    aguardandoAtendenteQuery,
  };
}
