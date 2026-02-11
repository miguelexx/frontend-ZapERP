import { create } from "zustand"
import { login as loginService } from "./authService"
import { initSocket } from "../socket/socket"

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

    // ⚠️ não chamamos disconnectSocket porque ele NÃO existe
    // o socket será recriado no próximo login

    set({ user: null, token: null })
    window.location.href = "/login"
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
        role: String(parsed.user.role || "atendente").toLowerCase(),
      }

      set({
        token: parsed.token,
        user: userNormalizado,
      })

      initSocket(parsed.token)
    } catch {
      localStorage.removeItem("zap_erp_auth")
    }
  },
}))
