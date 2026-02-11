import axios from "axios"

// Se `VITE_API_URL` não existir, usamos um fallback fixo (ambiente externo/preview).
// Obs.: `.env` só é lido pelo Vite ao iniciar (reinicie o `npm run dev` após alterar).
const FALLBACK_API_URL = "http://wksos40okks4cccoogwwc8co.72.60.147.139.sslip.io"
const baseURL = import.meta.env.VITE_API_URL || FALLBACK_API_URL

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
})

// 🔐 injeta token sempre do localStorage
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem("zap_erp_auth")

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const token = parsed?.token

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log("🔐 Token injetado no axios")
      }
    } catch (e) {
      console.warn("⚠️ erro ao parsear zap_erp_auth:", e)
    }
  } else {
    console.warn("⚠️ zap_erp_auth não existe no localStorage")
  }

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    if (status === 401) {
      console.warn("🚨 401 da API - token ausente ou inválido")
      localStorage.removeItem("zap_erp_auth")
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login"
      }
    }
    return Promise.reject(err)
  }
)

export default api
