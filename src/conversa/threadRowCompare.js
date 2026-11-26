import { tickSignature } from "../utils/messageTicks";

/**
 * Comparação para React.memo do ThreadRow — evita re-render quando só outras linhas mudam.
 * Não compara callbacks (assumidos estáveis via useCallback no pai).
 */

function safeStr(v) {
  return v == null ? "" : String(v);
}

function safeReplySig(replyMeta) {
  if (!replyMeta || typeof replyMeta !== "object") return "";
  return [
    safeStr(replyMeta.replyToId ?? replyMeta.id ?? replyMeta.messageId),
    safeStr(replyMeta.name ?? replyMeta.senderName).slice(0, 120),
    safeStr(replyMeta.snippet ?? replyMeta.text ?? replyMeta.body).slice(0, 240),
    safeStr(replyMeta.thumb ?? replyMeta.thumbnail ?? replyMeta.url).slice(0, 200),
    safeStr(replyMeta.tipo ?? replyMeta.type),
  ].join("\u0002");
}

/*
 * Metas estruturadas que mudam a ALTURA da bolha (25/11/2026): o cartão de contato e os metas do
 * reply_meta (cartão de link, pedido, produto, catálogo, anúncio, Pix, triagem) ficavam fora da
 * assinatura — um patch só nesses campos deixava a linha memoizada velha até um re-render
 * qualquer, e ela "pulava" num momento aleatório. Campos compactos, nunca JSON do objeto todo
 * (a miniatura do cartão de link pode ser um data: URI de vários KB, e isto roda por linha).
 */
function contactMetaSig(cm) {
  if (!cm || typeof cm !== "object") return "";
  const list = Array.isArray(cm) ? cm : Array.isArray(cm.contacts) ? cm.contacts : [cm];
  const first = list[0] && typeof list[0] === "object" ? list[0] : {};
  const phones = Array.isArray(first.phones) ? first.phones : [];
  const phone0 = phones[0] && typeof phones[0] === "object" ? phones[0].phone ?? phones[0].number : phones[0];
  return [
    list.length,
    safeStr(first.name ?? first.nome ?? first.displayName ?? first.formatted_name).slice(0, 80),
    safeStr(first.phone ?? first.telefone ?? first.wa_id ?? phone0).slice(0, 40),
    safeStr(first.vcard ?? cm.vcard).length,
  ].join("\u0003");
}

function structuredReplyMetaSig(rm) {
  if (!rm || typeof rm !== "object") return "";
  const lp = rm.link_preview && typeof rm.link_preview === "object" ? rm.link_preview : null;
  const preview = safeStr(lp?.preview);
  const pick = (obj, ...keys) => {
    if (!obj || typeof obj !== "object") return "";
    for (const k of keys) if (obj[k] != null && obj[k] !== "") return safeStr(obj[k]).slice(0, 200);
    return "1";
  };
  return [
    lp
      ? [safeStr(lp.url).slice(0, 200), safeStr(lp.title).slice(0, 120), safeStr(lp.description).length, preview.length, preview.slice(0, 32)].join("\u0003")
      : "",
    rm.order ? `${pick(rm.order, "id", "order_id")}:${pick(rm.order, "total", "total_price", "status")}` : "",
    rm.product ? pick(rm.product, "id", "product_id", "name") : "",
    rm.catalog ? pick(rm.catalog, "id", "title", "name") : "",
    rm.ad ? pick(rm.ad, "source_url", "sourceUrl", "title") : "",
    rm.pix ? `${pick(rm.pix, "key", "chave")}:${pick(rm.pix, "type", "tipo")}` : "",
    rm.whapi_triage && typeof rm.whapi_triage === "object"
      ? `${pick(rm.whapi_triage, "id", "step", "etapa")}:${Object.keys(rm.whapi_triage).length}`
      : "",
  ].join("\u0002");
}

/** Campos que afetam render visual da bolha (sem comparar objeto msg inteiro por referência). */
export function messageRowVisualSignature(item) {
  if (!item || item.__type !== "msg") return "";
  return [
    safeStr(item.id),
    safeStr(item.tempId),
    safeStr(item.client_temp_id),
    safeStr(item.whatsapp_id),
    safeStr(item.status ?? item.status_mensagem),
    /* Regra única do tique (doc 14): `envio_demorado` (watchdog dos 45s), `aguardando_conexao`,
       `envio_incerto`, `lida_em`, `entregue_em` e `situacao` não mudam `status` — sem isto a
       linha memoizada não repintava e o tique âmbar "envio demorado" nunca aparecia. */
    tickSignature(item),
    item.envio_erro ? "1" : "0",
    item.em_retry || item._retrying ? "1" : "0",
    // Libera o "Tentar novamente" do áudio recusado antes de ser salvo (bubbleRetry).
    item.retry_local === true ? "1" : "0",
    // Bolha de áudio nascida no toque, antes do arquivo: troca para o player real ao completar.
    item._audioPreparando === true ? "1" : "0",
    safeStr(item.tipo),
    safeStr(item.texto ?? item.conteudo).slice(0, 512),
    safeStr(item._optimisticBlobUrl).slice(0, 200),
    safeStr(item.url).slice(0, 200),
    safeStr(item.url_absoluta).slice(0, 200),
    safeStr(item.media_url ?? item.mediaUrl).slice(0, 200),
    safeStr(item.file_url ?? item.fileUrl).slice(0, 200),
    safeStr(item.download_url ?? item.downloadUrl).slice(0, 200),
    safeStr(item.nome_arquivo).slice(0, 120),
    safeStr(item.tamanho ?? item.tamanho_bytes),
    safeStr(item.file_last_modified),
    item.apagada_para_todos ? "1" : "0",
    item.apagada_pelo_cliente ? "1" : "0",
    // Aviso de auditoria: quem/quando podem chegar depois do flag (socket/refresh).
    safeStr(item.apagada_em),
    safeStr(item.apagada_pelo_cliente_em),
    safeStr(item.apagada_por_usuario_id),
    safeStr(item.apagada_por_nome),
    item.encaminhado ? "1" : "0",
    item.__showRemetente ? "1" : "0",
    safeStr(item.__botCompact),
    safeStr(item.__reaction),
    item.__captionBundleTop ? "1" : "0",
    item.__captionBundleFollow ? "1" : "0",
    safeStr(item.remetente_nome),
    safeStr(item.remetente_telefone),
    safeStr(item.usuario_nome),
    item.enviado_por_usuario ? "1" : "0",
    safeStr(item.criado_em),
    safeStr(item.direcao),
    item.editado === true || item.editada === true ? "1" : "0",
    safeStr(item.editada_em),
    safeReplySig(item.reply_meta),
    // Votos chegam por mensagem_editada sem mudar texto, status ou editada_em.
    item.reply_meta?.poll ? JSON.stringify(item.reply_meta.poll) : "",
    safeStr(item.location_live),
    item.location_meta ? JSON.stringify(item.location_meta) : "",
    contactMetaSig(item.contact_meta),
    structuredReplyMetaSig(item.reply_meta),
  ].join("\u0001");
}

export function threadRowPropsAreEqual(prev, next) {
  const prevItem = prev?.item;
  const nextItem = next?.item;

  if (!prevItem || !nextItem) return prevItem === nextItem;
  if (prevItem.__type !== nextItem.__type) return false;

  if (prevItem.__type === "day") {
    return prevItem.id === nextItem.id && prevItem.label === nextItem.label;
  }

  if (prev.messageKey !== next.messageKey) return false;
  if (prev.messageVisualSig !== next.messageVisualSig) return false;
  if (prev.tzVersion !== next.tzVersion) return false;
  if (prev.allowEnterAnimation !== next.allowEnterAnimation) return false;

  if (prev.isSelected !== next.isSelected) return false;
  if (prev.selectMode !== next.selectMode) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.isStarred !== next.isStarred) return false;
  if (prev.reactionForMessage !== next.reactionForMessage) return false;
  if (Boolean(prev.reactionFromPeer) !== Boolean(next.reactionFromPeer)) return false;
  if (prev.reactionLoadingForMessage !== next.reactionLoadingForMessage) return false;
  if (prev.showMobileReactionPicker !== next.showMobileReactionPicker) return false;

  if (prev.isGroup !== next.isGroup) return false;
  if (prev.peerAvatarUrl !== next.peerAvatarUrl) return false;
  if (prev.peerName !== next.peerName) return false;
  if (prev.currentUserId !== next.currentUserId) return false;
  if (prev.whatsappInstanceProvider !== next.whatsappInstanceProvider) return false;
  if (prev.mostrarNomeAoCliente !== next.mostrarNomeAoCliente) return false;
  if (prev.swipeReplyEnabled !== next.swipeReplyEnabled) return false;
  if (prev.mobileMessageChrome !== next.mobileMessageChrome) return false;
  if (prev.menuUsesBottomSheet !== next.menuUsesBottomSheet) return false;

  return true;
}
