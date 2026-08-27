import { isSupervisorOrAdmin } from "../auth/permissions";
import { isGroupConversation } from "../utils/conversaUtils";
import {
  isConversaAguardandoCliente,
  isConversaAguardandoFuncionario,
  isConversaEmAtendimentoBadge,
  getChatListSortTimestampMs,
  mergeChatRowListaAtividade,
} from "./chatListRowAtendimento";
import { chatRowStableKey } from "./chatRowStableKey";
import { getChatsPageMeta } from "./chatService";

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

export function isClosedAttendancePatch(patch) {
  const status = String(
    patch?.status_atendimento_real ?? patch?.status_atendimento ?? ""
  ).toLowerCase();
  return status === "fechada" || status === "encerrada";
}

export function shouldHideOptimisticClosedFromTab(tab, mutation) {
  if (mutation?.type !== "encerrar_conversa") return false;
  if (!isClosedAttendancePatch(mutation?.patch)) return false;
  return TABS_HIDE_OPTIMISTIC_CLOSED.has(String(tab || ""));
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

  if (isAppAdmin(user)) return true;

  return (
    row.atendente_id != null &&
    user?.id != null &&
    String(row.atendente_id) === String(user.id)
  );
}

export function mergeEmAtendimentoBackgroundRows(current, incoming, order, opts) {
  const incomingKeys = new Set(
    (Array.isArray(incoming) ? incoming : [])
      .map((row) => chatRowStableKey(row))
      .filter(Boolean)
  );
  const preserved = (Array.isArray(current) ? current : []).filter((row) => {
    const key = chatRowStableKey(row);
    if (!key || incomingKeys.has(key)) return false;
    return rowStillBelongsToEmAtendimentoLiveScope(row, opts);
  });
  if (!preserved.length) return incoming;
  return mergeChatRowsPreservingCurrent(preserved, incoming, order);
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
  const adminPorFuncionario =
    adminAtendenteFilterId != null && String(adminAtendenteFilterId).trim() !== "";
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
      const aid = Number(adminAtendenteFilterId);
      params.atendente_id =
        Number.isFinite(aid) && aid > 0 ? aid : adminAtendenteFilterId;
    } else if (atendenteFilter !== "todos") {
      params.atendente_id = atendenteFilter;
    }
  } else if (adminPorFuncionario) {
    const aid = Number(adminAtendenteFilterId);
    const atendenteIdQuery =
      Number.isFinite(aid) && aid > 0 ? aid : adminAtendenteFilterId;
    params = {
      atendente_id: atendenteIdQuery,
      tag_id: tagFilter !== "todas" ? tagFilter : undefined,
      departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      palavra: searchTerm || undefined,
      incluir_todos_clientes: includeAllForSearch,
      limit: pageLimit,
    };
    if (finalAutoQuery) {
      params.finalizacao_motivo = "ausencia_cliente";
    }
    if (aguardandoQuery) {
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
