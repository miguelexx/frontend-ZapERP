const DEDUPE_TTL_MS = 6000
const MAX_DEDUPE_KEYS = 600
const MAX_REALTIME_AGE_MS = 3 * 60 * 1000
const dedupeCache = new Map()

function normalize(value) {
  if (value == null) return ""
  return String(value).trim()
}

function cleanupExpired(now = Date.now()) {
  for (const [key, exp] of dedupeCache.entries()) {
    if (exp <= now) dedupeCache.delete(key)
  }
}

/** Chave estável para dedup da mesma mensagem (som + desktop). */
export function makeIncomingDedupeKey(msg) {
  const conversaId = normalize(msg?.conversa_id)
  const messageId = normalize(msg?.id || msg?.mensagem_id || msg?.whatsapp_id)
  const tsBase = normalize(msg?.criado_em || msg?.timestamp || msg?.created_at)
  const tsBucket = tsBase ? Math.floor(new Date(tsBase).getTime() / 5000) : Math.floor(Date.now() / 5000)
  return `${conversaId}::${messageId || "sem_id"}::${tsBucket}`
}

function trimDedupeIfNeeded() {
  cleanupExpired(Date.now())
  if (dedupeCache.size <= MAX_DEDUPE_KEYS) return
  const overflow = dedupeCache.size - MAX_DEDUPE_KEYS + 100
  let removed = 0
  for (const k of dedupeCache.keys()) {
    dedupeCache.delete(k)
    if (++removed >= overflow) break
  }
}

function markIfDuplicate(key) {
  const now = Date.now()
  cleanupExpired(now)
  const exp = dedupeCache.get(key)
  if (exp && exp > now) return true
  dedupeCache.set(key, now + DEDUPE_TTL_MS)
  trimDedupeIfNeeded()
  return false
}

/** Aba do ZapERP visível (Page Visibility API). */
export function isPageVisible() {
  if (typeof document === "undefined") return false
  return document.visibilityState === "visible"
}

/**
 * Foco do sistema na janela do navegador.
 * Ao usar outro programa ou clicar fora do Chrome/Edge, costuma ficar false mesmo com a aba ZapERP selecionada.
 */
export function hasBrowserWindowFocus() {
  if (typeof document === "undefined") return false
  return typeof document.hasFocus !== "function" ? true : document.hasFocus()
}

/**
 * Suprimir som/desktop só quando o atendente está com o ZapERP em primeiro plano:
 * aba visível e janela do navegador com foco no SO.
 * Outra aba, outro app, janela atrás ou minimizada → não suprimir.
 */
export function isAppUiFullyFocusedForSuppress() {
  return isPageVisible() && hasBrowserWindowFocus()
}

export function isConversationRouteActive(currentPathname) {
  if (typeof currentPathname === "string" && currentPathname.trim()) {
    return currentPathname.startsWith("/atendimento")
  }
  if (typeof window === "undefined") return false
  return String(window.location?.pathname || "").startsWith("/atendimento")
}

export function isConversationOpen(selectedConversationId, conversaId) {
  return normalize(selectedConversationId) === normalize(conversaId)
}

function isRealtimeFreshMessage(msg) {
  const tsRaw = msg?.criado_em || msg?.timestamp || msg?.created_at
  if (!tsRaw) return true
  const ts = new Date(tsRaw).getTime()
  if (!Number.isFinite(ts)) return true
  return Date.now() - ts <= MAX_REALTIME_AGE_MS
}

/** Único critério para som + notificação desktop em mensagens inbound em tempo real. */
export function shouldNotifyIncomingMessage({ msg, selectedConversationId, currentPathname }) {
  const conversaId = normalize(msg?.conversa_id)
  if (!conversaId) return { notify: false, reason: "missing_conversation" }

  if (msg?.fromMe === true) return { notify: false, reason: "from_me" }

  const direction = normalize(msg?.direcao).toLowerCase()
  if (direction && direction !== "in") return { notify: false, reason: "non_inbound" }

  if (!isRealtimeFreshMessage(msg)) {
    return { notify: false, reason: "stale_history_message" }
  }

  const isOpenConversation = isConversationOpen(selectedConversationId, conversaId)
  const canSuppressByActiveContext =
    isOpenConversation && isConversationRouteActive(currentPathname) && isAppUiFullyFocusedForSuppress()
  if (canSuppressByActiveContext) {
    return { notify: false, reason: "active_focused_conversation" }
  }

  const key = makeIncomingDedupeKey(msg)
  if (markIfDuplicate(key)) return { notify: false, reason: "duplicate_event", key }

  return { notify: true, reason: "ok", key }
}
