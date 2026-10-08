import api from "./http";

const BASE = "/api/integrations/whatsapp";

export async function listarAcessoNumeros() {
  const { data } = await api.get(`${BASE}/instance-access`);
  return {
    configuracaoDisponivel: data?.configuracao_disponivel !== false,
    instances: Array.isArray(data?.instances) ? data.instances : [],
    atendentes: Array.isArray(data?.atendentes) ? data.atendentes : [],
  };
}

export async function salvarAtendentesDoNumero(instanceId, usuarioIds) {
  const { data } = await api.put(`${BASE}/instances/${instanceId}/atendentes`, {
    usuario_ids: usuarioIds,
  });
  return data;
}
