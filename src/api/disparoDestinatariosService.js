import api from './http'

const BASE = '/api/disparo'

export function disparoApiError(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.erro ||
    error?.message ||
    'Erro ao comunicar com o servidor.'
  )
}

// ── Contatos ZapERP ──────────────────────────────────────────────────────────

export async function buscarContatos(campanhaId, params = {}) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/contatos`, { params })
  return data
}

// ── Destinatários da campanha ────────────────────────────────────────────────

export async function listarDestinatarios(campanhaId, params = {}) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/destinatarios`, { params })
  return data
}

export async function resumoDestinatarios(campanhaId) {
  const { data } = await api.get(`${BASE}/campanhas/${campanhaId}/destinatarios/resumo`)
  return data
}

// ── Adicionar contatos salvos ────────────────────────────────────────────────

export async function addContatos(campanhaId, payload) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/destinatarios/add-contatos`, payload)
  return data
}

// ── Importação de planilha ───────────────────────────────────────────────────

export async function previewImportacao(campanhaId, formData) {
  const { data } = await api.post(
    `${BASE}/campanhas/${campanhaId}/destinatarios/preview`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function confirmarImportacao(campanhaId, formData) {
  const { data } = await api.post(
    `${BASE}/campanhas/${campanhaId}/destinatarios/confirmar-importacao`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

// ── Remoção ──────────────────────────────────────────────────────────────────

export async function removerDestinatario(campanhaId, destId) {
  const { data } = await api.delete(`${BASE}/campanhas/${campanhaId}/destinatarios/${destId}`)
  return data
}

export async function removerVarios(campanhaId, ids) {
  const { data } = await api.post(`${BASE}/campanhas/${campanhaId}/destinatarios/remover-varios`, { ids })
  return data
}

export async function limparDestinatarios(campanhaId) {
  const { data } = await api.delete(`${BASE}/campanhas/${campanhaId}/destinatarios?confirmado=true`)
  return data
}

// ── Utilitário: gerar CSV de rejeitados no frontend ──────────────────────────

export function gerarCsvRejeitados(rejeitados = []) {
  const header = 'Linha,Nome,Telefone,Motivo'
  const rows = rejeitados.map(r =>
    [r.linha ?? '', r.nome ?? '', r.telefone ?? '', r.motivo ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header, ...rows].join('\n')
}

export function downloadCsvRejeitados(rejeitados = [], filename = 'rejeitados.csv') {
  const csv = gerarCsvRejeitados(rejeitados)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
