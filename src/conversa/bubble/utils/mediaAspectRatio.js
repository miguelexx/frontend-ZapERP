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

/*
 * Persistência entre recargas (19/11/2026). O cache era só de módulo: depois de um F5 toda foto
 * voltava a nascer quadrada e a "descobrir" a forma ao decodificar — com rede lenta, já com a
 * conversa à vista (salto de 80–100px medido). Guardar só chaves `m:<id da mensagem>`: chave
 * `u:<url>` pode levar token do /media/proxy na query e não vai para o storage.
 */
const STORAGE_KEY = "zap_media_ar_v1";
const PERSIST_MAX = 400;
let persistTimer = 0;

function loadPersisted() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const pair of arr) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [k, v] = pair;
      if (typeof k === "string" && k.startsWith("m:") && typeof v === "number" && v > 0 && v < 10) {
        cache.set(k, v);
      }
    }
  } catch {
    /* storage indisponível/corrompido: segue só com a memória */
  }
}

function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    try {
      const out = [];
      for (const [k, v] of cache) if (k.startsWith("m:")) out.push([k, v]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out.slice(-PERSIST_MAX)));
    } catch {
      /* quota/privado: ignora */
    }
  }, 1500);
}

loadPersisted();

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
  if (key.startsWith("m:")) schedulePersist();
}

/**
 * Aplica a proporção no elemento que desenha a moldura (o botão/cartão, não a imagem).
 * Feito de forma imperativa no próprio `onLoad` para a moldura acertar já no primeiro paint,
 * sem esperar o re-render do React.
 */
export function applyAspectRatioVar(el, ratio) {
  if (!el || !(ratio > 0)) return;
  markGlideEligibility(el);
  el.style.setProperty("--wa-media-ar", String(ratio));
}

/*
 * Só desliza (transição da moldura, janela `data-media-glide`) a foto que o atendente ESTÁ VENDO
 * (19/11/2026). Foto fora da tela que decodifica depois da abertura troca de forma na hora: a
 * âncora do fim absorve isso num frame só, invisível; animada, eram 400ms de remedições a
 * empurrar a tela 1–2px por frame sem benefício nenhum. Atributo imperativo (o React não o
 * gere): tem de estar posto ANTES da troca da proporção, no mesmo recálculo de estilo.
 */
function markGlideEligibility(el) {
  try {
    const scroller = el.closest && el.closest(".wa-messages");
    if (!scroller) return;
    const r = el.getBoundingClientRect();
    const v = scroller.getBoundingClientRect();
    const visivel = r.bottom > v.top && r.top < v.bottom;
    if (visivel) el.removeAttribute("data-ar-instant");
    else el.setAttribute("data-ar-instant", "1");
  } catch {
    /* sem layout (teste/SSR): segue sem marcar */
  }
}
