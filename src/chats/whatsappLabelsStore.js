import { create } from "zustand";

/**
 * Etiquetas do WhatsApp Business (Whapi) aplicadas por conversa — ponte entre o seletor
 * do cabeçalho (ConversationWhatsappLabels) e o card da lista (ChatListRow).
 *
 * As etiquetas do WhatsApp NÃO vivem no nosso banco: são mantidas pelo WhatsApp Business e
 * lidas ao vivo via Whapi quando a conversa é aberta. Este store guarda em memória o que já
 * foi resolvido e espelha para o card, para que ao escolher uma etiqueta ela apareça na lista
 * na hora. Persistimos um cache leve em localStorage (namespaced por empresa) só para o visual
 * sobreviver ao F5 — a fonte de verdade continua o Whapi, que reconcilia ao reabrir a conversa.
 */

function companyScope() {
  try {
    const raw = localStorage.getItem("zap_erp_auth");
    if (!raw) return "anon";
    const parsed = JSON.parse(raw);
    const cid = parsed?.user?.company_id ?? parsed?.user?.empresa_id;
    return cid != null && String(cid).trim() !== "" ? String(cid) : "anon";
  } catch {
    return "anon";
  }
}

function storageKey() {
  return `zap:wa-labels:${companyScope()}`;
}

function readPersisted() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(byConversa) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(byConversa));
  } catch {
    // cota/modo privado — o espelho em memória segue funcionando na sessão.
  }
}

/** Normaliza para o mínimo que o card precisa: id (string), name, color. */
function normalizeLabels(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const label of list) {
    const id = label?.id != null ? String(label.id) : "";
    const name = String(label?.name ?? label?.nome ?? "").trim();
    if (!name) continue;
    const key = id || `n:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: id || key, name, color: String(label?.color ?? label?.cor ?? "").trim() });
  }
  return out;
}

/** Compara duas listas normalizadas para evitar writes/re-renders redundantes. */
function sameLabels(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].color !== b[i].color) return false;
  }
  return true;
}

export const useWhatsappLabelsStore = create((set, get) => ({
  byConversa: readPersisted(),

  /** Substitui as etiquetas conhecidas de uma conversa (resultado autoritativo do Whapi). */
  setConversationLabels(conversaId, labels) {
    const id = conversaId != null ? String(conversaId) : "";
    if (!id) return;
    const next = normalizeLabels(labels);
    const current = get().byConversa[id];
    if (sameLabels(current, next)) return;
    const byConversa = { ...get().byConversa };
    if (next.length === 0) delete byConversa[id];
    else byConversa[id] = next;
    persist(byConversa);
    set({ byConversa });
  },

  clearConversationLabels(conversaId) {
    get().setConversationLabels(conversaId, []);
  },
}));

/** Seletor estável para uma conversa (referência preservada até mudar). */
export function selectConversationLabels(conversaId) {
  const id = conversaId != null ? String(conversaId) : "";
  return (state) => (id ? state.byConversa[id] : undefined);
}
