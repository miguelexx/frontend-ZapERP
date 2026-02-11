import { create } from "zustand"

export const useNotificationStore = create((set) => ({
  toast: null,
  showToast: (payload) => set({ toast: payload }),
  clearToast: () => set({ toast: null }),
}))
