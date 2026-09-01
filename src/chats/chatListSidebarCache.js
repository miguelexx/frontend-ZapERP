/**

 * Snapshot leve da lista lateral (metadados de linha) — stale-while-revalidate após F5.

 * Chave por escopo empresa:usuário (`buildChatListFiltersScopeKey`).

 * Não persiste arrays de mensagens da thread nem conteúdo além do preview da última linha.

 */

const SIDEBAR_TTL_MS = 2 * 60 * 1000;
const FILTER_ROWS_TTL_MS = 45 * 1000;
const FILTER_ROWS_MEMORY_TTL_MS = 15 * 60 * 1000;
const FILTER_ROWS_MEMORY_MAX = 24;
const filterRowsMemoryCache = new Map();

const STORAGE_PREFIX = "zap_erp_chat_sidebar_v1";
const FILTER_ROWS_STORAGE_PREFIX = "zap_erp_chat_rows_by_filter_v1";

/** Cabe várias páginas após "Carregar mais" (antes 120 truncava o snapshot). */
const MAX_CHATS = 400;

function filterRowsMemoryKey(scopeKey, filterKey) {
  return `${scopeKey}::${filterKey}`;
}

function readFilterRowsMemory(scopeKey, filterKey) {
  const key = filterRowsMemoryKey(scopeKey, filterKey);
  const entry = filterRowsMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - (entry.t || 0) > FILTER_ROWS_MEMORY_TTL_MS) {
    filterRowsMemoryCache.delete(key);
    return null;
  }
  if (!entry.rows?.length) return null;
  return entry.rows.slice();
}

function writeFilterRowsMemory(scopeKey, filterKey, rows) {
  if (!scopeKey || !filterKey || !rows?.length) return;
  const key = filterRowsMemoryKey(scopeKey, filterKey);
  filterRowsMemoryCache.delete(key);
  filterRowsMemoryCache.set(key, { t: Date.now(), rows });
  while (filterRowsMemoryCache.size > FILTER_ROWS_MEMORY_MAX) {
    const oldest = filterRowsMemoryCache.keys().next().value;
    if (oldest == null) break;
    filterRowsMemoryCache.delete(oldest);
  }
}

function clearFilterRowsMemory(scopeKey) {
  if (!scopeKey) {
    filterRowsMemoryCache.clear();
    return;
  }
  const prefix = `${scopeKey}::`;
  for (const key of [...filterRowsMemoryCache.keys()]) {
    if (key.startsWith(prefix)) filterRowsMemoryCache.delete(key);
  }
}

function storageKey(scopeKey) {

  return `${STORAGE_PREFIX}:${scopeKey}`;

}

function filterRowsStorageKey(scopeKey, filterKey) {

  return `${FILTER_ROWS_STORAGE_PREFIX}:${scopeKey}:${filterKey}`;

}

function safeSessionKeys() {

  if (typeof sessionStorage === "undefined") return [];

  try {

    return Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter(Boolean);

  } catch {

    return [];

  }

}



function trimPreviewText(msg) {

  if (!msg || typeof msg !== "object") return msg;

  const texto = msg.texto ?? msg.conteudo ?? msg.ultima_mensagem_preview ?? null;

  const s = texto != null ? String(texto) : "";

  const clipped = s.length > 280 ? `${s.slice(0, 280)}…` : s;

  return {

    id: msg.id,

    whatsapp_id: msg.whatsapp_id,

    tipo: msg.tipo,

    direcao: msg.direcao,

    status: msg.status,

    status_mensagem: msg.status_mensagem,

    criado_em: msg.criado_em,

    texto: clipped || null,

    conteudo: clipped || null,

    ultima_mensagem_preview: msg.ultima_mensagem_preview,

    nome_arquivo: msg.nome_arquivo,

  };

}



/** Remove campos pesados / thread completa antes de gravar na sessão. */

export function sanitizeChatRowForSidebarCache(chat) {

  if (!chat || chat.id == null) return null;

  const u = chat.ultima_mensagem;

  const tags = Array.isArray(chat.tags)

    ? chat.tags.slice(0, 3).map((t) =>

        t && typeof t === "object"

          ? { id: t.id, nome: t.nome, cor: t.cor }

          : t

      )

    : undefined;

  return {

    id: chat.id,

    cliente_id: chat.cliente_id,

    sem_conversa: chat.sem_conversa,

    contato_nome: chat.contato_nome,

    nome_contato_cache: chat.nome_contato_cache,

    cliente_nome: chat.cliente_nome,

    nome_grupo: chat.nome_grupo,

    telefone: chat.telefone,

    telefone_exibivel: chat.telefone_exibivel,

    foto_perfil: chat.foto_perfil,

    foto_perfil_contato_cache: chat.foto_perfil_contato_cache,

    foto_grupo: chat.foto_grupo,

    unread_count: chat.unread_count,

    unread: chat.unread,

    tem_novas_mensagens: chat.tem_novas_mensagens,

    tem_novas_mensagens_em_atendimento: chat.tem_novas_mensagens_em_atendimento,

    lida: chat.lida,

    status_atendimento: chat.status_atendimento,

    status_atendimento_real: chat.status_atendimento_real,

    exibir_badge_aberta: chat.exibir_badge_aberta,

    finalizacao_motivo: chat.finalizacao_motivo,

    aguardando_cliente_desde: chat.aguardando_cliente_desde,

    atendente_id: chat.atendente_id,

    atendente_nome: chat.atendente_nome,

    departamento_id: chat.departamento_id,

    departamento: chat.departamento

      ? { id: chat.departamento.id, nome: chat.departamento.nome }

      : undefined,

    setor: chat.setor,

    fixada: chat.fixada,

    silenciado: chat.silenciado,

    silenciada: chat.silenciada,

    favorita: chat.favorita,

    ultima_atividade: chat.ultima_atividade,

    ultima_mensagem: u ? trimPreviewText(u) : null,

    tags,

  };

}



function slimList(arr) {

  return (Array.isArray(arr) ? arr : [])

    .map(sanitizeChatRowForSidebarCache)

    .filter(Boolean)

    .slice(0, MAX_CHATS);

}



function readParsed(scopeKey) {

  if (typeof sessionStorage === "undefined" || !scopeKey) return null;

  try {

    const raw = sessionStorage.getItem(storageKey(scopeKey));

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed || Date.now() - (parsed.t || 0) > SIDEBAR_TTL_MS) {

      sessionStorage.removeItem(storageKey(scopeKey));

      return null;

    }

    return parsed;

  } catch {

    return null;

  }

}



/**

 * @returns {{ chats: object[], minhaFila: object[]|null, minhaFilaCount: number|null, emAtendimentoBadgeCount: number|null, aguardandoClienteBadgeCount: number|null, mensagensDisparadasCount: number|null }|null}

 */

export function hydrateChatListSidebarFromSession(scopeKey) {

  const parsed = readParsed(scopeKey);

  if (!parsed) return null;

  const chats = Array.isArray(parsed.chats) ? parsed.chats.slice(0, MAX_CHATS) : [];

  /** Nunca reutilizar `chats` (Todas) como Minha fila — abas têm escopos distintos. */
  const minhaFila = Array.isArray(parsed.minhaFila)
    ? parsed.minhaFila.slice(0, MAX_CHATS)
    : null;

  return {

    chats,

    minhaFila,

    minhaFilaCount:
      typeof parsed.minhaFilaCount === "number"
        ? parsed.minhaFilaCount
        : minhaFila != null
          ? minhaFila.length
          : null,

    emAtendimentoBadgeCount:

      typeof parsed.emAtendimentoBadgeCount === "number"

        ? parsed.emAtendimentoBadgeCount

        : null,

    aguardandoClienteBadgeCount:

      typeof parsed.aguardandoClienteBadgeCount === "number"

        ? parsed.aguardandoClienteBadgeCount

        : null,

    mensagensDisparadasCount:

      typeof parsed.mensagensDisparadasCount === "number"

        ? parsed.mensagensDisparadasCount

        : null,

  };

}

export function hydrateChatListRowsForFilterFromSession(scopeKey, filterKey) {
  if (!scopeKey || !filterKey) return null;
  const fromMemory = readFilterRowsMemory(scopeKey, filterKey);
  if (fromMemory?.length) return fromMemory;

  if (typeof sessionStorage === "undefined") return null;

  try {

    const key = filterRowsStorageKey(scopeKey, filterKey);

    const raw = sessionStorage.getItem(key);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed || Date.now() - (parsed.t || 0) > FILTER_ROWS_TTL_MS) {

      sessionStorage.removeItem(key);

      return null;

    }

    const rows = Array.isArray(parsed.rows) ? parsed.rows.slice(0, MAX_CHATS) : [];

    if (rows.length) writeFilterRowsMemory(scopeKey, filterKey, rows);

    return rows.length ? rows : null;

  } catch {

    return null;

  }

}

/**
 * Remove uma conversa de todos os snapshots de filtro (memória + sessionStorage).
 * Evita que, ao trocar de aba, o cache de 15 min reapresente uma conversa já finalizada.
 */
export function removeChatIdFromFilterRowCaches(scopeKey, chatId) {
  const id = String(chatId ?? "");
  if (!id) return;

  const memPrefix = scopeKey ? `${scopeKey}::` : "";
  for (const key of [...filterRowsMemoryCache.keys()]) {
    if (scopeKey && !key.startsWith(memPrefix)) continue;
    const entry = filterRowsMemoryCache.get(key);
    if (!entry?.rows?.length) continue;
    const next = entry.rows.filter((row) => String(row?.id) !== id);
    if (next.length === entry.rows.length) continue;
    if (!next.length) filterRowsMemoryCache.delete(key);
    else filterRowsMemoryCache.set(key, { t: entry.t || Date.now(), rows: next });
  }

  if (typeof sessionStorage === "undefined") return;
  const sessPrefix = scopeKey
    ? `${FILTER_ROWS_STORAGE_PREFIX}:${scopeKey}:`
    : `${FILTER_ROWS_STORAGE_PREFIX}:`;
  for (const key of safeSessionKeys()) {
    if (!key.startsWith(sessPrefix)) continue;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!parsed || !Array.isArray(parsed.rows)) continue;
      const next = parsed.rows.filter((row) => String(row?.id) !== id);
      if (next.length === parsed.rows.length) continue;
      if (!next.length) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify({ ...parsed, rows: next }));
    } catch {
      /* quota / JSON */
    }
  }
}

export function persistChatListRowsForFilterToSession(scopeKey, filterKey, rows) {
  if (!scopeKey || !filterKey) return;

  const slim = slimList(rows);

  if (!slim.length) return;
  writeFilterRowsMemory(scopeKey, filterKey, slim);

  if (typeof sessionStorage === "undefined") return;

  try {

    sessionStorage.setItem(

      filterRowsStorageKey(scopeKey, filterKey),

      JSON.stringify({ t: Date.now(), rows: slim })

    );

  } catch {

    /* quota */

  }

}

export function clearChatListRowsFilterSessionCache(scopeKey) {
  clearFilterRowsMemory(scopeKey);

  if (typeof sessionStorage === "undefined") return;

  const prefix = scopeKey

    ? `${FILTER_ROWS_STORAGE_PREFIX}:${scopeKey}:`

    : `${FILTER_ROWS_STORAGE_PREFIX}:`;

  for (const key of safeSessionKeys()) {

    if (key.startsWith(prefix)) {

      try {

        sessionStorage.removeItem(key);

      } catch {

        /* ignore */

      }

    }

  }

}

export function clearChatListSidebarSessionCache() {

  if (typeof sessionStorage === "undefined") return;

  for (const key of safeSessionKeys()) {

    if (key.startsWith(`${STORAGE_PREFIX}:`) || key.startsWith(`${FILTER_ROWS_STORAGE_PREFIX}:`)) {

      try {

        sessionStorage.removeItem(key);

      } catch {

        /* ignore */

      }

    }

  }

}



/** Persiste lista geral + metadados de aba Minha fila e contadores de chips (sem mensagens). */

export function persistChatListSidebarToSession(scopeKey, chats, extras = {}) {

  if (typeof sessionStorage === "undefined" || !scopeKey) return;

  const arr = Array.isArray(chats) ? chats : [];

  if (arr.length === 0 && !extras?.minhaFila?.length) return;

  try {

    const slim = slimList(arr);

    const minhaFila = extras.minhaFila != null ? slimList(extras.minhaFila) : undefined;

    sessionStorage.setItem(

      storageKey(scopeKey),

      JSON.stringify({

        t: Date.now(),

        chats: slim.length ? slim : minhaFila || [],

        ...(minhaFila?.length ? { minhaFila } : {}),

        ...(extras.minhaFilaCount != null ? { minhaFilaCount: extras.minhaFilaCount } : {}),

        ...(extras.emAtendimentoBadgeCount != null

          ? { emAtendimentoBadgeCount: extras.emAtendimentoBadgeCount }

          : {}),

        ...(extras.aguardandoClienteBadgeCount != null

          ? { aguardandoClienteBadgeCount: extras.aguardandoClienteBadgeCount }

          : {}),

        ...(extras.mensagensDisparadasCount != null

          ? { mensagensDisparadasCount: extras.mensagensDisparadasCount }

          : {}),

      })

    );

  } catch {

    /* quota */

  }

}


