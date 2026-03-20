import api from "./http";

const WHATSAPP_BASE = "/api/integrations/whatsapp";

/**
 * POST /integrations/whatsapp/contacts/sync
 * Sincroniza contatos da agenda do celular conectado.
 * Alternativa: POST /integrations/zapi/contacts/sync
 */
export async function syncContacts() {
  const { data } = await api.post(`${WHATSAPP_BASE}/contacts/sync`);
  return data;
}

/**
 * POST /integrations/whatsapp/groups/sync
 * Sincroniza grupos do celular conectado.
 * Resposta: { ok: true, inserted, updated, ... }
 */
export async function syncGroups() {
  const { data } = await api.post(`${WHATSAPP_BASE}/groups/sync`);
  return data;
}

/**
 * POST /integrations/whatsapp/sync-all
 * Sincroniza contatos + grupos + chats de uma vez.
 * Resposta: { ok: true, contacts: {...}, groups: {...}, chats: {...} }
 */
export async function syncAll() {
  const { data } = await api.post(`${WHATSAPP_BASE}/sync-all`);
  return data;
}
