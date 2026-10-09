// src/comunidades/comunidadesService.js
// Camada de API das Comunidades. Auth automático via interceptor de ../api/http.
import api from "../api/http";

const enc = (s) => encodeURIComponent(String(s || ""));
const inst = (instanceId) =>
  instanceId != null && String(instanceId).trim() !== "" ? { whatsapp_instance_id: Number(instanceId) } : {};

// ---- comunidades
export async function listarComunidades(instanceId, { signal } = {}) {
  const { data } = await api.get("/comunidades", { params: inst(instanceId), signal, silent: true });
  return data;
}

export async function criarComunidade({ nome, descricao, instanceId }) {
  const { data } = await api.post("/comunidades", { nome, descricao, ...inst(instanceId) });
  return data;
}

export async function obterComunidade(cid, instanceId, { signal } = {}) {
  const { data } = await api.get(`/comunidades/${enc(cid)}`, { params: inst(instanceId), signal, silent: true });
  return data;
}

export async function listarSubgrupos(cid, instanceId, { signal } = {}) {
  const { data } = await api.get(`/comunidades/${enc(cid)}/subgrupos`, { params: inst(instanceId), signal, silent: true });
  return data;
}

export async function configurarComunidade(cid, { setting, policy, instanceId }) {
  const { data } = await api.patch(`/comunidades/${enc(cid)}/settings`, { setting, policy, ...inst(instanceId) });
  return data;
}

export async function desativarComunidade(cid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}`, { data: inst(instanceId) });
  return data;
}

// ---- grupos
export async function criarGrupoNaComunidade(cid, { nome, participantes = [], isHidden, instanceId }) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/grupos`, { nome, participantes, isHidden, ...inst(instanceId) });
  return data;
}

export async function vincularGrupo(cid, gid, instanceId) {
  const { data } = await api.put(`/comunidades/${enc(cid)}/grupos/${enc(gid)}`, { ...inst(instanceId) });
  return data;
}

export async function desvincularGrupo(cid, gid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/grupos/${enc(gid)}`, { data: inst(instanceId) });
  return data;
}

// ---- admins (direto)
export async function promoverAdmin(cid, participantes, instanceId) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/admins`, { participantes, ...inst(instanceId) });
  return data;
}

export async function rebaixarAdmin(cid, participantes, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/admins`, { data: { participantes, ...inst(instanceId) } });
  return data;
}

// ---- convite
export async function obterConvite(cid, instanceId) {
  const { data } = await api.get(`/comunidades/${enc(cid)}/convite`, { params: inst(instanceId), silent: true });
  return data;
}

export async function revogarConvite(cid, instanceId) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/convite`, { data: inst(instanceId) });
  return data;
}

// ---- fila (adição/remoção em massa — protegida)
export async function enfileirarParticipantes(cid, { participantes = [], instanceId, comunidadeNome }) {
  const { data } = await api.post(`/comunidades/${enc(cid)}/participantes`, {
    participantes, comunidade_nome: comunidadeNome, ...inst(instanceId),
  });
  return data;
}

export async function enfileirarRemocao(cid, { participantes = [], instanceId }) {
  const { data } = await api.delete(`/comunidades/${enc(cid)}/participantes`, {
    data: { participantes, ...inst(instanceId) },
  });
  return data;
}

// ---- operações (progresso)
export async function listarOperacoes({ limit } = {}) {
  const { data } = await api.get("/comunidades/operacoes", { params: limit ? { limit } : {}, silent: true });
  return data;
}

export async function obterOperacao(id, { signal } = {}) {
  const { data } = await api.get(`/comunidades/operacoes/${enc(id)}`, { signal, silent: true });
  return data;
}

export async function pausarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/pausar`);
  return data;
}

export async function retomarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/retomar`);
  return data;
}

export async function cancelarOperacao(id) {
  const { data } = await api.post(`/comunidades/operacoes/${enc(id)}/cancelar`);
  return data;
}
