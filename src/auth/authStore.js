import { create } from "zustand"
import { login as loginService } from "./authService"
import { initSocket, disconnectSocket } from "../socket/socket"
import { useChatStore } from "../chats/chatsStore"
import { useConversaStore } from "../conversa/conversaStore"
import { usePermissoesStore } from "./permissoesStore"

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  loading: false,

  // ======================
  // LOGIN
  // ======================
  login: async (email, senha) => {
    set({ loading: true })

    try {
      const data = await loginService(email, senha)

      const usuario = data.usuario || {}

      // 🔒 NORMALIZAÇÃO: role vem do backend (perfil) para roteamento por setor e permissões
      const userNormalizado = {
        ...usuario,
        role: String(
          usuario.perfil ||
            usuario.role ||
            (usuario.email === "admin@empresa.com" ? "admin" : "atendente")
        ).toLowerCase(),
      }

      const token = data.token

      localStorage.setItem(
        "zap_erp_auth",
        JSON.stringify({
          token,
          user: userNormalizado,
        })
      )

      set({
        user: userNormalizado,
        token,
        loading: false,
      })

      // 🔌 inicia socket autenticado
      initSocket(token)

      // Carrega permissões do usuário (menus e proteção de rotas)
      usePermissoesStore.getState().fetchPermissoes().catch(() => {})

      return data
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  // ======================
  // LOGOUT
  // ======================
  logout: () => {
    localStorage.removeItem("zap_erp_auth")

    // encerra a conexão para evitar “sessão fantasma” após logout
    disconnectSocket()
    try {
      useChatStore.getState().limpar()
      useConversaStore.getState().limpar()
      usePermissoesStore.getState().clearPermissoes()
    } catch (_) {}

    set({ user: null, token: null })
    window.location.href = "/login"
  },

  /** Atualiza dados do usuário logado (ex.: após PATCH /usuarios/me) */
  updateUser: (patch) => {
    set((state) => {
      if (!state.user) return state
      const next = { ...state.user, ...patch }
      try {
        const raw = localStorage.getItem("zap_erp_auth")
        if (raw) {
          const parsed = JSON.parse(raw)
          parsed.user = next
          localStorage.setItem("zap_erp_auth", JSON.stringify(parsed))
        }
      } catch {}
      return { user: next }
    })
  },

  // ======================
  // RESTORE (refresh da página)
  // ======================
  restore: () => {
    const raw = localStorage.getItem("zap_erp_auth")
    if (!raw) return

    try {
      const parsed = JSON.parse(raw)
      if (!parsed?.token || !parsed?.user) return

      const userNormalizado = {
        ...parsed.user,
        role: String(parsed.user.role || parsed.user.perfil || "atendente").toLowerCase(),
      }

      set({
        token: parsed.token,
        user: userNormalizado,
      })

      initSocket(parsed.token)

      // Carrega permissões do usuário (menus e proteção de rotas)
      usePermissoesStore.getState().fetchPermissoes().catch(() => {})
    } catch {
      localStorage.removeItem("zap_erp_auth")
    }
  },
}))
