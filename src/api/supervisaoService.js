import api from "./http";

/**
 * @typedef {Object} SupervisaoResumoPayload
 * @property {number=} atendimentos_abertos
 * @property {number=} aguardando_funcionario
 * @property {number=} atrasados
 * @property {number=} cards.atrasados_30min
 * @property {number=} tempo_medio_resposta_minutos
 * @property {number=} sla_minutos
 */

export async function getResumoSupervisao() {
  const { data } = await api.get("/api/supervisao/resumo");
  return data ?? {};
}

export async function getClientesPendentesSupervisao() {
  const { data } = await api.get("/api/supervisao/clientes-pendentes");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.clientes)) return data.clientes;
  return [];
}

export async function getMovimentacaoFuncionarioSupervisao(usuarioId) {
  const { data } = await api.get(`/api/supervisao/funcionarios/${usuarioId}/movimentacao`);
  return data ?? {};
}

export async function getRelatorioDiarioSupervisao(data) {
  const params = data ? { data } : undefined;
  const response = await api.get("/api/supervisao/relatorio-diario", { params });
  return response?.data ?? {};
}
