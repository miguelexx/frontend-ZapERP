// src/api/tagService.js
import api from "./http";

// named exports (usado no ConversaView.jsx)
export async function listarTags() {
  const { data } = await api.get("/tags");
  return data || [];
}

export async function criarTag(nome, cor = null) {
  const { data } = await api.post("/tags", { nome, cor });
  return data;
}

export async function adicionarTagConversa(conversaId, tagId) {
  const { data } = await api.post(`/chats/${conversaId}/tags`, { tag_id: tagId });
  return data;
}

export async function removerTagConversa(conversaId, tagId) {
  const { data } = await api.delete(`/chats/${conversaId}/tags/${tagId}`);
  return data;
}

// default export (usado no Atendimento.jsx antigo)
const tagService = {
  listar: listarTags,
  criar: criarTag,
};

export default tagService;
