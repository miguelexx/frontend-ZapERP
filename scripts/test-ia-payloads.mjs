import assert from "node:assert/strict";
import { buildTriagemPayload } from "../src/ia/triagem/triagemPayload.js";
import { buildAlertaSemRespostaPayload } from "../src/ia/alertas/alertaPayload.js";
import { DEFAULT_ALERTA_SEM_RESPOSTA, DEFAULT_CONFIG } from "../src/ia/shared/configDefaults.js";

const triagemInput = {
  ...DEFAULT_CONFIG.chatbot_triage,
  enabled: 1,
  welcomeMessage: "  Bem-vindo  ",
  invalidOptionMessage: "  Inválida  ",
  confirmSelectionMessage: "  Setor {{departamento}}  ",
  intervaloEnvioSegundos: 90,
  options: [{ key: " 1 ", label: " Suporte ", departamento_id: "10", active: true }],
  finalizar_por_ausencia_prazo: "24",
  redirecionar_sem_resposta_minutos: "5",
};

assert.deepEqual(buildTriagemPayload(triagemInput), {
  ...triagemInput,
  enabled: true,
  welcomeMessage: "Bem-vindo",
  invalidOptionMessage: "Inválida",
  confirmSelectionMessage: "Setor {{departamento}}",
  enviarMensagemFinalizacao: false,
  mensagemFinalizacao: triagemInput.mensagemFinalizacao,
  foraHorarioEnabled: false,
  horarioInicio: "09:00",
  horarioFim: "18:00",
  diasSemanaDesativados: [0, 6],
  datasEspecificasFechadas: [],
  mensagemForaHorario: triagemInput.mensagemForaHorario,
  intervaloEnvioSegundos: 60,
  sendOnlyFirstTime: true,
  fallbackToAI: false,
  businessHoursOnly: false,
  transferMode: "departamento",
  reopenMenuCommand: "0",
  tipo_distribuicao: "fila",
  options: [{ key: "1", label: "Suporte", departamento_id: 10, active: true }],
  finalizar_por_ausencia_ativo: false,
  finalizar_por_ausencia_prazo: 24,
  finalizar_por_ausencia_unidade: "horas_corridas",
  finalizar_por_ausencia_mensagem: "",
  finalizar_por_ausencia_reabrir_automaticamente: true,
  finalizar_por_ausencia_reabrir_sem_chatbot: true,
  redirecionar_sem_resposta_ativo: false,
  redirecionar_sem_resposta_minutos: 5,
  redirecionar_sem_resposta_departamento_id: null,
});

const alertaInput = {
  ...DEFAULT_ALERTA_SEM_RESPOSTA,
  alerta_sem_resposta_ativo: true,
  tempo_primeiro_alerta_minutos: "2.9",
  tempo_alerta_critico_minutos: "4.8",
  tempo_notificar_gestor_minutos: "8.2",
  gestor_notificado_id: "7",
  gestor_cliente_id: "9",
  gestor_cliente_nome: "  Gestor  ",
  telefone_gestor: " 5511999999999 ",
};

assert.deepEqual(buildAlertaSemRespostaPayload(alertaInput), {
  alerta_sem_resposta_ativo: true,
  tempo_primeiro_alerta_minutos: 2,
  tempo_alerta_critico_minutos: 4,
  tempo_notificar_gestor_minutos: 8,
  notificar_por_whatsapp: false,
  notificar_por_email: false,
  notificar_interno: true,
  reabrir_conversa_automaticamente: true,
  aplicar_tag_automatica: true,
  nome_tag_automatica: "Reaberta por falta de resposta",
  gestor_notificado_id: 7,
  gestor_cliente_id: 9,
  gestor_cliente_nome: "Gestor",
  responsaveis_notificacao_ids: [7],
  telefone_gestor: "5511999999999",
  horario_comercial_ativo: true,
  timezone: "America/Sao_Paulo",
  horarioInicio: "09:00",
  horarioFim: "18:00",
  diasSemanaDesativados: [0, 6],
  datasEspecificasFechadas: [],
});

console.log("OK — contratos de payload da IA preservados (triagem e alertas).");
