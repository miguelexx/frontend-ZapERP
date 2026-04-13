/** @param {unknown} a @param {unknown} b */
export function sameUserId(a, b) {
  if (a == null || b == null || a === "" || b === "") return false
  if (String(a) === String(b)) return true
  const na = Number(a)
  const nb = Number(b)
  return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb
}

/**
 * @param {{ mine: boolean, senderId?: string }} m
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId
 */
export function isMessageMine(m, myUserId, otherUserId) {
  if (myUserId != null && m.senderId && sameUserId(m.senderId, myUserId)) return true
  if (otherUserId != null && m.senderId && sameUserId(m.senderId, otherUserId)) return false
  return Boolean(m.mine)
}

/**
 * @param {unknown} raw
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId — participante da conversa (evita ambiguidade se o API omitir flags)
 */
export function normalizeInternalMessage(raw, myUserId, otherUserId = null) {
  if (!raw || typeof raw !== "object") return null
  const o = /** @type {Record<string, unknown>} */ (raw)
  const id = o.id ?? o.message_id ?? o.uuid
  if (id == null || id === "") return null

  const nested = o.sender ?? o.user ?? o.usuario ?? o.author
  const nestedId =
    nested && typeof nested === "object"
      ? /** @type {Record<string, unknown>} */ (nested).id ??
        /** @type {Record<string, unknown>} */ (nested).user_id ??
        /** @type {Record<string, unknown>} */ (nested).usuario_id
      : null

  const senderRaw = o.sender_id ?? o.user_id ?? o.usuario_id ?? o.from_user_id ?? o.author_id ?? nestedId
  const senderId = senderRaw != null && senderRaw !== "" ? String(senderRaw) : ""

  const fromMeFlag = o.from_me === true || o.fromMe === true || o.is_mine === true || o.mine === true
  const fromThemFlag = o.from_me === false || o.fromMe === false || o.is_mine === false
  const outDir =
    String(o.direction ?? o.direcao ?? o.side ?? "")
      .toLowerCase()
      .trim() === "out"

  let mine = false
  if (fromThemFlag) mine = false
  else if (fromMeFlag) mine = true
  else if (outDir) mine = true
  else if (myUserId != null && senderId) mine = sameUserId(senderId, myUserId)

  if (otherUserId != null && senderId && sameUserId(senderId, otherUserId)) mine = false

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
