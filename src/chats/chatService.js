// src/chats/chatService.js
import api from "../api/http";

// 🔹 EXPORTS NOMEADOS (usados no ChatList.jsx)
// pesquisa avançada: tag_id, data_inicio, data_fim, status_atendimento, atendente_id, palavra
export async function fetchChats(params = {}) {
  const q = new URLSearchParams();
  if (params.tag_id != null && params.tag_id !== "" && params.tag_id !== "todas") q.set("tag_id", params.tag_id);
  if (params.departamento_id != null && params.departamento_id !== "" && params.departamento_id !== "todos") q.set("departamento_id", params.departamento_id);
  if (params.data_inicio) q.set("data_inicio", params.data_inicio);
  if (params.data_fim) q.set("data_fim", params.data_fim);
  if (params.status_atendimento && params.status_atendimento !== "todos") q.set("status_atendimento", params.status_atendimento);
  if (params.atendente_id != null && params.atendente_id !== "" && params.atendente_id !== "todos") q.set("atendente_id", params.atendente_id);
  if (params.palavra && String(params.palavra).trim()) q.set("palavra", String(params.palavra).trim());
  if (params.incluir_todos_clientes === true || params.incluir_todos_clientes === "1") q.set("incluir_todos_clientes", "1");
  const query = q.toString();
  const { data } = await api.get(`/chats${query ? `?${query}` : ""}`);
  return data || [];
}

export async function fetchChatById(id) {
  const { data } = await api.get(`/chats/${id}`);
  return data;
}

export async function enviarMensagem(id, texto) {
  const { data } = await api.post(`/chats/${id}/mensagens`, { texto });
  return data;
}

export async function aplicarTag(id, tag_id) {
  const { data } = await api.post(`/chats/${id}/tags`, { tag_id });
  return data;
}

export async function removerTag(id, tag_id) {
  const { data } = await api.delete(`/chats/${id}/tags/${tag_id}`);
  return data;
}
// ===============================
// GRUPOS / COMUNIDADES
// ===============================

export async function criarGrupo(nome) {
  const { data } = await api.post("/chats/grupos", { nome });
  return data;
}

export async function criarComunidade(nome) {
  const { data } = await api.post("/chats/comunidades", { nome });
  return data;
}
export async function criarContato(nome, telefone) {
  const { data } = await api.post("/chats/contato", { nome, telefone });
  return data;
}

/** Abre (ou cria) conversa para um cliente da lista — retorna a conversa para abrir no atendimento */
export async function abrirConversaCliente(cliente_id) {
  const { data } = await api.post("/chats/abrir-conversa", { cliente_id });
  return data;
}

/** Sincroniza contatos do celular conectado (Z-API Get contacts) → clientes + fotos */
export async function sincronizarContatos() {
  const { data } = await api.post("/chats/sincronizar-contatos");
  return data;
}

/** Sincroniza fotos de perfil de todos os clientes (Z-API Get profile-picture) */
export async function sincronizarFotosPerfil() {
  const { data } = await api.post("/chats/sincronizar-fotos-perfil");
  return data;
}

/** Verifica se a instância Z-API está conectada ao WhatsApp */
export async function getZapiStatus() {
  const { data } = await api.get("/chats/zapi-status");
  return data;
}

// 🔹 DEFAULT EXPORT (usado no Atendimento.jsx e wrappers)
const chatService = {
  listar: fetchChats,
  detalhar: fetchChatById,
  enviarMensagem,
  aplicarTag,
  removerTag,

  // novos
  criarGrupo,
  criarComunidade,
  criarContato

};


export default chatService;
