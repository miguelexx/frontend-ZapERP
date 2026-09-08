import api from "./http";

const WHATSAPP_BASE = "/api/integrations/whatsapp";
// labelsRoutes é montado pelo backend em /api/labels (o controller faz o proxy Whapi).
const LABELS_BASE = "/api/labels";

export const WHAPI_LABEL_COLORS = [
  "salmon",
  "lightskyblue",
  "gold",
  "plum",
  "silver",
  "mediumturquoise",
  "violet",
  "goldenrod",
  "cornflowerblue",
  "greenyellow",
  "cyan",
  "lightpink",
  "mediumaquamarine",
  "orangered",
  "deepskyblue",
  "limegreen",
  "darkorange",
  "lightsteelblue",
  "mediumpurple",
  "rebeccapurple",
];

function instanceParams(instanceId) {
  return { whatsapp_instance_id: instanceId };
}

export function apiErrorMessage(error, fallback = "Não foi possível concluir a operação.") {
  const payload = error?.response?.data;
  if (typeof payload === "string" && payload.trim()) return payload;
  return payload?.error?.message || payload?.error || payload?.erro || payload?.message || error?.message || fallback;
}

export async function obterPerfilBusiness(instanceId, options = {}) {
  const { data } = await api.get(`${WHATSAPP_BASE}/instances/${instanceId}/business-profile`, {
    signal: options.signal,
    silent: options.silent === true,
  });
  return data?.profile && typeof data.profile === "object" ? data.profile : {};
}

export async function salvarPerfilBusiness(instanceId, profile) {
  const { data } = await api.post(`${WHATSAPP_BASE}/instances/${instanceId}/business-profile`, profile);
  return data;
}

export async function listarLabelsWhatsapp(instanceId, options = {}) {
  const { data } = await api.get(LABELS_BASE, {
    params: instanceParams(instanceId),
    signal: options.signal,
    silent: options.silent === true,
  });
  return Array.isArray(data?.labels) ? data.labels : [];
}

export async function criarLabelWhatsapp(instanceId, { id = "", name, color }) {
  const { data } = await api.post(LABELS_BASE, {
    whatsapp_instance_id: instanceId,
    id,
    name,
    color,
  });
  return data;
}

export async function renomearLabelWhatsapp(instanceId, labelId, name) {
  const { data } = await api.patch(`${LABELS_BASE}/${encodeURIComponent(labelId)}`, {
    whatsapp_instance_id: instanceId,
    name,
  });
  return data;
}

export async function excluirLabelWhatsapp(instanceId, labelId) {
  const { data } = await api.delete(`${LABELS_BASE}/${encodeURIComponent(labelId)}`, {
    params: instanceParams(instanceId),
  });
  return data;
}

export async function listarAssociacoesLabelWhatsapp(instanceId, labelId, options = {}) {
  const { data } = await api.get(`${LABELS_BASE}/${encodeURIComponent(labelId)}/chats`, {
    params: instanceParams(instanceId),
    signal: options.signal,
    silent: options.silent === true,
  });
  return {
    chats: Array.isArray(data?.chats) ? data.chats : [],
    messages: Array.isArray(data?.messages) ? data.messages : [],
  };
}

export async function associarLabelWhatsapp(instanceId, labelId, chat) {
  const { data } = await api.post(`${LABELS_BASE}/${encodeURIComponent(labelId)}/associacoes`, {
    whatsapp_instance_id: instanceId,
    chat,
  });
  return data;
}

export async function desassociarLabelWhatsapp(instanceId, labelId, chat) {
  const { data } = await api.delete(`${LABELS_BASE}/${encodeURIComponent(labelId)}/associacoes`, {
    data: { whatsapp_instance_id: instanceId, chat },
  });
  return data;
}
