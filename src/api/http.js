import axios from "axios"
import { getApiBaseUrl } from "./baseUrl"
import { disconnectSocket } from "../socket/socket"
import { useNotificationStore } from "../notifications/notificationStore"
import { clearConversaSessionCaches } from "../conversa/conversaStore"
import { HTTP_TIMEOUT_DEFAULT_MS, resolveRequestTimeoutMs } from "./httpTimeouts"

const baseURL = getApiBaseUrl()

const withCredentials =
  String(import.meta.env.VITE_WITH_CREDENTIALS || "").trim() === "1" ||
  String(import.meta.env.VITE_WITH_CREDENTIALS || "").toLowerCase() === "true"

const api = axios.create({
  baseURL,
  timeout: HTTP_TIMEOUT_DEFAULT_MS,
  ...(withCredentials ? { withCredentials: true } : {}),
})

// 🔐 injeta token sempre do localStorage + timeout seguro por tipo de request
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

  // Caller pode definir timeout próprio (ex.: upload de vídeo). Caso contrário, resolve por URL/FormData.
  if (config.timeout == null || config.timeout === 0) {
    config.timeout = resolveRequestTimeoutMs(config)
  } else if (
    config.timeout === HTTP_TIMEOUT_DEFAULT_MS &&
    typeof FormData !== "undefined" &&
    config.data instanceof FormData
  ) {
    // create() aplica 55s por padrão; uploads precisam do timeout maior automático.
    config.timeout = resolveRequestTimeoutMs({ ...config, timeout: undefined })
  }

  return config
})

function requestHadBearerToken(config) {
  const h = config?.headers
  if (!h) return false
  const auth = h.Authorization ?? h.authorization
  return typeof auth === "string" && /^Bearer\s+\S+/i.test(auth)
}

function isTimeoutError(err) {
  return (
    err?.code === "ECONNABORTED" ||
    err?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(err?.message || ""))
  )
}

// Retry leve para soluços de rede/conexão (ex.: HTTP/3 ERR_QUIC_PROTOCOL_ERROR /
// QUIC_TOO_MANY_RTOS, ERR_NETWORK, ERR_CONNECTION_CLOSED). Espelha o motivo do
// lazyWithRetry (chunks): uma queda transitória da conexão derruba tudo em voo de
// uma vez; retentar o request deixa o poll/GET se recuperar sozinho em vez de
// falhar seco. Só métodos seguros (idempotentes) são retentados — nunca POST/PUT/etc.
const NETWORK_RETRY_MAX = 2
const NETWORK_RETRY_BASE_MS = 400

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSafeMethod(config) {
  const m = String(config?.method || "get").toLowerCase()
  return m === "get" || m === "head" || m === "options"
}

function isRetriableNetworkError(err) {
  // Só falhas SEM resposta HTTP = nível de conexão/rede. Com resposta (4xx/5xx) o
  // servidor respondeu — não é queda transitória e não deve ser retentado aqui.
  if (err?.response) return false
  return (
    err?.code === "ERR_NETWORK" ||
    err?.message === "Network Error" ||
    err?.code === "ERR_CONNECTION_CLOSED" ||
    isTimeoutError(err)
  )
}

function shouldRetryNetwork(err) {
  const config = err?.config
  if (!config) return false
  if (config.noNetworkRetry === true) return false
  if (!isSafeMethod(config)) return false
  if (!isRetriableNetworkError(err)) return false
  // Offline de verdade não se resolve retentando — deixa o fluxo normal avisar.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false
  const attempted = config.__networkRetryCount || 0
  return attempted < NETWORK_RETRY_MAX
}

function retryNetworkRequest(err) {
  const config = err.config
  config.__networkRetryCount = (config.__networkRetryCount || 0) + 1
  const delay = NETWORK_RETRY_BASE_MS * Math.pow(2, config.__networkRetryCount - 1)
  return wait(delay).then(() => api(config))
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Antes de qualquer aviso: retenta soluços de conexão em GET/HEAD/OPTIONS.
    // Só cai no tratamento abaixo depois de esgotar as tentativas.
    if (shouldRetryNetwork(err)) {
      return retryNetworkRequest(err)
    }
    const status = err?.response?.status
    if (status === 401) {
      const url = String(err?.config?.url || "")
      const isLoginRequest = url.includes("/usuarios/login")
      const skipLogout = err?.config?.skipAuthLogout === true || isLoginRequest
      const hadAuth = requestHadBearerToken(err?.config)

      if (!skipLogout && hadAuth) {
        localStorage.removeItem("zap_erp_auth")
        try {
          clearConversaSessionCaches?.()
        } catch (_) {
          /* ignore */
        }
        try {
          disconnectSocket?.()
        } catch (_) {
          /* ignore */
        }
        const path = typeof window !== "undefined" ? window.location.pathname : ""
        if (path && !path.includes("/login")) {
          window.location.href = "/login"
        }
      }
      return Promise.reject(err)
    }
    if (err?.config?.silent === true) {
      return Promise.reject(err)
    }
    // Feedback global para erros de servidor/rede (evita tela travada sem aviso)
    if (typeof window !== "undefined") {
      const show = (payload) => {
        try {
          useNotificationStore?.getState()?.showToast?.(payload)
        } catch (_) {
          /* ignore */
        }
      }
      if (status === 403) {
        if (err?.config?.skipGlobal403Toast === true) {
          return Promise.reject(err)
        }
        show({
          type: "error",
          title: "Acesso restrito",
          message: err?.response?.data?.error || "Você não tem permissão para acessar este recurso.",
        })
      } else if (status >= 500) {
        if (err?.config?.skipGlobal500Toast === true) {
          return Promise.reject(err)
        }
        show({ type: "error", title: "Erro no servidor", message: err?.response?.data?.error || "Tente novamente em instantes." })
      } else if (status === 429) {
        show({ type: "warning", title: "Muitas requisições", message: "Aguarde um momento antes de tentar de novo." })
      } else if (isTimeoutError(err)) {
        if (err?.config?.skipGlobalNetworkToast === true) {
          return Promise.reject(err)
        }
        show({
          type: "warning",
          title: "Demora na resposta",
          message: "A requisição excedeu o tempo limite. Estamos verificando se a ação foi concluída.",
        })
      } else if (err?.message === "Network Error" || err?.code === "ERR_NETWORK") {
        if (err?.config?.skipGlobalNetworkToast === true) {
          return Promise.reject(err)
        }
        // Só avisa "Sem conexão" quando o navegador está realmente offline.
        // Uma falha isolada de request com internet ativa (ex.: ERR_CONNECTION_CLOSED
        // por restart/soluço do backend) NÃO é falta de internet do usuário — antes
        // isso disparava o toast indevidamente em polls de fundo.
        const browserOffline =
          typeof navigator !== "undefined" && navigator.onLine === false
        if (browserOffline) {
          show({ type: "error", title: "Sem conexão", message: "Verifique sua internet e tente novamente." })
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
