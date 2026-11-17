/**
 * Proporção real da mídia da bolha (foto, vídeo, cartão de link).
 *
 * Por que isto existe: o WhatsApp monta a bolha NA FORMA da mídia — retrato fica alto e
 * estreito, paisagem fica largo e baixo, e a foto encosta nas bordas do cartão. O frame fixo
 * (1/1 na foto, 16/9 no vídeo) que havia aqui ou deixava tarja cinza dos dois lados
 * (`object-fit: contain`) ou cortava o assunto (`object-fit: cover`).
 *
 * A proporção só é conhecida depois que o arquivo decodifica, e a thread é virtualizada: ao
 * rolar de volta a linha remonta e a proporção seria "descoberta" de novo, empurrando o scroll
 * (CLS). Por isso o valor fica num cache de módulo por mensagem/URL: na remontagem a bolha já
 * nasce com a moldura certa. Antes do primeiro load vale o fallback (quadrado), igual a antes.
 */

/**
 * Retrato máximo = 9:16, a proporção da câmera e do print do celular: a foto mais comum
 * aparece INTEIRA. Mais alto que isto (print de tela 19.5:9, por exemplo) o WhatsApp corta,
 * em vez de esticar a bolha pela conversa toda.
 */
export const MEDIA_AR_MIN = 0.5625;
/** Paisagem máxima (≈ 12:5) — panorâmicas viram faixa, não bolha de 2px de altura. */
export const MEDIA_AR_MAX = 2.4;

/** Cartão de link: o WhatsApp mantém a miniatura entre quase quadrada e og:image (1.91/1). */
export const LINK_PREVIEW_AR_MIN = 0.92;
export const LINK_PREVIEW_AR_MAX = 1.91;

const MAX_ENTRIES = 600;
const cache = new Map();

/**
 * Normaliza largura/altura naturais em um número (w/h) já limitado à faixa.
 * Retorna 0 quando as dimensões não servem (arquivo quebrado, metadados ausentes).
 */
export function clampAspectRatio(width, height, min = MEDIA_AR_MIN, max = MEDIA_AR_MAX) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.round(Math.min(max, Math.max(min, ratio)) * 1000) / 1000;
}

/**
 * Chave estável da mídia: tempId → client_temp_id → id local → id do provedor → URL.
 * tempId PRIMEIRO (16/11/2026): numa foto enviada, `id` e `whatsapp_id` chegam em patches
 * separados da URL; com o id do provedor à frente a chave mudava, `recall` devolvia 0 e a
 * moldura voltava ao quadrado sem `onLoad` novo para a corrigir. O reconcile preserva o
 * tempId, então a chave fica igual durante toda a vida da bolha.
 */
export function mediaRatioKey(msg, fallbackSrc) {
  const m = msg && typeof msg === "object" ? msg : null;
  const id =
    (m && (m.tempId || m.client_temp_id || m.id || m.whatsapp_id)) || "";
  if (id) return `m:${id}`;
  const src = String(fallbackSrc || "").trim();
  // blob: muda a cada sessão — não serve de chave entre remontagens.
  if (!src || src.startsWith("blob:")) return "";
  return `u:${src}`;
}

export function recallAspectRatio(key) {
  if (!key) return 0;
  const value = cache.get(key);
  return typeof value === "number" && value > 0 ? value : 0;
}

export function rememberAspectRatio(key, ratio) {
  if (!key || !(ratio > 0)) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, ratio);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
}

/**
 * Aplica a proporção no elemento que desenha a moldura (o botão/cartão, não a imagem).
 * Feito de forma imperativa no próprio `onLoad` para a moldura acertar já no primeiro paint,
 * sem esperar o re-render do React.
 */
export function applyAspectRatioVar(el, ratio) {
  if (!el || !(ratio > 0)) return;
  el.style.setProperty("--wa-media-ar", String(ratio));
}
