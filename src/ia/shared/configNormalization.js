import { DEFAULT_CONFIG } from "./configDefaults";
import { normalizeHorarioAdminAlerta } from "./dateTime";

export function mergeAdminAtendimentoAlertaFromApi(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const ativoRaw = s.ativo;
  const ativo = ativoRaw === true || ativoRaw === 1 || String(ativoRaw || "").trim().toLowerCase() === "true";
  return {
    ...DEFAULT_CONFIG.admin_atendimento_alerta,
    ...s,
    ativo,
    cliente_id: Number.isInteger(Number(s.cliente_id)) && Number(s.cliente_id) > 0 ? Number(s.cliente_id) : null,
    cliente_nome: String(s.cliente_nome || "").trim().slice(0, 120),
    telefone_admin: String(s.telefone_admin || "").trim().slice(0, 40),
    horario_envio: normalizeHorarioAdminAlerta(s.horario_envio),
    timezone: String(s.timezone || "").trim().slice(0, 80),
    incluir_nota_media: s.incluir_nota_media === true,
    incluir_conversas_sem_resposta: s.incluir_conversas_sem_resposta !== false,
  };
}

export function mergeIaConfigFromApi(server) {
  if (!server || typeof server !== "object") return { ...DEFAULT_CONFIG };
  const ctRaw = server.chatbot_triage;
  const ct = ctRaw && typeof ctRaw === "object" ? ctRaw : {};
  const enviarMensagemAusencia = ct.finalizar_por_ausencia_enviar_mensagem == null
    ? Boolean(String(ct.finalizar_por_ausencia_mensagem ?? "").trim())
    : ct.finalizar_por_ausencia_enviar_mensagem !== false;
  return {
    ia: { ...DEFAULT_CONFIG.ia, ...(server.ia || {}) },
    automacoes: { ...DEFAULT_CONFIG.automacoes, ...(server.automacoes || {}) },
    chatbot_triage: {
      ...DEFAULT_CONFIG.chatbot_triage,
      ...ct,
      finalizar_por_ausencia_enviar_mensagem: enviarMensagemAusencia,
      options: Array.isArray(ct.options) ? ct.options : DEFAULT_CONFIG.chatbot_triage.options,
    },
    admin_atendimento_alerta: mergeAdminAtendimentoAlertaFromApi(server.admin_atendimento_alerta),
  };
}

function iaConfigCacheKey(companyKey) {
  return `ia_config_cache_${String(companyKey || "default")}`;
}

export function readIaConfigCache(companyKey) {
  try {
    const raw = localStorage.getItem(iaConfigCacheKey(companyKey));
    return raw ? mergeIaConfigFromApi(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeIaConfigCache(companyKey, config) {
  try {
    localStorage.setItem(iaConfigCacheKey(companyKey), JSON.stringify(config || {}));
  } catch {}
}
