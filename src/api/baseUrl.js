// Regra de URL base:
// - Se o build tiver variáveis `VITE_*` (ex.: veio de um `.env`), forçamos a API em produção.
// - Se NÃO tiver, usamos um fallback fixo.
//
// Observação: no Vite, `import.meta.env.VITE_*` é resolvido em build/dev server (não muda em runtime).

export const FALLBACK_API_URL =
  "http://wksos40okks4cccoogwwc8co.72.60.147.139.sslip.io"

export const ENV_API_URL = "https://zaperp.wmsistemas.inf.br"

export function getApiBaseUrl() {
  // "tem .env" na prática = existe `VITE_API_URL` em build/dev
  return import.meta.env.VITE_API_URL ? ENV_API_URL : FALLBACK_API_URL
}

