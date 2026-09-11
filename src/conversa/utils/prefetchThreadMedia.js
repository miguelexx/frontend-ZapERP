/**
 * Prefetch de imagens/figurinhas da conversa assim que a thread carrega.
 *
 * Motivo: a `<img>` da bolha (ImageMessage) só começa a baixar quando o item entra no DOM
 * virtualizado. Ao abrir a conversa o usuário via a caixa cinza "is-loading" enquanto os bytes
 * chegavam — pior ainda para mídia recente que ainda é servida via `/media/proxy` (round-trip até
 * o CDN). Aqui aquecemos o cache HTTP do navegador com AS MESMAS URLs que a bolha vai pedir
 * (`resolveBubbleMediaCandidates` → candidates[0], incluindo o token do proxy), começando o
 * download no instante em que os dados chegam. Quando a bolha monta, o `<img src>` reusa a
 * requisição em voo / o cache e aparece na hora.
 *
 * Invariantes preservadas:
 *  - Não altera nada no fluxo de render nem no scroll/virtualização — só dispara `new Image()`.
 *  - Usa a MESMA resolução de URL da bolha, então a chave de cache bate (nenhum download extra).
 *  - Best-effort: qualquer falha é silenciosa; nunca lança.
 *  - Respeita "economia de dados" (Save-Data) e ignora blobs locais (já estão em memória).
 */

import {
  resolveBubbleMediaCandidates,
  normalizeMessageTipo,
} from "./conversaViewHelpers";

/** Quantas mídias recentes aquecer. As de baixo (mais novas) são as que renderizam primeiro. */
const MAX_PREFETCH = 14;

/** Evita reprefetch da mesma URL entre reaberturas/re-render; com teto para não vazar memória. */
const prefetched = new Set();
const PREFETCHED_CAP = 400;

function alreadyDone(url) {
  return prefetched.has(url);
}

function markDone(url) {
  if (prefetched.size >= PREFETCHED_CAP) {
    // Descarta o mais antigo (Set preserva ordem de inserção) para o teto valer.
    const first = prefetched.values().next().value;
    if (first !== undefined) prefetched.delete(first);
  }
  prefetched.add(url);
}

/** Usuário pediu para economizar dados → não aquecer nada. */
function saveDataOn() {
  try {
    return !!navigator?.connection?.saveData;
  } catch {
    return false;
  }
}

function isPrefetchableImage(msg) {
  const t = normalizeMessageTipo(msg?.tipo);
  return t === "imagem" || t === "sticker";
}

/**
 * Aquece o cache das imagens recentes da conversa. Não bloqueia nada; retorna imediatamente.
 * @param {Array<object>} mensagens Lista já ordenada cronologicamente (antiga → nova).
 */
export function prefetchThreadImages(mensagens) {
  try {
    if (typeof window === "undefined" || typeof Image === "undefined") return;
    if (!Array.isArray(mensagens) || mensagens.length === 0) return;
    if (saveDataOn()) return;

    const urls = [];
    const seen = new Set();
    // Da mais nova para a mais antiga: as de baixo aparecem primeiro ao abrir.
    for (let i = mensagens.length - 1; i >= 0 && urls.length < MAX_PREFETCH; i -= 1) {
      const msg = mensagens[i];
      if (!isPrefetchableImage(msg)) continue;
      const candidates = resolveBubbleMediaCandidates(msg);
      const first = candidates.find((u) => u && !u.startsWith("blob:"));
      if (!first || seen.has(first) || alreadyDone(first)) continue;
      seen.add(first);
      urls.push(first);
    }

    for (const url of urls) {
      markDone(url);
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      // decode() força o navegador a completar o pipeline (rede + decode) em background;
      // erros (404/403/rede) são engolidos — o retry/fallback vive na própria bolha.
      if (typeof img.decode === "function") {
        img.decode().catch(() => {});
      }
    }
  } catch {
    /* prefetch é best-effort; nunca afeta a abertura da conversa */
  }
}

/** Teste/limpeza: zera o cache de deduplicação. */
export function _resetPrefetchThreadMediaForTests() {
  prefetched.clear();
}
