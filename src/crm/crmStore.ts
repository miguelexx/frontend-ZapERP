import { create } from "zustand";

interface CrmState {
  /** Pipeline selecionado globalmente (Dashboard, Kanban, listas). */
  pipelineId: number | null;
  setPipelineId: (id: number | null) => void;
  /** Incrementado por WebSocket CRM para disparar refetch seletivo nas telas. */
  refreshTick: number;
  bumpRefresh: () => void;
}

export const useCrmStore = create<CrmState>((set) => ({
  pipelineId: null,
  setPipelineId: (id) => set({ pipelineId: id }),
  refreshTick: 0,
  bumpRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
}));
