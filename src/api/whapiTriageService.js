import api from "./http";

/**
 * Triagem Interativa Whapi — fiação HTTP (rotas /api/whapi/triagem).
 * Recurso exclusivo de instâncias provider='whapi'; coexiste com o Chatbot de Triagem (texto).
 * company_id vem SEMPRE do token no backend — nunca enviar no body/query.
 */

const BASE = "/api/whapi/triagem";

export function apiErrorMessage(err, fallback = "Ocorreu um erro.") {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  return data?.error || data?.erro || data?.message || err?.message || fallback;
}

/** GET /instances — canais Whapi da empresa (para o seletor). */
export async function listarInstanciasTriagem() {
  const { data } = await api.get(`${BASE}/instances`);
  return {
    instances: Array.isArray(data?.instances) ? data.instances : [],
    hasWhapi: data?.hasWhapi === true,
  };
}

/** GET /config?whatsapp_instance_id= — config atual (cria defaults em memória se não existir). */
export async function getTriagemConfig(whatsappInstanceId) {
  const { data } = await api.get(`${BASE}/config`, {
    params: whatsappInstanceId ? { whatsapp_instance_id: whatsappInstanceId } : undefined,
  });
  return data;
}

/** PUT /config — salva (admin). */
export async function salvarTriagemConfig(whatsappInstanceId, config) {
  const { data } = await api.put(`${BASE}/config`, {
    whatsapp_instance_id: whatsappInstanceId,
    config,
  });
  return data;
}

export const TRIAGE_MODES = [
  { value: "poll", label: "Enquete (recomendado)", hint: "Estável no WhatsApp; ideal para triagem." },
  { value: "list", label: "Lista de opções", hint: "Menu com botão 'Selecionar setor'." },
  { value: "button", label: "Botões (até 3)", hint: "Instável do lado do WhatsApp; use com cautela." },
];
