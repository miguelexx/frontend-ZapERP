/**
 * "Salvar como…" de qualquer mídia da conversa (imagem, vídeo, áudio, figurinha, documento).
 *
 * Por que existe (auditoria de mídia 2026-10-20): até aqui SÓ documento tinha como salvar.
 * Imagem/vídeo/áudio/figurinha não tinham nenhuma ação de download, e o menu nativo do
 * navegador também não resolvia:
 *   - `.wa-bubble-img` tem `pointer-events: none` (o toque/clique precisa cair no botão pai),
 *     então o botão direito no desktop nem enxerga a imagem — o menu sai sem "Salvar imagem
 *     como…";
 *   - `.wa-messages .wa-bubble *` e `.wa-mediaViewer-img--zoomable` usam
 *     `-webkit-touch-callout: none` + `pointer-events: none` para o long-press abrir o menu do
 *     app (encaminhar) em vez do menu nativo do iOS.
 * Essas regras estão certas para os gestos; o que faltava era a ação explícita de baixar.
 *
 * O caminho é o mesmo já endurecido do documento: binário buscado COM JWT (nunca `<a href>`
 * com token na URL), e se a URL do provedor morreu, pede ao backend uma cópia nova
 * (`reprocessar-midia`) antes de desistir.
 */

import {
  buildMediaDownloadHref,
  fetchMediaBinaryAuthenticated,
  getMediaUrl,
} from "./utils/conversaViewHelpers";
import {
  canReprocessInboundMedia,
  requestInboundMediaReprocess,
} from "./bubble/utils/inboundMediaReprocess";
import { resolveMediaSaveFilename } from "./mediaSaveName";
import { useNotificationStore } from "../notifications/notificationStore";

const TIPOS_BAIXAVEIS = new Set([
  "imagem",
  "image",
  "foto",
  "photo",
  "sticker",
  "figurinha",
  "video",
  "vídeo",
  "audio",
  "áudio",
  "voice",
  "ptt",
  "arquivo",
  "documento",
  "document",
  "file",
  "pdf",
]);

function toastPadrao(payload) {
  try {
    useNotificationStore?.getState?.()?.showToast?.(payload);
  } catch {
    /* toast é best-effort; nunca deve derrubar o clique */
  }
}

/**
 * A mensagem tem mídia que faz sentido oferecer para baixar?
 *
 * `ehMidia` vem da classificação canônica da bolha (`classifyBubbleMessage`), que cobre casos
 * que o `tipo` sozinho não pega — documento gravado como `tipo='texto'` cujo texto É o nome do
 * arquivo. Sem ela, cai na lista de tipos.
 */
export function podeBaixarMidiaDaMensagem(msg, { mediaUrl, out, ehMidia } = {}) {
  if (!msg || typeof msg !== "object") return false;
  if (msg.apagada_para_todos) return false;
  const tipo = String(msg.tipo || "").trim().toLowerCase();
  const midia = ehMidia === undefined ? TIPOS_BAIXAVEIS.has(tipo) : Boolean(ehMidia);
  if (!midia) return false;
  if (String(mediaUrl || "").trim()) return true;
  // Sem URL utilizável ainda: só vale oferecer se existe mídia de verdade para o backend
  // recuperar. Documento identificado só pelo texto (tipo='texto') não tem o que recopiar.
  if (!TIPOS_BAIXAVEIS.has(tipo)) return false;
  return canReprocessInboundMedia(msg, out);
}

/**
 * Grava o blob no dispositivo.
 *
 * `<a download>` é o caminho do desktop e do Android. No iOS (iPhone/iPad, e iPad que se
 * anuncia como Macintosh) o Safari IGNORA o atributo em `blob:` — o clique abria o arquivo
 * numa aba ou simplesmente não fazia nada, que é exatamente o "não consigo salvar como".
 * Lá o caminho nativo é a folha de compartilhamento ("Salvar em Arquivos" / "Salvar imagem").
 *
 * @returns {Promise<"share"|"download"|"cancelled">}
 */
export async function saveBlobAs(blob, filename) {
  if (!blob || typeof blob.size !== "number" || blob.size === 0) {
    const err = new Error("empty_blob");
    err.code = "transient";
    throw err;
  }
  const nome = String(filename || "arquivo").trim() || "arquivo";

  let gestoExpirado = false;
  if (preferirCompartilhamentoNativo()) {
    try {
      const file = new File([blob], nome, { type: blob.type || "application/octet-stream" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: nome });
        return "share";
      }
    } catch (e) {
      // Usuário fechou a folha de compartilhamento: não é erro, não pode virar toast vermelho.
      if (e?.name === "AbortError") return "cancelled";
      // Download demorado: o navegador já considerou o toque "gasto" e recusa abrir a folha.
      // O `<a download>` abaixo ainda é tentado, mas no iOS pode não gravar nada — por isso
      // avisamos o usuário em vez de falhar calado.
      gestoExpirado = e?.name === "NotAllowedError" || e?.name === "SecurityError";
    }
  }

  baixarPorAncora(blob, nome);
  return gestoExpirado ? "gesture_expired" : "download";
}

/** iOS/iPadOS: Safari não baixa `blob:` por `<a download>`; usa a folha nativa. */
function preferirCompartilhamentoNativo() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  const ua = String(navigator.userAgent || "");
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const ehIOS = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1);
  return ehIOS;
}

function baixarPorAncora(blob, nome) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // O Safari/Firefox ainda está lendo o blob quando o clique retorna: revogar na hora
    // entrega arquivo de 0 byte.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 60000);
  }
}

/** URLs candidatas ao download, em ordem, sem repetir. */
function montarCandidatos({ msg, url, nomePreliminar, hrefs }) {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  (Array.isArray(hrefs) ? hrefs : []).forEach(push);
  if (msg) push(buildMediaDownloadHref(msg.url, msg.url_absoluta, nomePreliminar));
  if (url) push(buildMediaDownloadHref(url, null, nomePreliminar));
  push(url);
  /*
   * Último recurso: a URL direta, fora do proxy. Cobre o que o proxy recusa mas o arquivo
   * continua acessível — por exemplo mídia acima do teto de 80 MB do proxy (413).
   */
  if (msg) push(getMediaUrl(msg.url, msg.url_absoluta));
  return out;
}

/**
 * Bytes da mídia. `blob:`/`data:` (bolha otimista, áudio offline do IndexedDB) são locais —
 * `fetch` simples; mandar header Authorization para um blob URL pode falhar no navegador.
 */
async function baixarBinario(href) {
  const s = String(href || "").trim();
  if (s.startsWith("blob:") || s.startsWith("data:")) {
    const res = await fetch(s);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }
  return fetchMediaBinaryAuthenticated(s);
}

/**
 * Baixa a mídia e devolve `{ blob, filename }`. Lança `Error` com `code`:
 *  - `expired`   → o link morreu de vez no WhatsApp (nada a tentar);
 *  - `transient` → falha passageira (rede/lock/allowlist): vale tentar de novo.
 */
export async function fetchMediaForSave({ msg, url, fileName, tipo, hrefs } = {}) {
  const tipoFinal = tipo || msg?.tipo || "";
  const nomeInformado = fileName || msg?.nome_arquivo || "";
  // Nome preliminar só para o `?filename=` do backend; o definitivo sai depois, já com o
  // Content-Type real do blob.
  const nomePreliminar = resolveMediaSaveFilename({
    nomeArquivo: nomeInformado,
    url: url || msg?.url || msg?.url_absoluta,
    tipo: tipoFinal,
    criadoEm: msg?.criado_em,
  });

  let blob = null;
  for (const href of montarCandidatos({ msg, url, nomePreliminar, hrefs })) {
    try {
      blob = await baixarBinario(href);
      if (blob && blob.size > 0) break;
      blob = null;
    } catch {
      blob = null;
    }
  }

  if (!blob && msg && canReprocessInboundMedia(msg, String(msg?.direcao || "").toLowerCase() === "out")) {
    const r = await requestInboundMediaReprocess(msg);
    const urlNova = typeof r?.url === "string" ? r.url : "";
    if (r?.ok && (urlNova.startsWith("/uploads/") || urlNova.startsWith("/media/r2/"))) {
      const href = buildMediaDownloadHref(urlNova, null, nomePreliminar);
      try {
        const recuperado = await fetchMediaBinaryAuthenticated(href);
        if (recuperado && recuperado.size > 0) blob = recuperado;
      } catch {
        /* cai no erro abaixo */
      }
    } else if (r?.definitivo) {
      const err = new Error("expired");
      err.code = "expired";
      throw err;
    }
  }

  if (!blob) {
    const err = new Error("transient");
    err.code = "transient";
    throw err;
  }

  const filename = resolveMediaSaveFilename({
    nomeArquivo: nomeInformado,
    url: url || msg?.url || msg?.url_absoluta,
    tipo: tipoFinal,
    mimeType: blob.type,
    criadoEm: msg?.criado_em,
  });

  return { blob, filename };
}

const TOAST_EXPIRADO = {
  type: "warning",
  title: "Mídia expirou",
  message: "Este arquivo não está mais disponível no WhatsApp e não pôde ser recuperado.",
};

const TOAST_FALHA = {
  type: "error",
  title: "Não foi possível salvar",
  message: "Falha ao baixar a mídia. Tente novamente em instantes.",
};

/**
 * Fluxo completo com aviso ao usuário: baixa, salva e, se falhar, explica o motivo.
 * Nunca lança — devolve `true` quando o arquivo foi entregue ao dispositivo.
 */
export async function salvarMidiaComFeedback({
  msg,
  url,
  fileName,
  tipo,
  hrefs,
  showToast,
  toasts,
} = {}) {
  const toast = typeof showToast === "function" ? showToast : toastPadrao;
  try {
    const { blob, filename } = await fetchMediaForSave({ msg, url, fileName, tipo, hrefs });
    const resultado = await saveBlobAs(blob, filename);
    if (resultado === "gesture_expired") {
      // iOS: o download levou tempo demais e o Safari recusou abrir a folha de salvar.
      toast({
        type: "info",
        title: "Quase lá",
        message: "Se o arquivo não aparecer, toque em Salvar como… de novo.",
      });
    }
    return resultado !== "cancelled";
  } catch (err) {
    const expirado = toasts?.expirado || TOAST_EXPIRADO;
    const falha = toasts?.falha || TOAST_FALHA;
    toast(err?.code === "expired" ? expirado : falha);
    return false;
  }
}
