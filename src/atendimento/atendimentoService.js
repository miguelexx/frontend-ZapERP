import api from '../api/http'

export async function assumirConversa(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/assumir`)
  return data
}

export async function encerrarConversa(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/encerrar`)
  return data
}
