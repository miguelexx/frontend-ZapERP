/**
 * Prefetch da aba padrão (Minha fila) logo após auth, em paralelo com
 * permissões/empresa/socket. Ao montar o atendimento, o snapshot já está quente.
 *
 * Cache de sessão só pinta a lista; o GET do `load()` continua (stale-while-revalidate).
 * Só reutilizamos um GET de rede já disparado no login/restore.
 */
import { fetchMinhaFilaChatsProgressivo } from "./chatService";
import { buildChatListFiltersScopeKey } from "./chatListFiltersData";
import {
  buildDefaultChatListFilterRequestKey,
  getDefaultChatListTab,
} from "./chatListFilters";
import {
  hydrateChatListRowsForFilterFromSession,
  persistChatListRowsForFilterToSession,
  persistChatListSidebarToSession,
} from "./chatListSidebarCache";

const PREFETCH_REUSE_MS = 8000;

let inFlight = null;
let inFlightKey = "";
/** Resultado de GET real (não hidratação de sessionStorage). */
let lastNetwork = null;

function sessionMatchesUser(user) {
  try {
    const raw = localStorage.getItem("zap_erp_auth");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return false;
    const uid = parsed.user?.id ?? parsed.user?.user_id;
    return uid != null && String(uid) === String(user?.id ?? user?.user_id);
  } catch {
    return false;
  }
}

/**
 * Reutiliza o GET já disparado no login/restore, se ainda for da aba padrão.
 * @returns {Promise<any[]|null>|null}
 */
export function takePrefetchedDefaultChatList(user, filterRequestKey) {
  const expectedKey = buildDefaultChatListFilterRequestKey(user);
  if (!user || filterRequestKey !== expectedKey) return null;
  if (inFlight && inFlightKey === expectedKey) {
    return inFlight.then((r) => (Array.isArray(r?.list) ? r.list : null));
  }
  if (
    lastNetwork &&
    lastNetwork.filterKey === expectedKey &&
    Date.now() - lastNetwork.t < PREFETCH_REUSE_MS &&
    Array.isArray(lastNetwork.list)
  ) {
    return Promise.resolve(lastNetwork.list);
  }
  return null;
}

export function prefetchDefaultChatList(user) {
  if (!user?.id && user?.user_id == null) return Promise.resolve(null);
  if (getDefaultChatListTab(user) !== "minha_fila") return Promise.resolve(null);

  const scopeKey = buildChatListFiltersScopeKey(user);
  const filterKey = buildDefaultChatListFilterRequestKey(user);

  const cached = hydrateChatListRowsForFilterFromSession(scopeKey, filterKey);
  if (Array.isArray(cached) && cached.length > 0) {
    return Promise.resolve({ list: cached, fromCache: true });
  }

  if (inFlight && inFlightKey === filterKey) return inFlight;

  inFlightKey = filterKey;
  inFlight = fetchMinhaFilaChatsProgressivo(
    { minha_fila: "1" },
    { silent: true }
  )
    .then((data) => {
      if (!sessionMatchesUser(user)) return null;
      const list = Array.isArray(data) ? data : [];
      persistChatListRowsForFilterToSession(scopeKey, filterKey, list);
      persistChatListSidebarToSession(scopeKey, list, {
        minhaFila: list,
        minhaFilaCount: list.length,
      });
      lastNetwork = { t: Date.now(), filterKey, list };
      return { list, fromCache: false };
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
      inFlightKey = "";
    });

  return inFlight;
}
