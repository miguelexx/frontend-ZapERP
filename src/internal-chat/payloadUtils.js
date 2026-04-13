/** @param {unknown} payload */
export function unwrapPayload(payload) {
  if (payload && typeof payload === "object" && "data" in /** @type {object} */ (payload)) {
    return /** @type {Record<string, unknown>} */ (payload).data
  }
  return payload
}

/** @param {unknown} payload */
export function extractConversationIdFromPayload(payload) {
  const p = unwrapPayload(payload)
  if (!p || typeof p !== "object") return null
  const o = /** @type {Record<string, unknown>} */ (p)
  let id = o.conversation_id ?? o.conversationId ?? o.internal_conversation_id
  if (id == null || id === "") {
    const msg = o.message ?? o.mensagem ?? o.msg
    if (msg && typeof msg === "object") {
      const m = /** @type {Record<string, unknown>} */ (msg)
      id = m.conversation_id ?? m.conversationId ?? m.internal_conversation_id
    }
  }
  if (id == null || id === "") return null
  return String(id)
}

/** @param {unknown} payload */
export function extractMessageFromPayload(payload) {
  const p = unwrapPayload(payload)
  if (!p || typeof p !== "object") return null
  const o = /** @type {Record<string, unknown>} */ (p)
  const nested = o.message ?? o.mensagem ?? o.msg
  if (nested && typeof nested === "object") return nested
  if (o.content != null || o.text != null || o.body != null || o.sender_id != null || o.user_id != null) return p
  return null
}

/** @param {unknown} payload — conversation_read */
export function extractReadPayload(payload) {
  const p = unwrapPayload(payload)
  if (!p || typeof p !== "object") return null
  return /** @type {Record<string, unknown>} */ (p)
}
