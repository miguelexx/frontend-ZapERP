// src/comunidades/comunidadesService.js
// Camada de API das Comunidades. Auth automático via interceptor de ../api/http.
// skipAuthLogout: um 401 aqui = canal Whapi desconectado, NÃO sessão expirada —
// nunca deve deslogar o admin nem redirecionar para /login.
import api from "../api/http";

const enc = (s) => encodeURIComponent(String(s || ""));
const inst = (instanceId) =>
  instanceId != null && String(instanceId).trim() !== "" ? { whatsapp_instance_id: Number(instanceId) } : {};

// config base aplicada a toda requisição do módulo
const base = (extra = {}) => ({ skipAuthLogout: true, silent: true, ...extra });

// ---- comunidades
export async function listarComunidades(instanceId, { signal } = {}) {
  const { data } = await api.get("/comunidades", base({ params: inst(instanceId), signal }));
  return data;
}

export async function criarComunidade({ nome, descricao, instanceId }) {
  const { data } = await api.post("/comunidades", { nome, descricao, ...inst(instanceId) }, base());
  return data;
}

export async function obterComunidade(cid, instanceId, { signal } = {}) {
  const { data } = await api.get(`/comunidades/${enc(cid)}`, base({ params: inst(instanceId), signal }));
  return data;
}

export async function listarSubgrupos(cid, instanceId, { signal } = {}) {
  const { data } = await api.get(`/comunidades/${enc(cid)}/subgrupos`, base({ params: inst(instanceId), signal }));
  return data;
}

export async function configurarComunidade(cid, { setting, policy, instanceId }) {
  const { data } = await api.patch(`/comunidades/${enc(cid)}/settings`, { setting, policy, ...inst(instanceId) }, base());
  return data;
}

// Apaga a comunidade: desativa no WhatsApp (some para todos, inclusive no celular
// conectado) e remove do sistema (fila cancelada + não volta a ser listada).
export async function apagarComunidade(cid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}`, base({ data: inst(instanceId) }));
  return data;
}

// ---- grupos
export async function criarGrupoNaComunidade(cid, { nome, participantes = [], isHidden, instanceId }) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/grupos`, { nome, participantes, isHidden, ...inst(instanceId) }, base());
  return data;
}

export async function vincularGrupo(cid, gid, instanceId) {
  const { data } = await api.put(`/comunidades/${enc(cid)}/grupos/${enc(gid)}`, { ...inst(instanceId) }, base());
  return data;
}

export async function desvincularGrupo(cid, gid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/grupos/${enc(gid)}`, base({ data: inst(instanceId) }));
  return data;
}

// ---- admins (direto)
export async function promoverAdmin(cid, participantes, instanceId) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/admins`, { participantes, ...inst(instanceId) }, base());
  return data;
}

export async function rebaixarAdmin(cid, participantes, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/admins`, base({ data: { participantes, ...inst(instanceId) } }));
  return data;
}

// ---- convite
export async function obterConvite(cid, instanceId) {
  const { data } = await api.get(`/comunidades/${enc(cid)}/convite`, base({ params: inst(instanceId) }));
  return data;
}

export async function revogarConvite(cid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/convite`, base({ data: inst(instanceId) }));
  return data;
}

// ---- fila (adição/remoção em massa — protegida)
export async function enfileirarParticipantes(cid, { participantes = [], instanceId, comunidadeNome }) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/participantes`, {
    participantes, comunidade_nome: comunidadeNome, ...inst(instanceId),
  }, base());
  return data;
}

export async function enfileirarRemocao(cid, { participantes = [], instanceId }) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/participantes`, base({ data: { participantes, ...inst(instanceId) } }));
  return data;
}

// ---- operações (progresso) — não tocam o provider; mesmo assim não deslogam
export async function listarOperacoes({ limit } = {}) {
  const { data } = await api.get("/comunidades/operacoes", base({ params: limit ? { limit } : {} }));
  return data;
}

export async function obterOperacao(id, { signal } = {}) {
  const { data } = await api.get(`/comunidades/operacoes/${enc(id)}`, base({ signal }));
  return data;
}

export async function pausarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/pausar`, {}, base());
  return data;
}

export async function retomarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/retomar`, {}, base());
  return data;
}

export async function cancelarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/cancelar`, {}, base());
  return data;
}
