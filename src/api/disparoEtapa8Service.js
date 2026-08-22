import api from './http'

const BASE = '/api/disparo'

export function disparoEtapa8ApiError(error) {
  return error?.response?.data?.error || error?.message || 'Erro ao comunicar com o servidor.'
}

const campanhaBase = (campanhaId) => `${BASE}/campanhas/${campanhaId}`

// ── Config opt-out ───────────────────────────────────────────────────────────

export async function getOptOutConfig() {
  const { data } = await api.get(`${BASE}/config/optout`)
  return data
}

export async function putOptOutConfig(payload) {
  const { data } = await api.put(`${BASE}/config/optout`, payload)
  return data
}

// ── Opt-outs ───────────────────────────────────────────────────────────────────

export async function listOptOuts(params = {}) {
  const { data } = await api.get(`${BASE}/optouts`, { params })
  return data
}

export async function reativarOptOut(payload) {
  const { data } = await api.post(`${BASE}/optouts/reativar`, payload)
  return data
}

// ── Respostas ──────────────────────────────────────────────────────────────────

export async function listRespostas(campanhaId, params = {}) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/respostas`, { params })
  return data
}

// ── Incertos / reconciliação ───────────────────────────────────────────────────

export async function listIncertos(campanhaId, params = {}) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/incertos`, { params })
  return data
}

export async function reconciliar(campanhaId, body = {}) {
  const { data } = await api.post(`${campanhaBase(campanhaId)}/reconciliar`, body)
  return data
}

export async function decisaoIncerto(campanhaId, itemId, payload) {
  const { data } = await api.post(
    `${campanhaBase(campanhaId)}/incertos/${itemId}/decisao`,
    payload,
  )
  return data
}

// ── Relatório ──────────────────────────────────────────────────────────────────

export async function getRelatorio(campanhaId) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/relatorio`)
  return data
}

export async function metricasInstancias(campanhaId) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/relatorio/instancias`)
  return data
}

export async function metricasVariacoes(campanhaId) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/relatorio/variacoes`)
  return data
}

export async function erros(campanhaId) {
  const { data } = await api.get(`${campanhaBase(campanhaId)}/relatorio/erros`)
  return data
}

// ── Exportação ─────────────────────────────────────────────────────────────────

export async function exportRelatorio(campanhaId, tipo, { mask = false, format = 'csv' } = {}) {
  const params = { format }
  if (mask) params.mask = '1'

  const fmt = String(format).toLowerCase() === 'csv' ? 'csv' : 'json'

  if (fmt === 'csv') {
    const { data } = await api.get(`${campanhaBase(campanhaId)}/export/${tipo}`, {
      params,
      responseType: 'blob',
    })
    return data
  }

  const { data } = await api.get(`${campanhaBase(campanhaId)}/export/${tipo}`, { params })
  return data
}
