import api from './http'

const BASE = '/api/disparo'

export function disparoApiError(error) {
  return error?.response?.data?.error || error?.message || 'Erro ao comunicar com o servidor.'
}

export async function listarCampanhas(params = {}) {
  const { data } = await api.get(`${BASE}/campanhas`, { params })
  return data
}

export async function resumoCampanhas() {
  const { data } = await api.get(`${BASE}/campanhas/resumo`)
  return data
}

export async function obterCampanha(id) {
  const { data } = await api.get(`${BASE}/campanhas/${id}`)
  return data
}

export async function criarCampanha(payload) {
  const { data } = await api.post(`${BASE}/campanhas`, payload)
  return data
}

export async function editarCampanha(id, payload) {
  const { data } = await api.patch(`${BASE}/campanhas/${id}`, payload)
  return data
}

export async function arquivarCampanha(id) {
  const { data } = await api.post(`${BASE}/campanhas/${id}/arquivar`)
  return data
}

export async function restaurarCampanha(id) {
  const { data } = await api.post(`${BASE}/campanhas/${id}/restaurar`)
  return data
}
