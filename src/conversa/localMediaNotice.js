export const LOCAL_MEDIA_LOSS_NOTICE = "Envio não confirmado. Recarregar (F5) ou fechar a página pode perder a cópia local. Ao reconectar, confira a conversa antes de reenviar.";

/** Aviso só para mídia local com falha/incerteza, nunca para texto ou mídia confirmada. */
export function shouldShowLocalMediaNotice(msg) {
  if (!msg || msg.apagada_para_todos || (msg.direcao !== "out" && msg.fromMe !== true)) return false;
  const status = String(msg.status_mensagem ?? msg.status ?? "").toLowerCase();
  if (!["status_indefinido", "erro", "error", "failed", "falhou", "aguardando_conexao"].includes(status)) return false;
  const id = msg.id ?? msg.mensagem_id;
  if (id != null && String(id).trim() && String(id) !== String(msg.tempId) && !String(id).startsWith("temp-")) return false;
  const sources = [msg.url, msg.url_absoluta, msg.media_url, msg.mediaUrl, msg.file_url, msg.fileUrl, msg.download_url, msg.downloadUrl];
  if (sources.some((url) => /^(https?:\/\/|\/uploads\/)/i.test(String(url || "")))) return false;
  return [msg._optimisticBlobUrl, ...sources].some((url) => String(url || "").startsWith("blob:"));
}
