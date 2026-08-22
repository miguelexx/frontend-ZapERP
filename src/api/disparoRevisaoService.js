import api from './http'

const base = (campanhaId) => `/api/disparo/campanhas/${campanhaId}/revisao`

export function disparoApiError(e) {
  return e?.response?.data?.error || e?.response?.data?.erro || e?.message || 'Erro ao comunicar com o servidor.'
}

export async function obterRevisao(campanhaId) {
  const { data } = await api.get(base(campanhaId))
  return data
}

export async function validarRevisao(campanhaId, body) {
  const { data } = await api.post(`${base(campanhaId)}/validar`, body ?? {})
  return data
}

export async function previaDestinatarios(campanhaId, params = {}) {
  const { data } = await api.get(`${base(campanhaId)}/previa`, { params })
  return data
}

export async function confirmarCampanha(campanhaId, body) {
  const { data } = await api.post(`${base(campanhaId)}/confirmar`, body)
  return data
}

export async function historicoRevisoes(campanhaId) {
  const { data } = await api.get(`${base(campanhaId)}/historico`)
  return data
}

export async function voltarEdicao(campanhaId, body) {
  const { data } = await api.post(`${base(campanhaId)}/voltar-edicao`, body)
  return data
}

export async function exportarResumo(campanhaId, format = 'json') {
  const fmt = String(format).toLowerCase() === 'csv' ? 'csv' : 'json'
  if (fmt === 'csv') {
    const { data } = await api.get(`${base(campanhaId)}/exportar`, {
      params: { format: 'csv' },
      responseType: 'blob',
    })
    return data
  }
  const { data } = await api.get(`${base(campanhaId)}/exportar`, { params: { format: 'json' } })
  return data
}

export async function estadoBloqueio(campanhaId) {
  const { data } = await api.get(`${base(campanhaId)}/bloqueio`)
  return data
}
