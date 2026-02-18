// Regra de URL base:
// - Se existir `VITE_API_URL`, usamos ela.
// - Se não existir, usamos um fallback fixo.
//
// Observação: no Vite, `import.meta.env.VITE_*` é resolvido em build/dev server.

export const FALLBACK_API_URL =
  "https://zaperpapi.wmsistemas.inf.br"

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_URL || FALLBACK_API_URL
}

