import api from "../api/http";

export async function getGrupoWhatsapp(conversaId, { resync = false } = {}) {
  const { data } = await api.get(`/chats/${conversaId}/grupo`, {
    params: resync ? { resync: "1" } : undefined,
    skipGlobalNetworkToast: true,
    skipGlobal500Toast: true,
  });
  return data;
}

export async function updateGrupoWhatsapp(conversaId, body) {
  const { data } = await api.put(`/chats/${conversaId}/grupo`, body, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function updateGrupoSetting(conversaId, setting, policy) {
  const { data } = await api.patch(`/chats/${conversaId}/grupo/settings`, { setting, policy }, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function leaveGrupoWhatsapp(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/sair`, {}, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function getGrupoInvite(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/grupo/convite`, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function revokeGrupoInvite(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/convite`, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function sendGrupoInvite(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/convite/enviar`, { telefone }, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function addGrupoParticipante(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/participantes`, { telefone }, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function removeGrupoParticipante(conversaId, telefone) {
  const { data } = await api.delete(`/chats/${conversaId}/participantes`, { data: { telefone }, skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function promoteGrupoAdmin(conversaId, telefone) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/admins`, { telefone }, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function demoteGrupoAdmin(conversaId, telefone) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/admins`, { data: { telefone }, skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function listGrupoSolicitacoes(conversaId) {
  const { data } = await api.get(`/chats/${conversaId}/grupo/solicitacoes`, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function approveGrupoSolicitacao(conversaId, application) {
  const { data } = await api.post(`/chats/${conversaId}/grupo/solicitacoes`, { application }, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function rejectGrupoSolicitacao(conversaId, application) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/solicitacoes`, { data: { application }, skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function setGrupoFoto(conversaId, media, mimeType) {
  const body = { media };
  if (mimeType) body.mime_type = mimeType;
  const { data } = await api.put(`/chats/${conversaId}/grupo/foto`, body, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}

export async function removeGrupoFoto(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}/grupo/foto`, { skipGlobalNetworkToast: true, skipGlobal500Toast: true });
  return data;
}
