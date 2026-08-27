import { DEFAULT_ALERTA_SEM_RESPOSTA } from "../shared/configDefaults.js";
import { formatTimeForInput } from "../shared/dateTime.js";

export function buildAlertaSemRespostaPayload(v) {
  const gestorId = Number(v.gestor_notificado_id);
  const gestorClienteId = Number(v.gestor_cliente_id);
  const alertaAtivo = v.alerta_sem_resposta_ativo === true;
  return {
    alerta_sem_resposta_ativo: alertaAtivo,
    tempo_primeiro_alerta_minutos: Math.max(1, Math.floor(Number(v.tempo_primeiro_alerta_minutos) || 1)),
    tempo_alerta_critico_minutos: Math.max(1, Math.floor(Number(v.tempo_alerta_critico_minutos) || 1)),
    tempo_notificar_gestor_minutos: Math.max(1, Math.floor(Number(v.tempo_notificar_gestor_minutos) || 1)),
    notificar_por_whatsapp: v.notificar_por_whatsapp === true,
    notificar_por_email: v.notificar_por_email === true,
    notificar_interno: v.notificar_interno !== false,
    reabrir_conversa_automaticamente: v.reabrir_conversa_automaticamente !== false,
    aplicar_tag_automatica: v.aplicar_tag_automatica !== false,
    nome_tag_automatica: String(v.nome_tag_automatica || DEFAULT_ALERTA_SEM_RESPOSTA.nome_tag_automatica).trim(),
    gestor_notificado_id: Number.isFinite(gestorId) && gestorId > 0 ? gestorId : null,
    gestor_cliente_id: Number.isFinite(gestorClienteId) && gestorClienteId > 0 ? gestorClienteId : null,
    gestor_cliente_nome: String(v.gestor_cliente_nome || "").trim(),
    responsaveis_notificacao_ids: Number.isFinite(gestorId) && gestorId > 0 ? [gestorId] : [],
    telefone_gestor: String(v.telefone_gestor || "").trim(),
    horario_comercial_ativo: alertaAtivo ? true : v.horario_comercial_ativo !== false,
    timezone: String(v.timezone || "America/Sao_Paulo").trim(),
    horarioInicio: formatTimeForInput(v.horarioInicio),
    horarioFim: formatTimeForInput(v.horarioFim),
    diasSemanaDesativados: Array.isArray(v.diasSemanaDesativados)
      ? v.diasSemanaDesativados.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [0, 6],
    datasEspecificasFechadas: Array.isArray(v.datasEspecificasFechadas)
      ? v.datasEspecificasFechadas.map(String).filter(Boolean)
      : [],
  };
}
