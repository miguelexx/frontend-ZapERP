const DEDUPE_TTL_MS = 6000
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

function makeNotificationKey(msg) {
  const conversaId = normalize(msg?.conversa_id)
  const messageId = normalize(msg?.id || msg?.mensagem_id || msg?.whatsapp_id)
  const tsBase = normalize(msg?.criado_em || msg?.timestamp || msg?.created_at)
  const tsBucket = tsBase ? Math.floor(new Date(tsBase).getTime() / 5000) : Math.floor(Date.now() / 5000)
  return `${conversaId}::${messageId || "sem_id"}::${tsBucket}`
}

function markIfDuplicate(key) {
  const now = Date.now()
  cleanupExpired(now)
  const exp = dedupeCache.get(key)
  if (exp && exp > now) return true
  dedupeCache.set(key, now + DEDUPE_TTL_MS)
  return false
}

function isWindowFocused() {
  if (typeof document === "undefined") return false
  const visible = document.visibilityState === "visible"
  const focused = typeof document.hasFocus === "function" ? document.hasFocus() : true
  return visible && focused
}

/**
 * Ponto único para decidir notificação visual de novas mensagens.
 */
export function shouldNotifyIncomingMessage({ msg, selectedConversationId }) {
  const conversaId = normalize(msg?.conversa_id)
  if (!conversaId) return { notify: false, reason: "missing_conversation" }

  if (msg?.fromMe === true) return { notify: false, reason: "from_me" }

  const direction = normalize(msg?.direcao).toLowerCase()
  if (direction && direction !== "in") return { notify: false, reason: "non_inbound" }

  const isOpenConversation = normalize(selectedConversationId) === conversaId
  if (isOpenConversation && isWindowFocused()) {
    return { notify: false, reason: "active_focused_conversation" }
  }

  const key = makeNotificationKey(msg)
  if (markIfDuplicate(key)) return { notify: false, reason: "duplicate_event", key }

  return { notify: true, reason: "ok", key }
}

