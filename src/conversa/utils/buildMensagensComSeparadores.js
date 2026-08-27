import {
  formatDia,
  sameDay,
  safeString,
  isOutgoingMessage,
  isMediaCaptionBundleTop,
  isPlainCaptionFollowMessage,
  mediaHasInlineCaption,
  captionTextsEquivalent,
  messageHasReplyMeta,
  sameCaptionBundleAuthor,
  captionFollowTimeOk,
} from "./conversaViewHelpers";

const timelineMsgRowCache = new WeakMap();

export function getOrCreateTimelineMsgRow(msg, showRemetente, reaction) {
  const cached = timelineMsgRowCache.get(msg);
  if (
    cached &&
    cached.__showRemetente === showRemetente &&
    cached.__reaction === reaction &&
    !cached.__captionBundleTop &&
    !cached.__captionBundleFollow
  ) {
    return cached;
  }
  const row = { ...msg, __type: "msg", __showRemetente: showRemetente, __reaction: reaction };
  timelineMsgRowCache.set(msg, row);
  return row;
}

/**
 * Monta a lista virtualizada: separadores de dia, nome de remetente em grupos,
 * reações inbound e bundle visual foto+legenda. Extraído de ConversaView sem
 * alterar a regra de agrupamento.
 */
export function buildMensagensComSeparadores(mensagens, isGroup) {
  const raw = Array.isArray(mensagens) ? mensagens : [];
  const list = [];
  const reactionsByMsgId = {};

  for (let i = 0; i < raw.length; i++) {
    const msg = raw[i];
    if (!msg) continue;
    const tipo = safeString(msg.tipo).toLowerCase();
    if (tipo === "reaction") {
      const text = safeString(msg.texto || msg.message || msg.body);
      let emoji = "";
      const m = text.match(/rea[cç][aã]o:\s*(.+)$/i);
      if (m && m[1]) {
        emoji = m[1].trim();
      } else if (text) {
        emoji = text.slice(-2).trim() || text.slice(-1);
      }
      const prevMsg = list[list.length - 1];
      if (prevMsg && prevMsg.id != null && emoji) {
        reactionsByMsgId[String(prevMsg.id)] = emoji;
      }
      continue;
    }
    list.push(msg);
  }

  const out = [];

  const senderKey = (m) => {
    if (!m) return "";
    const tel = safeString(m?.remetente_telefone);
    const n = safeString(m?.remetente_nome);
    return tel || n || "";
  };

  for (let i = 0; i < list.length; i++) {
    const msg = list[i];
    if (!msg) continue;
    const prev = list[i - 1];

    const isNewDay = i === 0 || !sameDay(prev?.criado_em, msg?.criado_em);
    if (isNewDay) {
      const label = formatDia(msg?.criado_em) || "Data";
      out.push({ __type: "day", id: `day-${label}-${i}`, label });
    }

    const outMsg = isOutgoingMessage(msg);
    const prevOut = isOutgoingMessage(prev);
    const curSender = senderKey(msg);
    const prevSender = senderKey(prev);

    const showRemetente =
      isGroup &&
      !outMsg &&
      Boolean(curSender) &&
      (isNewDay || !prev || prevOut || curSender !== prevSender);

    const reaction = reactionsByMsgId[String(msg.id)];

    out.push(getOrCreateTimelineMsgRow(msg, showRemetente, reaction));
  }

  for (let i = 0; i < out.length; i++) {
    const row = out[i];
    if (row.__type !== "msg") continue;
    let prevIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (out[j].__type === "msg") {
        prevIdx = j;
        break;
      }
    }
    if (prevIdx < 0) continue;
    const prev = out[prevIdx];
    const cur = row;
    if (!isMediaCaptionBundleTop(prev)) continue;
    if (mediaHasInlineCaption(prev)) {
      if (
        isPlainCaptionFollowMessage(cur) &&
        !messageHasReplyMeta(cur) &&
        sameCaptionBundleAuthor(prev, cur) &&
        captionFollowTimeOk(prev, cur) &&
        captionTextsEquivalent(prev, cur)
      ) {
        out.splice(i, 1);
        i -= 1;
      }
      continue;
    }
    if (!isPlainCaptionFollowMessage(cur)) continue;
    if (messageHasReplyMeta(cur)) continue;
    if (!sameCaptionBundleAuthor(prev, cur)) continue;
    if (!captionFollowTimeOk(prev, cur)) continue;
    out[prevIdx] = { ...prev, __captionBundleTop: true };
    out[i] = { ...cur, __captionBundleFollow: true };
  }

  return out;
}
