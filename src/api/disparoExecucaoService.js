import api from './http'

const BASE = '/api/disparo'

export function disparoApiError(error) {
  return error?.response?.data?.error || error?.message || 'Erro ao comunicar com o servidor.'
}

const execBase = (campanhaId) => `${BASE}/campanhas/${campanhaId}/execucao`

export async function iniciarCampanha(id) {
  const { data } = await api.post(`${execBase(id)}/iniciar`)
  return data
}

export async function obterExecucao(id) {
  const { data } = await api.get(execBase(id))
  return data
}

export async function resumoExecucao(id) {
  const { data } = await api.get(`${execBase(id)}/resumo`)
  return data
}

export async function listarFila(id, params = {}) {
  const { data } = await api.get(`${execBase(id)}/fila`, { params })
  return data
}

export async function listarEventos(id, params = {}) {
  const { data } = await api.get(`${execBase(id)}/eventos`, { params })
  return data
}

export async function saudeInstancias(id) {
  const { data } = await api.get(`${execBase(id)}/instancias`)
  return data
}

export async function pausar(id, body = {}) {
  const { data } = await api.post(`${execBase(id)}/pausar`, body)
  return data
}

export async function continuar(id) {
  const { data } = await api.post(`${execBase(id)}/continuar`)
  return data
}

export async function cancelar(id, body = { confirmacao: true }) {
  const { data } = await api.post(`${execBase(id)}/cancelar`, body)
  return data
}

export async function emergencia(body = { confirmacao: 'EMERGENCIA' }) {
  const { data } = await api.post(`${BASE}/execucao/emergencia`, body)
  return data
}

export async function reprocessarFalhas(id, body = {}) {
  const { data } = await api.post(`${execBase(id)}/reprocessar-falhas`, body)
  return data
}

export async function saudeWorker() {
  const { data } = await api.get(`${BASE}/worker/saude`)
  return data
}

export async function listarExclusoes(params = {}) {
  const { data } = await api.get(`${BASE}/exclusoes`, { params })
  return data
}

export async function adicionarExclusao(payload) {
  const { data } = await api.post(`${BASE}/exclusoes`, payload)
  return data
}

export async function removerExclusao(exclId) {
  const { data } = await api.delete(`${BASE}/exclusoes/${exclId}`)
  return data
}

export async function importarExclusoes(payload) {
  const { data } = await api.post(`${BASE}/exclusoes/importar`, payload)
  return data
}
