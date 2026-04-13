/** @param {unknown} raw @param {string | number | null | undefined} myUserId */
export function normalizeInternalMessage(raw, myUserId) {
  if (!raw || typeof raw !== "object") return null
  const o = /** @type {Record<string, unknown>} */ (raw)
  const id = o.id ?? o.message_id ?? o.uuid
  if (id == null || id === "") return null
  const senderId = String(o.sender_id ?? o.user_id ?? o.usuario_id ?? o.from_user_id ?? o.author_id ?? "")
  const me = myUserId != null ? String(myUserId) : ""
  const mine = Boolean(me && senderId && senderId === me)
  const content = String(o.content ?? o.body ?? o.text ?? o.mensagem ?? "").trim()
  const createdAt = o.created_at ?? o.createdAt ?? o.timestamp ?? o.data_criacao ?? null
  return {
    id: String(id),
    senderId,
    content,
    createdAt,
    mine,
  }
}

export function formatMessageTime(iso) {
  if (iso == null || iso === "") return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Ordem cronológica crescente (antigas primeiro) */
export function sortMessagesAsc(list) {
  return [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return ta - tb
  })
}

/** Insere ou substitui por id, ordena ascendente. */
export function upsertMessageSorted(prev, msg) {
  const map = new Map(prev.map((m) => [m.id, m]))
  map.set(msg.id, msg)
  return sortMessagesAsc(Array.from(map.values()))
}
