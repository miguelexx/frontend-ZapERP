import api from "../../../api/http";

/**
 * O botão "tentar de novo" da mídia recebida (áudio/imagem/etc.) pode pedir ao backend uma nova
 * cópia da mídia para /uploads — recupera casos em que a cópia automática falhou por um soluço
 * (rede/allowlist/backoff esgotado) mas o link do provedor ainda está vivo. Só faz sentido para
 * mídia RECEBIDA, persistida (id numérico do banco) e que ainda NÃO está em /uploads.
 *
 * Mídia nossa (out) usa o retry de reenvio; bolha otimista (tempId, sem id do banco) não tem o que
 * reprocessar. Nesses casos devolvemos `null` e o player mantém exatamente o comportamento antigo.
 */
export function canReprocessInboundMedia(msg, out) {
  if (out) return false;
  if (!msg || typeof msg !== "object") return false;
  const id = Number(msg.id ?? msg.mensagem_id);
  const conversaId = Number(msg.conversa_id ?? msg.conversaId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  if (!Number.isSafeInteger(conversaId) || conversaId <= 0) return false;
  const url = String(msg.url || "").trim();
  // Já está local: nada a reprocessar.
  if (url.startsWith("/uploads/")) return false;
  return true;
}

/**
 * Dispara a recópia no backend. Normaliza a resposta para o player decidir:
 *  - { ok:true }        → mídia recuperada; a bolha se atualiza pelo socket (nova_mensagem).
 *  - { definitivo:true }→ link expirou de vez; o player para de oferecer o botão.
 *  - { ok:false }       → falha transitória; mantém o botão de tentar de novo.
 * Nunca lança: qualquer erro de rede vira falha transitória.
 */
export async function requestInboundMediaReprocess(msg) {
  const id = Number(msg?.id ?? msg?.mensagem_id);
  const conversaId = Number(msg?.conversa_id ?? msg?.conversaId);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(conversaId)) {
    return { ok: false, definitivo: false };
  }
  try {
    const { data } = await api.post(
      `/chats/${conversaId}/mensagens/${id}/reprocessar-midia`
    );
    return {
      ok: !!data?.ok,
      url: typeof data?.url === "string" ? data.url : undefined,
      definitivo: !!data?.definitivo,
      motivo: data?.motivo,
    };
  } catch (err) {
    // 4xx com corpo classificado (ex.: tipo não copiável) ainda pode trazer `definitivo`.
    const body = err?.response?.data;
    if (body && typeof body === "object") {
      return { ok: false, definitivo: !!body.definitivo, motivo: body.motivo };
    }
    return { ok: false, definitivo: false };
  }
}
