import api from './http'

export async function getOverview() {
  const { data } = await api.get('/dashboard/overview')
  return data
}

export async function getDepartamentos() {
  const { data } = await api.get('/dashboard/departamentos')
  return data || []
}

export async function getRespostasSalvas(departamentoId = null) {
  const params = departamentoId ? { departamento_id: departamentoId } : {}
  const { data } = await api.get('/dashboard/respostas-salvas', { params })
  return data || []
}

export async function criarRespostaSalva(payload) {
  const { data } = await api.post('/dashboard/respostas-salvas', payload)
  return data
}

export async function getRelatorioConversas(params = {}) {
  const { data } = await api.get('/dashboard/relatorios/conversas', { params })
  return data || []
}

/** Faz download do arquivo (CSV, Excel ou PDF). Retorna nome do arquivo sugerido. */
export async function exportRelatorio(format, params = {}) {
  const f = (format || 'csv').toLowerCase()
  const { data } = await api.get('/dashboard/relatorios/export', {
    params: { ...params, format: f === 'excel' ? 'xlsx' : f },
    responseType: 'blob',
  })
  const ext = f === 'xlsx' || f === 'excel' ? 'xlsx' : f === 'pdf' ? 'pdf' : 'csv'
  const filename = `relatorio-conversas.${ext}`
  const url = URL.createObjectURL(new Blob([data]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

export async function getSlaConfig() {
  const { data } = await api.get('/dashboard/sla/config')
  return data
}

export async function setSlaConfig(minutos) {
  const { data } = await api.put('/dashboard/sla/config', {
    sla_minutos_sem_resposta: minutos,
  })
  return data
}

export async function getSlaAlertas() {
  const { data } = await api.get('/dashboard/sla/alertas')
  return data || { limite_min: 30, alertas: [] }
}

/** Lista atendentes (para filtros de relatório) */
export async function getUsuarios() {
  const { data } = await api.get('/usuarios')
  return data || []
}
