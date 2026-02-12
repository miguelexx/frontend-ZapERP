import api from "../api/http";

// Observação do cliente (rota existente no backend)
export const salvarObservacao = (id, observacao) =>
  api.put(`/chats/${id}/observacao`, { observacao });

// Responsável: use assumirChat(conversaId) ou transferirChat(conversaId, usuarioId)
// Não existe PUT /chats/:id/responsavel no backend.
// export const salvarResponsavel = ...

// Origem: rota não implementada no backend (sem PUT /chats/:id/origem).
// export const salvarOrigem = ...


// ✅ NOVO (compatível com o erro atual do store)
// Permite também paginação futura: cursor/limit (se seu backend suportar)
export async function getChatById(conversaId, opts = {}) {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", String(opts.cursor));
  if (opts?.limit) params.set("limit", String(opts.limit));

  const qs = params.toString();
  const { data } = await api.get(`/chats/${conversaId}${qs ? `?${qs}` : ""}`);
  return data;
}

// ✅ Mantido (não remover): compatibilidade com código antigo
export async function fetchConversa(conversaId) {
  return getChatById(conversaId);
}

export async function enviarMensagem(conversaId, texto, reply_meta) {
  const body = { texto };
  if (reply_meta && typeof reply_meta === "object") body.reply_meta = reply_meta;
  const { data } = await api.post(`/chats/${conversaId}/mensagens`, body);
  return data;
}

export async function excluirMensagem(conversaId, mensagemId) {
  const { data } = await api.delete(`/chats/${conversaId}/mensagens/${mensagemId}`);
  return data;
}

export async function assumirChat(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/assumir`);
  return data;
}

export async function encerrarChat(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/encerrar`);
  return data;
}

export async function reabrirChat(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/reabrir`);
  return data;
}

// ✅ Mantido: compatível com seu backend
export async function transferirChat(conversaId, novo_atendente_id, observacao) {
  const body = {
    para_usuario_id: Number(novo_atendente_id),
    observacao: observacao || null,
  };

  const { data } = await api.post(`/chats/${conversaId}/transferir`, body);
  return data;
}

export async function listarAtendimentos(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/atendimentos`);
  return data || [];
}

export async function puxarChatFila() {
  const { data } = await api.post("/chats/puxar");
  return data; // { conversa_id }
}

// TAGS
export async function adicionarTagConversa(conversaId, tagId) {
  const { data } = await api.post(`/chats/${conversaId}/tags`, { tag_id: tagId });
  return data;
}

export async function removerTagConversa(conversaId, tagId) {
  const { data } = await api.delete(`/chats/${conversaId}/tags/${tagId}`);
  return data;
}
