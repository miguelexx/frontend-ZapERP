import api from "../api/http";

// Opções padrão de toda chamada de grupo. skipAuthLogout: um 401 aqui = canal Whapi
// desconectado (o backend já remapeia p/ 409), nunca sessão expirada — defesa em profundidade
// para nunca deslogar o usuário por causa do WhatsApp caído.
const OPTS = { skipGlobalNetworkToast: true, skipGlobal500Toast: true, skipAuthLogout: true };
const opts = (extra) => (extra ? { ...OPTS, ...extra } : { ...OPTS });

export async function getGrupoWhatsapp(conversaId, { resync = false } = {}) {
  const { data } = await api.get(`/chats/${conversaId}/grupo`, opts({ params: resync ? { resync: "1" } : undefined }));
  return data;
}

export async function updateGrupoWhatsapp(conversaId, body) {
  const { data } = await api.put(`/chats/${conversaId}/grupo`, body, opts());
  return data;
}

export async function updateGrupoSetting(conversaId, setting, policy) {
  const { data } = await api.patch(`/chats/${conversaId}/grupo/settings`, { setting, policy }, opts());
  return data;
}

export async function leaveGrupoWhatsapp(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/sair`, {}, opts());
  return data;
}

export async function getGrupoInvite(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/grupo/convite`, opts());
  return data;
}

export async function revokeGrupoInvite(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/convite`, opts());
  return data;
}

export async function sendGrupoInvite(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/convite/enviar`, { telefone }, opts());
  return data;
}

export async function addGrupoParticipante(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/participantes`, { telefone }, opts());
  return data;
}

export async function removeGrupoParticipante(conversaId, telefone) {
  const { data } = await api.delete(`/chats/${conversaId}/participantes`, opts({ data: { telefone } }));
  return data;
}

export async function promoteGrupoAdmin(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/admins`, { telefone }, opts());
  return data;
}

export async function demoteGrupoAdmin(conversaId, telefone) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/admins`, opts({ data: { telefone } }));
  return data;
}

export async function listGrupoSolicitacoes(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/grupo/solicitacoes`, opts());
  return data;
}

export async function approveGrupoSolicitacao(conversaId, application) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/solicitacoes`, { application }, opts());
  return data;
}

export async function rejectGrupoSolicitacao(conversaId, application) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/solicitacoes`, opts({ data: { application } }));
  return data;
}

export async function setGrupoFoto(conversaId, media, mimeType) {
  const body = { media };
  if (mimeType) body.mime_type = mimeType;
  const { data } = await api.put(`/chats/${conversaId}/grupo/foto`, body, opts());
  return data;
}

export async function removeGrupoFoto(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/foto`, opts());
  return data;
}

// --- Adição em massa (fila protegida / ritmo ultra-conservador) ---
export async function enfileirarParticipantesGrupo(conversaId, participantes = []) {
  const { data } = await api.post(`/chats/${conversaId}/participantes/fila`, { participantes }, opts());
  return data;
}

export async function listarFilaGrupo(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/participantes/fila`, opts());
  return data;
}

export async function cancelarFilaGrupo(conversaId, operacaoId) {
  const { data } = await api.post(`/chats/${conversaId}/participantes/fila/${operacaoId}/cancelar`, {}, opts());
  return data;
}
