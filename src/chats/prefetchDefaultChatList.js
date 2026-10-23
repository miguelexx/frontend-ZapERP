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

/**
 * Limite da 1ª página DO BOOT. As seguintes continuam em 250, em segundo plano.
 *
 * Antes o boot pedia 250 de uma vez e, sem `onFirstPage`, só resolvia no fim do laço
 * (até 50 páginas): a lista não pintava enquanto a fila inteira não chegasse. E cada
 * linha é gorda — o `select` do backend traz cliente + cliente_tags + tags + atendente
 * + departamentos + a última mensagem completa (`texto`, `contact_meta`, `location_meta`).
 * No celular cabem ~8 linhas na tela: pedir 250 para mostrar 8 era o maior desperdício
 * de latência do boot (medido em 23/10/2026, `docs/audits/boot-mobile-2026-10-23.md`).
 *
 * 40 cobre com folga a primeira tela em qualquer aparelho, inclusive tablet deitado.
 */
export const PREFETCH_BOOT_PRIMEIRA_PAGINA_LIMIT = 40;

let inFlight = null;
let inFlightKey = "";
/**
 * Promessa da 1ª PÁGINA do GET em voo. Existe para a lista pintar antes de a fila
 * inteira chegar — NUNCA substitui `inFlight`, que continua a ser a lista COMPLETA.
 * A aba "Minha fila" não tem "Carregar mais" (força `hasMore: false`), então entregar
 * uma página parcial como resultado final sumiria com conversas de vez.
 */
let inFlightPrimeiraPagina = null;
/** Resultado de GET real (não hidratação de sessionStorage). */
let lastNetwork = null;

/** Promessa que alguém de fora resolve (aqui: quem receber a 1ª página). */
function criarAdiado() {
  let resolver = () => {};
  const promessa = new Promise((r) => {
    resolver = r;
  });
  // Resolver duas vezes é no-op: a primeira chamada vence.
  return { promessa, resolver };
}

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

/**
 * 1ª página do GET do boot, para pintar a lista antes de a fila inteira chegar.
 *
 * Só devolve enquanto o GET completo AINDA está em voo: depois disso
 * `takePrefetchedDefaultChatList` já entrega a lista completa na hora e pintar uma
 * página parcial seria andar para trás.
 *
 * @returns {Promise<any[]|null>|null} resolve com a 1ª página, ou null se não houver
 *   (fila que coube numa página resolve com a lista completa; erro resolve com null).
 */
export function takePrefetchedDefaultChatListPrimeiraPagina(user, filterRequestKey) {
  const expectedKey = buildDefaultChatListFilterRequestKey(user);
  if (!user || filterRequestKey !== expectedKey) return null;
  if (!inFlight || inFlightKey !== expectedKey) return null;
  return inFlightPrimeiraPagina;
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
  const primeira = criarAdiado();
  inFlightPrimeiraPagina = primeira.promessa;
  inFlight = fetchMinhaFilaChatsProgressivo(
    { minha_fila: "1" },
    { silent: true, primeiraPaginaLimit: PREFETCH_BOOT_PRIMEIRA_PAGINA_LIMIT },
    // Só é chamado quando HÁ mais páginas; fila que cabe numa página resolve
    // pelo `.then` abaixo, já com a lista completa.
    (primeiraPagina) => {
      if (!sessionMatchesUser(user)) return;
      primeira.resolver(Array.isArray(primeiraPagina) ? primeiraPagina : null);
    }
  )
    .then((data) => {
      if (!sessionMatchesUser(user)) return null;
      const list = Array.isArray(data) ? data : [];
      // Só a lista COMPLETA vai para o cache de sessão: gravar a 1ª página faria o
      // próximo boot hidratar uma fila truncada e sair cedo por `fromCache`.
      persistChatListRowsForFilterToSession(scopeKey, filterKey, list);
      persistChatListSidebarToSession(scopeKey, list, {
        minhaFila: list,
        minhaFilaCount: list.length,
      });
      lastNetwork = { t: Date.now(), filterKey, list };
      // NÃO resolve a 1ª página com a lista completa: se a fila coube numa página,
      // `onFirstPage` nunca correu e quem espera é destravado com `null` pelo
      // `.finally` — que corre ANTES de `inFlight` resolver. Assim a lista é pintada
      // UMA vez (pela lista completa), em vez de duas com o mesmo conteúdo.
      return { list, fromCache: false };
    })
    .catch(() => null)
    .finally(() => {
      // Erro, sessão trocada ou fila vazia: destrava quem estiver à espera.
      primeira.resolver(null);
      inFlight = null;
      inFlightKey = "";
      inFlightPrimeiraPagina = null;
    });

  return inFlight;
}
