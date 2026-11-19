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
import { botTriageLabel, classifyBotTriageMessage, isSystemTransferMovement } from "./botTriageDisplay";
import { isInternalMovementMessage } from "./internalMovement";
import { isInternalNote } from "../internalNote";

const timelineMsgRowCache = new WeakMap();

export function getOrCreateTimelineMsgRow(msg, showRemetente, reaction, botCompact = null) {
  const cached = timelineMsgRowCache.get(msg);
  if (
    cached &&
    cached.__showRemetente === showRemetente &&
    cached.__reaction === reaction &&
    (cached.__botCompact ?? null) === botCompact &&
    !cached.__captionBundleTop &&
    !cached.__captionBundleFollow
  ) {
    return cached;
  }
  const row = { ...msg, __type: "msg", __showRemetente: showRemetente, __reaction: reaction };
  /* Rótulo da pílula da triagem automática (botTriageDisplay) — só visual. */
  if (botCompact) {
    row.__botCompact = botCompact;
    row.__botCompactKind = botCompact.startsWith("Menu") ? "menu" : "confirmacao";
  }
  timelineMsgRowCache.set(msg, row);
  return row;
}

/**
 * Monta a lista virtualizada: separadores de dia, nome de remetente em grupos,
 * reações inbound e bundle visual foto+legenda. Extraído de ConversaView sem
 * alterar a regra de agrupamento.
 */
export function buildMensagensComSeparadores(mensagens, isGroup, opts = {}) {
  /* Perfil supervisor não vê os cards de "Movimentação interna" (19/11/2026) — só visual. */
  const ocultarMovimentacoes = opts?.ocultarMovimentacoesInternas === true;
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
      } else if (text && !/^\s*rea[cç][aã]o\s*:?\s*$/i.test(text)) {
        /* Só aceita emoji de verdade. Antes `text.slice(-2)` pegava as 2 últimas letras:
           quando o cliente REMOVE a reação o backend grava "Reação" (sem emoji) e a bolha
           ganhava um badge "ão". */
        const emojis = text.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu);
        emoji = emojis && emojis.length ? emojis[emojis.length - 1] : "";
      }
      /* Alvo: a mensagem citada, se o backend a indicar; senão a anterior (comportamento antigo). */
      const alvoId = msg?.reply_meta?.replyToId ?? msg?.reply_meta?.id ?? msg?.reaction_target_id ?? null;
      let alvo = null;
      if (alvoId != null) {
        for (let k = list.length - 1; k >= 0; k -= 1) {
          const cand = list[k];
          if (cand && (String(cand.id) === String(alvoId) || String(cand.whatsapp_id ?? "") === String(alvoId))) {
            alvo = cand;
            break;
          }
        }
      }
      if (!alvo) alvo = list[list.length - 1];
      if (alvo && alvo.id != null) {
        if (emoji) reactionsByMsgId[String(alvo.id)] = emoji;
        else delete reactionsByMsgId[String(alvo.id)]; // "Reação" sem emoji = removeu
      }
      continue;
    }
    /* Transferência feita pelo SISTEMA (triagem/distribuição): o card escuro de "Movimentação
       interna" não é desenhado — poluía a thread sem dizer nada ao atendente (18/11/2026).
       Transferências feitas por uma pessoa continuam aparecendo. */
    if (isSystemTransferMovement(msg)) continue;
    if (ocultarMovimentacoes && !isInternalNote(msg) && isInternalMovementMessage(msg)) continue;
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
    const botInfo = classifyBotTriageMessage(msg);
    const botCompact = botInfo ? botTriageLabel(botInfo) : null;

    out.push(getOrCreateTimelineMsgRow(msg, showRemetente, reaction, botCompact));
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
