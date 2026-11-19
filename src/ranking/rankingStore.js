import { create } from "zustand";

/**
 * Estado global mínimo do ranking: o resumo (ativo? último campeão?) para o menu e o
 * anúncio, um "tick" que a página usa para recarregar quando conversas são encerradas e
 * o ciclo sendo celebrado agora. Alimentado só por RankingGlobalBridge.
 */
export const useRankingStore = create((set) => ({
  resumo: null,
  tick: 0,
  celebracao: null,
  setResumo: (resumo) => set({ resumo }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  celebrar: (ciclo) => set({ celebracao: ciclo }),
  fecharCelebracao: () => set({ celebracao: null }),
}));
