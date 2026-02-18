// Regra de URL base:
// - Se existir `VITE_API_URL`, usamos ela.
// - Se não existir, usamos um fallback fixo.
//
// Observação: no Vite, `import.meta.env.VITE_*` é resolvido em build/dev server.

export const FALLBACK_API_URL =
  "https://zaperpapi.wmsistemas.inf.br"

function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim()
  if (!s) return ""

  // evita bugs comuns de configuração (.env com endpoint em vez de base)
  let url = s.replace(/\/+$/, "")
  url = url.replace(/\/usuarios\/login$/i, "")
  return url
}

export function getApiBaseUrl() {
  const fromEnv = normalizeBaseUrl(import.meta.env.VITE_API_URL)
  if (fromEnv) return fromEnv
  return normalizeBaseUrl(FALLBACK_API_URL)
}

