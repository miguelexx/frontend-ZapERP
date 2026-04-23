const OPEN_CONVERSATION_EVENT = "zaperp:open-conversation-from-notification"
const DESKTOP_DEDUPE_TTL_MS = 45_000
const desktopDedupe = new Map()

function normalize(value) {
  if (value == null) return ""
  return String(value).trim()
}

function cleanupDesktopDedupe(now = Date.now()) {
  for (const [key, exp] of desktopDedupe.entries()) {
    if (exp <= now) desktopDedupe.delete(key)
  }
}

function makeDesktopNotificationKey(msg) {
  const conversaId = normalize(msg?.conversa_id)
  const messageId = normalize(msg?.id || msg?.mensagem_id || msg?.whatsapp_id)
  const ts = normalize(msg?.criado_em || msg?.timestamp || msg?.created_at)
  return `${conversaId}::${messageId || "sem_id"}::${ts || "sem_ts"}`
}

function hasDesktopSupport() {
  return typeof window !== "undefined" && "Notification" in window
}

function toPublicAsset(url) {
  const v = normalize(url)
  if (!v) return "/brand/zaperp-favicon.svg"
  if (v.startsWith("http://") || v.startsWith("https://")) return v
  if (v.startsWith("/")) return v
  return `/${v}`
}

function buildMessagePreview(msg) {
  const tipo = normalize(msg?.tipo).toLowerCase()
  const textoBruto = normalize(msg?.texto || msg?.conteudo)
  if (textoBruto) return textoBruto.slice(0, 120)
  if (tipo === "imagem") return "📷 Imagem"
  if (tipo === "video") return "🎬 Vídeo"
  if (tipo === "sticker") return "🎭 Figurinha"
  if (tipo === "audio") return "🎵 Áudio"
  if (tipo === "arquivo") return "📎 Arquivo"
  if (tipo === "location") return "📍 Localização"
  return "Nova mensagem"
}

function markDesktopNotification(key) {
  const now = Date.now()
  cleanupDesktopDedupe(now)
  const exp = desktopDedupe.get(key)
  if (exp && exp > now) return false
  desktopDedupe.set(key, now + DESKTOP_DEDUPE_TTL_MS)
  return true
}

function requestNotificationPermissionSafely() {
  if (!hasDesktopSupport()) return
  if (Notification.permission !== "default") return
  Notification.requestPermission().catch(() => {})
}

function dispatchOpenConversation(conversaId) {
  if (typeof window === "undefined") return
  const id = normalize(conversaId)
  if (!id) return
  window.dispatchEvent(
    new CustomEvent(OPEN_CONVERSATION_EVENT, {
      detail: { conversaId: id },
    })
  )
}

/**
 * Notificação desktop para mensagens novas em tempo real.
 * Em navegador puro, a posição da notificação é controlada pelo SO.
 */
export function notifyIncomingDesktopMessage({ msg, contatoNome, avatarUrl, selectedConversationId, currentPathname }) {
  if (!hasDesktopSupport()) return { shown: false, reason: "unsupported" }
  if (Notification.permission === "denied") return { shown: false, reason: "permission_denied" }

  const conversaId = normalize(msg?.conversa_id)
  if (!conversaId) return { shown: false, reason: "missing_conversation" }

  const isFocusedWindow =
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    (typeof document.hasFocus === "function" ? document.hasFocus() : true)
  const isConversationRouteActive = normalize(currentPathname || window.location?.pathname).startsWith("/atendimento")
  const isSameConversation = normalize(selectedConversationId) === conversaId
  if (isFocusedWindow && isConversationRouteActive && isSameConversation) {
    return { shown: false, reason: "active_focused_conversation" }
  }

  if (Notification.permission === "default") {
    requestNotificationPermissionSafely()
    return { shown: false, reason: "permission_pending" }
  }

  const dedupeKey = makeDesktopNotificationKey(msg)
  if (!markDesktopNotification(dedupeKey)) return { shown: false, reason: "duplicate_event" }

  const title = normalize(contatoNome) || "Nova mensagem"
  const preview = buildMessagePreview(msg)
  const body = `${preview}\nConversa #${conversaId}`
  const icon = toPublicAsset(avatarUrl)
  const tag = `incoming_msg_${conversaId}`

  try {
    const notification = new Notification(title, {
      body,
      icon,
      tag,
      renotify: false,
      requireInteraction: false,
      data: { conversaId },
    })

    notification.onclick = () => {
      try {
        window.focus()
      } catch (_) {}
      dispatchOpenConversation(conversaId)
      notification.close()
    }

    setTimeout(() => {
      try {
        notification.close()
      } catch (_) {}
    }, 8_000)

    return { shown: true, reason: "ok" }
  } catch {
    return { shown: false, reason: "creation_failed" }
  }
}

export function getOpenConversationNotificationEventName() {
  return OPEN_CONVERSATION_EVENT
}

