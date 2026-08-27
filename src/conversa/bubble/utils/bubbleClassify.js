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

/**
 * Identifica o tipo da bolha e as flags de layout a partir da mensagem.
 * Status de envio NÃO entra aqui — a troca pending→sent→delivered→read não
 * deve reclassificar o renderer nem remontar mídia/áudio.
 */
export function classifyBubbleMessage(msg, mediaUrl = "", contactMeta) {
  const out = isOutgoingMessage(msg);
  const tipoMsg = safeString(msg?.tipo).toLowerCase();
  const isApagadaParaTodos = !!msg?.apagada_para_todos;
  const isImg =
    (tipoMsg === "imagem" || tipoMsg === "image") && !!mediaUrl && (!isApagadaParaTodos || !!mediaUrl);
  const isSticker =
    tipoMsg === "sticker" && !!mediaUrl && (!isApagadaParaTodos || !!mediaUrl);
  const isFile =
    (["arquivo", "documento", "document", "file"].includes(tipoMsg) ||
      looksLikeDocumentFilenameOnly(msg?.texto, msg?.nome_arquivo)) &&
    (!isApagadaParaTodos || !!mediaUrl);
  const isAudio = tipoMsg === "audio" && (!isApagadaParaTodos || !!mediaUrl);
  const isVoice = (tipoMsg === "voice" || tipoMsg === "ptt") && (!isApagadaParaTodos || !!mediaUrl);
  const isAudioOrVoice = isAudio || isVoice;
  const isVideo = (tipoMsg === "video" || tipoMsg === "vídeo") && (!isApagadaParaTodos || !!mediaUrl);
  const contactBubbleMeta = contactMeta !== undefined ? contactMeta : resolveContactMetaFromMessage(msg);
  const isContact = !!contactBubbleMeta;
  const isLocation = tipoMsg === "location";
  const isCall = !isApagadaParaTodos && tipoMsg === "call";
  const textoRaw = safeString(msg?.texto);
  const textoRawNorm = String(textoRaw || "").trim().toLowerCase();
  const isGenericMessagePlaceholder = textoRawNorm === "(mensagem)" || textoRawNorm === "(mensagem vazia)";
  const isMediaPlaceholderOnly = MEDIA_PLACEHOLDER_TEXTS.has(textoRawNorm);
  const shouldBlankPlaceholder =
    isGenericMessagePlaceholder || (isMediaPlaceholderOnly && !mediaUrl);
  const texto =
    isApagadaParaTodos && !textoRaw
      ? "Esta mensagem foi apagada para todos."
      : (shouldBlankPlaceholder ? "" : textoRaw);
  const hasText = !!texto;
  const fallbackContentLabel = getFallbackContentLabel(tipoMsg, textoRawNorm);
  const isPlaceholderCaption = isPlaceholderCaptionText(texto, msg?.nome_arquivo, isGenericMessagePlaceholder);
  const showCaption = (isImg || isVideo || isSticker) && hasText && !isPlaceholderCaption;
  const showAudioText = isAudioOrVoice && hasText && !isPlaceholderCaption;
  const isEncaminhado =
    !isApagadaParaTodos &&
    (!!msg?.encaminhado ||
      (typeof msg?.texto === "string" && msg.texto.trimStart().startsWith("[Encaminhado]")));
  const inlineMeta = !showCaption || (!isImg && !isVideo && !isSticker);
  const hasInlineMetaClass = inlineMeta && !isImg && !isVideo && !isSticker && !isAudioOrVoice;
  const showFloatingMetaTime =
    (!inlineMeta || ((isImg || isSticker || isVideo) && !showCaption)) ||
    (isAudioOrVoice && !!mediaUrl);
  const replyMeta = !isApagadaParaTodos ? msg?.reply_meta || null : null;
  const hasReply = !!(replyMeta && (replyMeta.name || replyMeta.snippet || replyMeta.thumb));
  const videoPlaybackUrl =
    (tipoMsg === "video" || tipoMsg === "vídeo") && mediaUrl
      ? getMediaPlaybackUrl(msg?.url, msg?.url_absoluta)
      : mediaUrl;
  const mediaKind = isSticker ? "figurinha" : isImg ? "imagem" : isVideo ? "video" : null;

  return {
    out,
    tipoMsg,
    isApagadaParaTodos,
    isImg,
    isSticker,
    isFile,
    isAudio,
    isVoice,
    isAudioOrVoice,
    isVideo,
    isContact,
    isLocation,
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
