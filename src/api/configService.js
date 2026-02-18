import api from './http'

export async function getEmpresa() {
  const { data } = await api.get('/config/empresa')
  return data
}

export async function putEmpresa(payload) {
  const { data } = await api.put('/config/empresa', payload)
  return data
}

export async function getPlanos() {
  const { data } = await api.get('/config/planos')
  return data || []
}

export async function getAuditoria(limit = 100) {
  const { data } = await api.get('/config/auditoria', { params: { limit } })
  return data || []
}

// Usuários (admin)
export async function getUsuarios() {
  const { data } = await api.get('/usuarios')
  return data || []
}

export async function criarUsuario(payload) {
  const { data } = await api.post('/usuarios', payload)
  return data
}

export async function atualizarUsuario(id, payload) {
  const { data } = await api.put(`/usuarios/${id}`, payload)
  return data
}

export async function redefinirSenha(id, nova_senha) {
  await api.post(`/usuarios/${id}/redefinir-senha`, { nova_senha })
}

export async function excluirUsuario(id) {
  await api.delete(`/usuarios/${id}`)
}

// Departamentos
export async function getDepartamentos() {
  const { data } = await api.get('/dashboard/departamentos')
  return data || []
}

export async function criarDepartamento(nome) {
  const { data } = await api.post('/dashboard/departamentos', { nome })
  return data
}

export async function atualizarDepartamento(id, nome) {
  const { data } = await api.put(`/dashboard/departamentos/${id}`, { nome })
  return data
}

export async function excluirDepartamento(id) {
  await api.delete(`/dashboard/departamentos/${id}`)
}

// Tags
export async function getTags() {
  const { data } = await api.get('/tags')
  return Array.isArray(data) ? data : (data?.tags || [])
}

export async function criarTag(nome, cor) {
  const { data } = await api.post('/tags', { nome, cor })
  return data?.tag || data
}

export async function atualizarTag(id, nome, cor) {
  const { data } = await api.put(`/tags/${id}`, { nome, cor })
  return data?.tag || data
}

export async function excluirTag(id) {
  await api.delete(`/tags/${id}`)
}

// Respostas salvas
export async function getRespostasSalvas(departamentoId) {
  const params = departamentoId ? { departamento_id: departamentoId } : {}
  const { data } = await api.get('/dashboard/respostas-salvas', { params })
  return data || []
}

export async function criarRespostaSalva(payload) {
  const { data } = await api.post('/dashboard/respostas-salvas', payload)
  return data
}

export async function atualizarRespostaSalva(id, payload) {
  const { data } = await api.put(`/dashboard/respostas-salvas/${id}`, payload)
  return data
}

export async function excluirRespostaSalva(id) {
  await api.delete(`/dashboard/respostas-salvas/${id}`)
}

// Multi-tenant WhatsApp (phone_number_id → company)
export async function getEmpresasWhatsapp() {
  const { data } = await api.get('/config/empresas-whatsapp')
  return data || []
}

export async function addEmpresaWhatsapp(payload) {
  const { data } = await api.post('/config/empresas-whatsapp', payload)
  return data
}

export async function removeEmpresaWhatsapp(id) {
  await api.delete(`/config/empresas-whatsapp/${id}`)
}

// Clientes (conectado à tabela clientes do banco)
export async function getClientes(params = {}) {
  const { data } = await api.get('/clientes', {
    // backend aceita até 2000
    params: { limit: 2000, ...params }
  })
  return data || []
}

export async function criarCliente(payload) {
  const { data } = await api.post('/clientes', payload)
  return data
}

export async function atualizarCliente(id, payload) {
  const { data } = await api.put(`/clientes/${id}`, payload)
  return data
}

export async function excluirCliente(id) {
  await api.delete(`/clientes/${id}`)
}

// Tags do cliente
export async function getClienteTags(clienteId) {
  const { data } = await api.get(`/clientes/${clienteId}/tags`)
  return data || []
}

export async function addClienteTag(clienteId, tagId) {
  const { data } = await api.post(`/clientes/${clienteId}/tags`, { tagId })
  return data
}

export async function removeClienteTag(clienteId, tagId) {
  const { data } = await api.delete(`/clientes/${clienteId}/tags/${tagId}`)
  return data
}
