import api from './http'

const base = (campanhaId) => `/api/disparo/campanhas/${campanhaId}/limites`

export function disparoApiError(e) {
  return e?.response?.data?.error || e?.response?.data?.erro || e?.message || 'Erro ao comunicar com o servidor.'
}

export async function obterConfigLimites(campanhaId) {
  const { data } = await api.get(base(campanhaId))
  return data
}

export async function salvarLimitesGlobais(campanhaId, body) {
  const { data } = await api.post(base(campanhaId), body)
  return data
}

export async function salvarLimitesInstancias(campanhaId, { instancias }) {
  const { data } = await api.post(`${base(campanhaId)}/instancias`, { instancias })
  return data
}

export async function salvarJanelas(campanhaId, { janelas, instancia_id }) {
  const { data } = await api.post(`${base(campanhaId)}/janelas`, { janelas, instancia_id })
  return data
}

export async function salvarAgendamento(campanhaId, body) {
  const { data } = await api.post(`${base(campanhaId)}/agendamento`, body)
  return data
}

export async function cancelarAgendamento(campanhaId) {
  const { data } = await api.post(`${base(campanhaId)}/agendamento/cancelar`)
  return data
}

export async function validarConfigLimites(campanhaId, body) {
  const { data } = await api.post(`${base(campanhaId)}/validar`, body ?? {})
  return data
}

export async function localizarConflitos(campanhaId) {
  const { data } = await api.get(`${base(campanhaId)}/conflitos`)
  return data
}

export async function simular(campanhaId) {
  const { data } = await api.post(`${base(campanhaId)}/simular`)
  return data
}

export async function confirmarLimites(campanhaId) {
  const { data } = await api.post(`${base(campanhaId)}/confirmar`)
  return data
}

export async function necessidadeRevisao(campanhaId) {
  const { data } = await api.get(`${base(campanhaId)}/revisao`)
  return data
}
