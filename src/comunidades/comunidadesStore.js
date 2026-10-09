import { create } from "zustand";

/**
 * Store das Comunidades. Mutado pela página (React) e por listeners do socket
 * (via useComunidadesStore.getState().applyRealtime). Sem efeitos colaterais no import.
 */
function upsertById(list, item, key = "id") {
  if (!item || item[key] == null) return list;
  const idx = list.findIndex((x) => String(x[key]) === String(item[key]));
  if (idx === -1) return [item, ...list];
  const next = list.slice();
  next[idx] = { ...next[idx], ...item };
  return next;
}

export const useComunidadesStore = create((set, get) => ({
  instanceId: null,
  comunidades: [],
  operacoes: [],
  loading: false,

  setInstanceId: (instanceId) => set({ instanceId }),
  setComunidades: (comunidades) => set({ comunidades: Array.isArray(comunidades) ? comunidades : [] }),
  setLoading: (loading) => set({ loading: !!loading }),
  setOperacoes: (operacoes) => set({ operacoes: Array.isArray(operacoes) ? operacoes : [] }),
  upsertOperacao: (op) => set({ operacoes: upsertById(get().operacoes, op) }),

  /** Chamado pelos listeners do socket (socket.js). payload.operacao / payload.*. */
  applyRealtime: (event, payload = {}) => {
    try {
      if (event === "comunidade_operacao_atualizada" || event === "comunidade_operacao_concluida" || event === "comunidade_operacao_pausada") {
        if (payload.operacao) set({ operacoes: upsertById(get().operacoes, payload.operacao) });
      }
      // comunidade_item_atualizado: a página recarrega o detalhe da operação aberta; aqui não mutamos itens.
    } catch { /* noop */ }
  },

  reset: () => set({ comunidades: [], operacoes: [], loading: false }),
}));
