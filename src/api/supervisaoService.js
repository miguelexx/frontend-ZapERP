import api from "./http";

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
