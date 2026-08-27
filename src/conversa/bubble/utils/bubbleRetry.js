export function getRetryUiState(msg, classified, { onReenviarFalha, onReenviarAudio } = {}) {
  const {
    out,
    isAudioOrVoice,
    isImg,
    isVideo,
    isSticker,
    isFile,
    isLocation,
    isContact,
    tipoMsg,
  } = classified || {};
  const retryMensagemId = msg?.id ?? msg?.mensagem_id;
  const retryStatus = String(msg?.status_mensagem ?? msg?.status ?? "").toLowerCase();
  const retryFailedConfirmed =
    msg?.envio_erro === true ||
    ["erro", "error", "failed", "falhou"].includes(retryStatus);
  const retryBlockedStatus = [
    "pending",
    "sending",
    "enviando",
    "sent",
    "enviada",
    "delivered",
    "entregue",
    "read",
    "lida",
    "played",
    "status_indefinido",
    "aguardando_conexao",
  ].includes(retryStatus) || !!msg?.aguardando_conexao;
  const tipoNorm = String(msg?.tipo || "").toLowerCase();
  const isRetryableText =
    !isAudioOrVoice &&
    !isImg &&
    !isVideo &&
    !isSticker &&
    !isFile &&
    !isLocation &&
    !isContact &&
    tipoMsg !== "call" &&
    (tipoNorm === "" || tipoNorm === "texto" || tipoNorm === "text" || tipoNorm === "chat");
  const isRetryableMedia =
    isAudioOrVoice || isImg || isVideo || isFile || isSticker;
  const onRetry =
    typeof onReenviarFalha === "function"
      ? onReenviarFalha
      : typeof onReenviarAudio === "function"
        ? onReenviarAudio
        : null;
  const canShowRetry =
    out &&
    retryMensagemId != null &&
    String(retryMensagemId).trim() !== "" &&
    typeof onRetry === "function" &&
    retryFailedConfirmed &&
    !retryBlockedStatus &&
    (isRetryableText || isRetryableMedia);
  const isRetrying = !!(msg?.em_retry || msg?._retrying);

  return {
    retryMensagemId,
    retryStatus,
    tipoNorm,
    isRetryableText,
    isRetryableMedia,
    onRetry,
    canShowRetry,
    isRetrying,
  };
}

export function buildRetryPayload(msg, retry) {
  return {
    mensagemId: retry.retryMensagemId,
    tempId: msg?.tempId ?? msg?.client_temp_id ?? null,
    kind: retry.isRetryableText ? "text" : "media",
    tipo: retry.tipoNorm || (retry.isRetryableText ? "texto" : "arquivo"),
  };
}

export function buildAudioRetryPayload(msg, retry) {
  return {
    mensagemId: retry.retryMensagemId,
    tempId: msg?.tempId ?? msg?.client_temp_id ?? null,
    kind: "media",
    tipo: retry.tipoNorm || "audio",
  };
}
