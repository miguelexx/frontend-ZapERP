export const LOCAL_MEDIA_LOSS_NOTICE = "Envio não confirmado. Recarregar (F5) ou fechar a página pode perder a cópia local. Ao reconectar, confira a conversa antes de reenviar.";

/* Mídia local (blob) sem id no servidor. */
function ehMidiaLocalSemServidor(msg) {
  const id = msg.id ?? msg.mensagem_id;
  if (id != null && String(id).trim() && String(id) !== String(msg.tempId) && !String(id).startsWith("temp-")) return false;
  const sources = [msg.url, msg.url_absoluta, msg.media_url, msg.mediaUrl, msg.file_url, msg.fileUrl, msg.download_url, msg.downloadUrl];
  if (sources.some((url) => /^(https?:\/\/|\/uploads\/)/i.test(String(url || "")))) return false;
  return [msg._optimisticBlobUrl, ...sources].some((url) => String(url || "").startsWith("blob:"));
}

/**
 * Aviso de "não recarregue" só para mídia local com envio INCERTO/offline (26/11/2026). Na
 * recusa definitiva (status erro) o texto falava em "reconectar", o que não era o caso — ali a
 * bolha mostra o motivo e o "Tentar novamente" (ver localMediaFailureText).
 */
export function shouldShowLocalMediaNotice(msg) {
  if (!msg || msg.apagada_para_todos || (msg.direcao !== "out" && msg.fromMe !== true)) return false;
  const status = String(msg.status_mensagem ?? msg.status ?? "").toLowerCase();
  if (!["status_indefinido", "aguardando_conexao"].includes(status)) return false;
  const id = msg.id ?? msg.mensagem_id;
  if (id != null && String(id).trim() && String(id) !== String(msg.tempId) && !String(id).startsWith("temp-")) return false;
  const sources = [msg.url, msg.url_absoluta, msg.media_url, msg.mediaUrl, msg.file_url, msg.fileUrl, msg.download_url, msg.downloadUrl];
  if (sources.some((url) => /^(https?:\/\/|\/uploads\/)/i.test(String(url || "")))) return false;
  return [msg._optimisticBlobUrl, ...sources].some((url) => String(url || "").startsWith("blob:"));
}

/** Recusa definitiva de mídia local: o motivo em uma linha, para a bolha (sem depender do toast). */
export function localMediaFailureText(msg) {
  if (!msg || msg.apagada_para_todos || (msg.direcao !== "out" && msg.fromMe !== true)) return "";
  const status = String(msg.status_mensagem ?? msg.status ?? "").toLowerCase();
  if (!["erro", "error", "failed", "falhou"].includes(status)) return "";
  if (!ehMidiaLocalSemServidor(msg)) return "";
  const motivo = String(msg.erro_mensagem || "").trim();
  return motivo ? `Não foi possível enviar: ${motivo}` : "Não foi possível enviar.";
}
