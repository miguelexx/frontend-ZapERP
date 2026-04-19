import api from "../api/http"

/** Normaliza resposta de PATCH /chats/:id/prefs para o formato da lista (`silenciado`, etc.). */
export function mergePrefsFromPatchResponse(data) {
  if (!data || typeof data !== "object") return {}
  const d = data
  const out = {}
  if (d.silenciada !== undefined) out.silenciado = !!d.silenciada
  else if (d.silenciado !== undefined) out.silenciado = !!d.silenciado
  if (d.fixada !== undefined) out.fixada = !!d.fixada
  if (d.favorita !== undefined) out.favorita = !!d.favorita
  if (d.fixada_em !== undefined) out.fixada_em = d.fixada_em
  return out
}

async function patchConversationPrefs(conversaId, partialPrefs) {
  const { data } = await api.patch(`/chats/${conversaId}/prefs`, partialPrefs)
  return data || {}
}

export async function toggleMuteConversation(conversaId, silenciada) {
  return patchConversationPrefs(conversaId, { silenciada: !!silenciada })
}

export async function togglePinConversation(conversaId, fixada) {
  return patchConversationPrefs(conversaId, { fixada: !!fixada })
}

export async function toggleFavoriteConversation(conversaId, favorita) {
  return patchConversationPrefs(conversaId, { favorita: !!favorita })
}

export async function clearConversation(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/limpar-mensagens`)
  return data || {}
}

export async function deleteConversation(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}`)
  return data || {}
}
