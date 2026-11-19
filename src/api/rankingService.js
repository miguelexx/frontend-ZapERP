import api from "./http";

/**
 * Ranking gamificado de atendentes (backend: routes/rankingRoutes.js).
 * company_id vem do JWT no servidor — nunca é enviado daqui.
 */

/** Ranking da competição em andamento. `resumo` = só estado/último campeão (sem contagem). */
export async function getRankingAtual({ resumo = false } = {}) {
  const { data } = await api.get("/api/ranking/atual", {
    params: resumo ? { resumo: 1 } : undefined,
    silent: true,
    skipGlobal500Toast: true,
  });
  return data ?? { ativo: false };
}

/** Admin: configuração + ciclo atual. */
export async function getRankingConfig() {
  const { data } = await api.get("/api/ranking/config", { skipGlobal500Toast: true });
  return data ?? {};
}

/** Admin: salva { ativo, dia_semana (0–6), horario 'HH:MM' }. */
export async function salvarRankingConfig(payload) {
  const { data } = await api.put("/api/ranking/config", payload, { skipGlobal500Toast: true });
  return data ?? {};
}

/** Admin: competições encerradas, mais recentes primeiro. */
export async function getRankingHistorico({ limit = 20 } = {}) {
  const { data } = await api.get("/api/ranking/historico", {
    params: { limit },
    skipGlobal500Toast: true,
  });
  return Array.isArray(data?.itens) ? data.itens : [];
}
