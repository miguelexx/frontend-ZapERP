import api from './http'

const BASE = '/api/disparo'

export function disparoApiError(e) {
  return e?.response?.data?.error || e?.response?.data?.erro || e?.message || 'Erro ao comunicar com o servidor.'
}

export async function listarVariacoes(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/variacoes`)
  return data
}

export async function criarVariacao(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes`, payload)
  return data
}

export async function editarVariacao(campanhaId, varId, payload) {
  const { data } = await api.patch(`${BASE}/campanhas/${campanhaId}/variacoes/${varId}`, payload)
  return data
}

export async function duplicarVariacao(campanhaId, varId) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/${varId}/duplicar`)
  return data
}

export async function excluirVariacao(campanhaId, varId) {
  const { data } = await api.delete(`${BASE}/campanhas/${campanhaId}/variacoes/${varId}`)
  return data
}

export async function reordenarVariacoes(campanhaId, ordem) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/reordenar`, { ordem })
  return data
}

export async function uploadMidia(campanhaId, varId, file) {
  const form = new FormData()
  form.append('midia', file)
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/${varId}/midia`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function removerMidia(campanhaId, varId) {
  const { data } = await api.delete(`${BASE}/campanhas/${campanhaId}/variacoes/${varId}/midia`)
  return data
}

export async function catalogoVariaveis(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/variacoes/variaveis`)
  return data
}

export async function destinatariosSemVariavel(campanhaId, chave, params = {}) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/variacoes/variaveis/${chave}/sem-valor`, { params })
  return data
}

export async function salvarValoresPadrao(campanhaId, valores) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/valores-padrao`, { valores })
  return data
}

export async function previewDestinatario(campanhaId, destId, params = {}) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/variacoes/preview/${destId}`, { params })
  return data
}

export async function resumoMensagens(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/variacoes/resumo`)
  return data
}

export async function previewDistribuicaoVariacoes(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/preview-distribuicao`, payload)
  return data
}

export async function confirmarDistribuicaoVariacoes(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/confirmar-distribuicao`, payload)
  return data
}

export async function atribuirVariacaoManual(campanhaId, variacao_id, destinatario_ids) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/atribuir-manual`, { variacao_id, destinatario_ids })
  return data
}

export async function recalcularDistribuicaoVariacoes(campanhaId) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/variacoes/recalcular`)
  return data
}
