import api from "../api/http"

const capabilities = Object.freeze({
  mute: true,
  pin: true,
  favorite: true,
  clear: true,
  delete: true,
})

export function getConversationActionCapabilities() {
  return capabilities
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
