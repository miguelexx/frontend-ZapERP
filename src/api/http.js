import axios from "axios"
import { getApiBaseUrl } from "./baseUrl"

const baseURL = getApiBaseUrl()

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
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch (_) {
      // auth inválido; próximo request pode resultar em 401
    }
  }

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    if (status === 401) {
      localStorage.removeItem("zap_erp_auth")
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        window.location.href = "/login"
      }
    }
    return Promise.reject(err)
  }
)

export default api
