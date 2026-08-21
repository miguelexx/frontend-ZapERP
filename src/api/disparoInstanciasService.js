import api from './http'

const BASE = '/api/disparo'

export function disparoApiError(e) {
  return e?.response?.data?.error || e?.response?.data?.erro || e?.message || 'Erro ao comunicar com o servidor.'
}

export async function listarInstanciasDisponiveis(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/instancias/disponiveis`)
  return data
}

export async function resumoInstancias(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/instancias/resumo`)
  return data
}

export async function selecionarInstancias(campanhaId, instancia_ids) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/selecionar`, { instancia_ids })
  return data
}

export async function removerInstancia(campanhaId, instanciaId) {
  const { data } = await api.delete(`${BASE}/campanhas/${campanhaId}/instancias/${instanciaId}`)
  return data
}

export async function previewDistribuicao(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/preview-distribuicao`, payload)
  return data
}

export async function confirmarDistribuicao(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/confirmar-distribuicao`, payload)
  return data
}

export async function recalcularDistribuicao(campanhaId) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/recalcular`)
  return data
}

export async function atribuirManual(campanhaId, destinatario_ids, instancia_id) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/atribuir-manual`, { destinatario_ids, instancia_id })
  return data
}

export async function moverDestinatarios(campanhaId, destinatario_ids, instancia_destino_id) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/instancias/mover`, { destinatario_ids, instancia_destino_id })
  return data
}

export async function destinatariosNaoAtribuidos(campanhaId, params = {}) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/destinatarios/nao-atribuidos`, { params })
  return data
}
