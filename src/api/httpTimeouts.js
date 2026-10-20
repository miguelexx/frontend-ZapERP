/** Timeouts HTTP do ZapERP — valores em ms. */
export const HTTP_TIMEOUT_DEFAULT_MS = 55_000;
export const HTTP_TIMEOUT_TEXT_MS = 55_000;
export const HTTP_TIMEOUT_UPLOAD_MIN_MS = 180_000; // 3 min
export const HTTP_TIMEOUT_UPLOAD_MAX_MS = 900_000; // 15 min
export const HTTP_TIMEOUT_LARGE_VIDEO_MAX_MS = 1_800_000; // 30 min (upload + compactação no servidor)
/** Throughput conservador para estimar upload em rede lenta (~50 KB/s). */
const UPLOAD_BYTES_PER_SEC = 50 * 1024;

/* ------------------------------------------------------------------ *
 * Orçamento WM (ERP Icthus) — doc 36, seção 3, lacuna 2
 *
 * O timeout é resolvido POR URL aqui, e não com um número solto no componente: o drawer do
 * orçamento tem três perfis de espera muito diferentes e cada um deles existe por um motivo
 * ligado ao backend, não ao gosto da tela.
 *
 * REGRA QUE NÃO PODE SER AFROUXADA: o timeout do `confirmar` precisa ser MAIOR que o do
 * backend. O backend tem uma máquina de estados (PREPARADO → ENVIANDO → CRIADO/INCERTO) e,
 * quando a chamada ao ERP estoura, é ELE que normaliza o estado e devolve um envelope dizendo
 * o que aconteceu. Se o navegador abortar primeiro, o atendente fica sem resposta exatamente
 * no único momento em que a dúvida "criou ou não criou?" é caríssima — e a correção NÃO é
 * tentar de novo (`comando_id` novo duplicaria orçamento). Então esperamos mais que o
 * servidor, de propósito: o teto configurável do backend é `WM_API_TIMEOUT_WRITE_MS` (máx.
 * 120 s no `wmApiClient`), e 150 s cobre isso mais a latência da nossa própria rota.
 * ------------------------------------------------------------------ */

/** Busca de produto: backend espera ~15 s da WM (`WM_API_TIMEOUT_READ_MS`) + folga local. */
export const HTTP_TIMEOUT_ORCAMENTO_BUSCA_MS = 30_000;
/** Preparação/prévia: backend usa o timeout de escrita (~30 s) + folga local. */
export const HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS = 45_000;
/** Confirmar/verificar: acima do teto de escrita do backend (120 s), ver regra acima. */
export const HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS = 150_000;

/**
 * Timeout de uma rota de orçamento, ou `0` quando a URL não é de orçamento.
 * Exportado para o service poder resolver o valor explicitamente (o interceptor de request só
 * chama `resolveRequestTimeoutMs` quando o caller não definiu timeout, e o `axios.create` já
 * aplica o default de 55 s — então quem precisa de um valor diferente pede por aqui).
 */
export function resolveOrcamentoTimeoutMs(url) {
  const u = String(url || "");
  if (!u.includes("/api/orcamentos")) return 0;
  if (/\/(confirmar|verificar)(\?|$)/.test(u)) return HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS;
  if (u.includes("/preparar")) return HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS;
  if (u.includes("/produtos/consultar")) return HTTP_TIMEOUT_ORCAMENTO_BUSCA_MS;
  // `GET /api/orcamentos/:id` é leitura do nosso banco: o default serve.
  return HTTP_TIMEOUT_DEFAULT_MS;
}

/**
 * Timeout de upload proporcional ao tamanho do arquivo.
 * Piso 3 min; teto 15 min em uploads comuns e 30 min para vídeo-fonte acima de 32 MB.
 */
export function resolveUploadTimeoutMs(fileOrSize) {
  const size =
    typeof fileOrSize === "number"
      ? fileOrSize
      : Number(fileOrSize?.size ?? fileOrSize?.tamanho ?? fileOrSize?.tamanho_bytes) || 0;
  const estimated = Math.ceil(size / UPLOAD_BYTES_PER_SEC) * 1000 + 60_000;
  const mime = typeof fileOrSize === "object" ? String(fileOrSize?.type || "").toLowerCase() : "";
  const name = typeof fileOrSize === "object" ? String(fileOrSize?.name || "").toLowerCase() : "";
  const isLargeVideo =
    size > 32 * 1024 * 1024 &&
    (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv|3gp|mpeg|mpg|ogv)$/i.test(name));
  const maxTimeout = isLargeVideo ? HTTP_TIMEOUT_LARGE_VIDEO_MAX_MS : HTTP_TIMEOUT_UPLOAD_MAX_MS;
  return Math.min(maxTimeout, Math.max(HTTP_TIMEOUT_UPLOAD_MIN_MS, estimated));
}

function formDataTotalFileBytes(formData) {
  if (typeof FormData === "undefined" || !(formData instanceof FormData)) return 0;
  let total = 0;
  try {
    for (const value of formData.values()) {
      if (value && typeof value === "object" && typeof value.size === "number") {
        total += value.size;
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}

/**
 * Resolve timeout por config Axios quando o caller não definiu um valor explícito.
 */
export function resolveRequestTimeoutMs(config) {
  if (config?.timeout != null && Number(config.timeout) > 0) {
    return Number(config.timeout);
  }
  const url = String(config?.url || "");
  const isUpload =
    url.includes("/arquivo") ||
    (typeof FormData !== "undefined" && config?.data instanceof FormData);
  if (isUpload) {
    const bytes = formDataTotalFileBytes(config.data);
    return resolveUploadTimeoutMs(bytes > 0 ? bytes : HTTP_TIMEOUT_UPLOAD_MIN_MS);
  }
  const orcamento = resolveOrcamentoTimeoutMs(url);
  if (orcamento > 0) return orcamento;
  return HTTP_TIMEOUT_DEFAULT_MS;
}
