import { resolveContactMetaFromMessage } from "../../../utils/conversaUtils";
import {
  safeString,
  isOutgoingMessage,
  isFilenameOnlyText,
  looksLikeDocumentFilenameOnly,
  getMediaPlaybackUrl,
} from "../../utils/conversaViewHelpers";

// Placeholders de mídia gravados pelo backend quando a URL ainda não chegou
// (webhook_message_download_media/retry pendente). Sem URL para renderizar, tratamos
// como "vazio" para cair no rótulo tipado (📷 Foto / 🎥 Vídeo / 🎤 Áudio / 📄 Documento)
// em vez de exibir o texto entre parênteses ou uma bolha genérica "Mensagem".
export const MEDIA_PLACEHOLDER_TEXTS = new Set([
  "(mídia)", "(midia)", "(imagem)", "(áudio)", "(audio)", "(áudio de voz)",
  "(vídeo)", "(video)", "(vídeo visualização única)", "(figurinha)", "(arquivo)", "(documento)",
]);

export function getFallbackContentLabel(tipoMsg, textoRawNorm) {
  const t = String(tipoMsg || "").toLowerCase();
  if (t === "audio") return "🎤 Áudio";
  if (t === "voice" || t === "ptt") return "🎤 Mensagem de voz";
  if (t === "imagem" || t === "image") return "📷 Foto";
  if (t === "video" || t === "vídeo") return "🎥 Vídeo";
  if (["arquivo", "documento", "document", "file"].includes(t)) return "📄 Documento";
  if (t === "sticker") return "Figurinha";
  if (t === "location") return "📍 Localização";
  if (t === "contact" || t === "contato") return "👤 Contato";
  if (t === "poll" || t === "enquete") return "📊 Enquete";
  if (t === "product") return "🛍️ Produto";
  if (t === "catalog") return "🛍️ Catálogo";
  const p = textoRawNorm;
  if (p === "(áudio)" || p === "(audio)") return "🎤 Áudio";
  if (p === "(áudio de voz)") return "🎤 Mensagem de voz";
  if (p === "(imagem)") return "📷 Foto";
  if (p === "(vídeo)" || p === "(video)" || p === "(vídeo visualização única)") return "🎥 Vídeo";
  if (p === "(arquivo)" || p === "(documento)") return "📄 Documento";
  if (p === "(figurinha)") return "Figurinha";
  if (p === "(mídia)" || p === "(midia)") return "📎 Mídia";
  return "Mensagem";
}

export function isPlaceholderCaptionText(texto, nomeArquivo, isGenericMessagePlaceholder = false) {
  return (
    !texto ||
    isGenericMessagePlaceholder ||
    texto === "(mídia)" ||
    texto === "(mensagem vazia)" ||
    texto === "(imagem)" ||
    texto === "(áudio)" ||
    texto === "(áudio de voz)" ||
    texto === "(vídeo)" ||
    texto === "(figurinha)" ||
    texto === "(arquivo)" ||
    isFilenameOnlyText(texto, nomeArquivo)
  );
}

export function canDeleteMessageForEveryone(msg, { out, currentUserId }) {
  if (!out) return false;
  if (msg?.apagada_para_todos) return false;
  if (currentUserId == null) return false;
  if (msg?.autor_usuario_id == null) return false;
  return String(msg.autor_usuario_id) === String(currentUserId);
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const TEXT_EDIT_MAX_LEN = 4096;
export const CAPTION_EDIT_MAX_LEN = 1024;

const TEXT_EDIT_TIPOS = new Set(["texto", "text", "chat"]);
const CAPTION_EDIT_TIPOS = new Set([
  "imagem",
  "image",
  "video",
  "vídeo",
  "arquivo",
  "document",
  "documento",
  "file",
]);

export function isMediaCaptionEditTipo(tipo) {
  return CAPTION_EDIT_TIPOS.has(String(tipo || "").trim().toLowerCase());
}

export function isTextEditTipo(tipo) {
  return TEXT_EDIT_TIPOS.has(String(tipo || "").trim().toLowerCase());
}

export function isInternalNoteEditTipo(msg) {
  const tipo = String(msg?.tipo || "").trim().toLowerCase();
  const direcao = String(msg?.direcao || "").trim().toLowerCase();
  return tipo === "internal_note" || direcao === "interna";
}

export function isMessageEdited(msg) {
  return msg?.editado === true || msg?.editada === true;
}

function parseCriadoEmMs(criadoEm) {
  if (criadoEm == null || criadoEm === "") return NaN;
  if (criadoEm instanceof Date) {
    const t = criadoEm.getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  const s = String(criadoEm).trim();
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1e11) return asNum;
  if (Number.isFinite(asNum) && asNum > 1e9 && asNum < 1e11) return asNum * 1000;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Texto a colocar no composer ao editar. Placeholders internos de mídia
 * ("(imagem)", "(vídeo)", nome de arquivo) viram input vazio.
 */
export function getEditableComposerText(msg) {
  const raw = String(msg?.texto ?? msg?.conteudo ?? "").trim();
  if (!raw) return "";
  const tipo = String(msg?.tipo || "").trim().toLowerCase();
  const norm = raw.toLowerCase();
  if (MEDIA_PLACEHOLDER_TEXTS.has(norm) || norm === "(mensagem)" || norm === "(mensagem vazia)") {
    return "";
  }
  if (isMediaCaptionEditTipo(tipo) && isPlaceholderCaptionText(raw, msg?.nome_arquivo)) {
    return "";
  }
  return raw;
}

/**
 * Quando mostrar "Editar" no menu. Espelha o autor de canDeleteMessageForEveryone
 * (só o autor; admin não ganha item extra) e exige instância Whapi, salvo nota interna.
 */
export function canEditMessage(msg, { out, currentUserId, provider, nowMs = Date.now() } = {}) {
  if (!msg) return false;
  if (msg.apagada_para_todos) return false;

  const isNote = isInternalNoteEditTipo(msg);
  if (!isNote && String(provider || "").trim().toLowerCase() !== "whapi") return false;
  if (!isNote && !out) return false;

  if (currentUserId == null || currentUserId === "") return false;
  if (msg.autor_usuario_id == null) return false;
  if (String(msg.autor_usuario_id) !== String(currentUserId)) return false;

  const created = parseCriadoEmMs(msg.criado_em);
  if (!Number.isFinite(created) || nowMs - created >= EDIT_WINDOW_MS) return false;

  if (!isNote) {
    const wa = msg.whatsapp_id != null ? String(msg.whatsapp_id).trim() : "";
    if (!wa) return false;
    const tipo = String(msg.tipo || "").trim().toLowerCase();
    if (!TEXT_EDIT_TIPOS.has(tipo) && !CAPTION_EDIT_TIPOS.has(tipo)) return false;
    const status = String(msg.status_mensagem || msg.status || "").toLowerCase();
    const pendingOrErr =
      status === "pending" ||
      status === "sending" ||
      status === "erro" ||
      status === "error" ||
      msg.envio_erro === true;
    if (pendingOrErr && !wa) return false;
  }

  return true;
}

/**
 * Identifica o tipo da bolha e as flags de layout a partir da mensagem.
 * Status de envio NÃO entra aqui — a troca pending→sent→delivered→read não
 * deve reclassificar o renderer nem remontar mídia/áudio.
 */
export function classifyBubbleMessage(msg, mediaUrl = "", contactMeta) {
  const out = isOutgoingMessage(msg);
  const tipoMsg = safeString(msg?.tipo).toLowerCase();
  // Exclusão AUDITÁVEL: apagar "para todos" (nosso atendente) e "o contato apagou" (cliente)
  // NÃO escondem mais o conteúdo — o balão original permanece e só ganha um aviso acima.
  const isApagadaParaTodos = !!msg?.apagada_para_todos;
  const isApagadaPeloCliente = !isApagadaParaTodos && !!msg?.apagada_pelo_cliente;
  // Metadados do aviso "apagada": quem (atendente/cliente) e quando. O nome/"Você" é
  // resolvido no shell (precisa do currentUserId). Mantém o balão no lugar.
  const deletionInfo = isApagadaParaTodos
    ? {
        kind: "atendente",
        at: msg?.apagada_em ?? null,
        porUsuarioId: msg?.apagada_por_usuario_id ?? null,
        porNome: msg?.apagada_por_nome ?? null,
      }
    : isApagadaPeloCliente
    ? { kind: "cliente", at: msg?.apagada_pelo_cliente_em ?? null, porUsuarioId: null, porNome: null }
    : null;
  const isImg = (tipoMsg === "imagem" || tipoMsg === "image") && !!mediaUrl;
  const isSticker = tipoMsg === "sticker" && !!mediaUrl;
  const isFile =
    ["arquivo", "documento", "document", "file"].includes(tipoMsg) ||
    looksLikeDocumentFilenameOnly(msg?.texto, msg?.nome_arquivo);
  const isAudio = tipoMsg === "audio";
  const isVoice = tipoMsg === "voice" || tipoMsg === "ptt";
  const isAudioOrVoice = isAudio || isVoice;
  const isVideo = tipoMsg === "video" || tipoMsg === "vídeo";
  const contactBubbleMeta = contactMeta !== undefined ? contactMeta : resolveContactMetaFromMessage(msg);
  const isContact = !!contactBubbleMeta;
  const isLocation = tipoMsg === "location";
  const isPoll = tipoMsg === "poll" || tipoMsg === "enquete" || !!(msg?.reply_meta?.poll);
  const triageMeta = (msg?.reply_meta?.whapi_triage && typeof msg.reply_meta.whapi_triage === "object")
    ? msg.reply_meta.whapi_triage
    : null;
  const isInteractive = !!triageMeta && !isPoll;
  const productMeta = (msg?.reply_meta?.product && typeof msg.reply_meta.product === "object")
    ? msg.reply_meta.product
    : null;
  const catalogMeta = (msg?.reply_meta?.catalog && typeof msg.reply_meta.catalog === "object")
    ? msg.reply_meta.catalog
    : null;
  const isProduct = tipoMsg === "product" || !!productMeta;
  const isCatalog = !isProduct && (tipoMsg === "catalog" || !!catalogMeta);
  const isCall = tipoMsg === "call";
  const textoRaw = safeString(msg?.texto);
  const textoRawNorm = String(textoRaw || "").trim().toLowerCase();
  const isGenericMessagePlaceholder = textoRawNorm === "(mensagem)" || textoRawNorm === "(mensagem vazia)";
  const isMediaPlaceholderOnly = MEDIA_PLACEHOLDER_TEXTS.has(textoRawNorm);
  const shouldBlankPlaceholder =
    isGenericMessagePlaceholder || (isMediaPlaceholderOnly && !mediaUrl);
  const texto = shouldBlankPlaceholder ? "" : textoRaw;
  const hasText = !!texto;
  const fallbackContentLabel = getFallbackContentLabel(tipoMsg, textoRawNorm);
  const isPlaceholderCaption = isPlaceholderCaptionText(texto, msg?.nome_arquivo, isGenericMessagePlaceholder);
  const showCaption = (isImg || isVideo || isSticker) && hasText && !isPlaceholderCaption;
  const showAudioText = isAudioOrVoice && hasText && !isPlaceholderCaption;
  const isEncaminhado =
    !!msg?.encaminhado ||
    (typeof msg?.texto === "string" && msg.texto.trimStart().startsWith("[Encaminhado]"));
  const inlineMeta = !showCaption || (!isImg && !isVideo && !isSticker);
  const hasInlineMetaClass = inlineMeta && !isImg && !isVideo && !isSticker && !isAudioOrVoice;
  const showFloatingMetaTime =
    (!inlineMeta || ((isImg || isSticker || isVideo) && !showCaption)) ||
    (isAudioOrVoice && !!mediaUrl);
  const replyMeta = msg?.reply_meta || null;
  const pollMeta = (replyMeta?.poll && typeof replyMeta.poll === "object")
    ? replyMeta.poll
    : null;
  const hasReply = !!(
    replyMeta &&
    !replyMeta.poll &&
    (replyMeta.name || replyMeta.snippet || replyMeta.thumb)
  );
  const videoPlaybackUrl =
    (tipoMsg === "video" || tipoMsg === "vídeo") && mediaUrl
      ? getMediaPlaybackUrl(msg?.url, msg?.url_absoluta)
      : mediaUrl;
  const mediaKind = isSticker ? "figurinha" : isImg ? "imagem" : isVideo ? "video" : null;

  return {
    out,
    tipoMsg,
    isApagadaParaTodos,
    isApagadaPeloCliente,
    deletionInfo,
    isImg,
    isSticker,
    isFile,
    isAudio,
    isVoice,
    isAudioOrVoice,
    isVideo,
    isContact,
    isLocation,
    isPoll,
    pollMeta,
    isInteractive,
    triageMeta,
    isProduct,
    productMeta,
    isCatalog,
    catalogMeta,
    isCall,
    contactBubbleMeta,
    texto,
    hasText,
    fallbackContentLabel,
    showCaption,
    showAudioText,
    isEncaminhado,
    inlineMeta,
    hasInlineMetaClass,
    showFloatingMetaTime,
    replyMeta,
    hasReply,
    videoPlaybackUrl,
    mediaKind,
  };
}
