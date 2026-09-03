import { normalizeFinalizationMessage } from "../../pages/iaConfigPayload.js";

function formatTime(t) {
  if (!t || typeof t !== "string") return "09:00";
  const match = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "09:00";
  const h = Math.max(0, Math.min(23, parseInt(match[1], 10)));
  const m = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildTriagemPayload(vals) {
  const dias = (vals.diasSemanaDesativados || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const datas = (vals.datasEspecificasFechadas || []).filter((d) => {
    if (typeof d !== "string" || !d.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
    return !Number.isNaN(new Date(d).getTime());
  });
  const finalizationMessage = normalizeFinalizationMessage(vals.enviarMensagemFinalizacao, vals.mensagemFinalizacao);
  return {
    ...vals,
    enabled: !!vals.enabled,
    welcomeMessage: (vals.welcomeMessage || "").trim(),
    invalidOptionMessage: (vals.invalidOptionMessage || "").trim(),
    confirmSelectionMessage: (vals.confirmSelectionMessage || "").trim(),
    ...finalizationMessage,
    foraHorarioEnabled: !!vals.foraHorarioEnabled,
    horarioInicio: formatTime(vals.horarioInicio) || "09:00",
    horarioFim: formatTime(vals.horarioFim) || "18:00",
    diasSemanaDesativados: dias.length > 0 ? dias : [0, 6],
    datasEspecificasFechadas: datas,
    mensagemForaHorario: (vals.mensagemForaHorario || "").trim().slice(0, 1024),
    intervaloEnvioSegundos: Math.max(0, Math.min(60, Number(vals.intervaloEnvioSegundos) || 3)),
    sendOnlyFirstTime: vals.sendOnlyFirstTime !== false,
    fallbackToAI: vals.fallbackToAI ?? false,
    businessHoursOnly: vals.businessHoursOnly ?? false,
    transferMode: vals.transferMode ?? "departamento",
    reopenMenuCommand: String(vals.reopenMenuCommand ?? "0").trim() || "0",
    tipo_distribuicao: ["fila", "round_robin", "menor_carga"].includes(vals.tipo_distribuicao) ? vals.tipo_distribuicao : "fila",
    usarMenuSetores: !!vals.usarMenuSetores,
    options: (vals.options || []).map((option) => ({
      key: String(option.key || "").trim(),
      label: (option.label || "").trim(),
      departamento_id: option.departamento_id ? Number(option.departamento_id) : null,
      active: !!option.active,
    })),
    finalizar_por_ausencia_ativo: !!vals.finalizar_por_ausencia_ativo,
    finalizar_por_ausencia_prazo: Math.max(1, Math.min(720, Number(vals.finalizar_por_ausencia_prazo) || 24)),
    finalizar_por_ausencia_unidade: vals.finalizar_por_ausencia_unidade === "horas_uteis" ? "horas_uteis" : "horas_corridas",
    finalizar_por_ausencia_mensagem: vals.finalizar_por_ausencia_mensagem != null ? String(vals.finalizar_por_ausencia_mensagem) : "",
    finalizar_por_ausencia_reabrir_automaticamente: vals.finalizar_por_ausencia_reabrir_automaticamente !== false,
    finalizar_por_ausencia_reabrir_sem_chatbot: vals.finalizar_por_ausencia_reabrir_sem_chatbot !== false,
    redirecionar_sem_resposta_ativo: !!vals.redirecionar_sem_resposta_ativo,
    redirecionar_sem_resposta_minutos: Math.max(1, Math.min(1440, Number(vals.redirecionar_sem_resposta_minutos) || 5)),
    redirecionar_sem_resposta_departamento_id: vals.redirecionar_sem_resposta_departamento_id
      ? Number(vals.redirecionar_sem_resposta_departamento_id)
      : null,
  };
}
