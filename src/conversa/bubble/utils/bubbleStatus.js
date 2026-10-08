import { safeString, isOutgoingMessage } from "../../utils/conversaViewHelpers";

const CONFIRMED_STATUS = [
  "sent",
  "enviada",
  "enviado",
  "delivered",
  "entregue",
  "read",
  "lida",
  "played",
];

/**
 * Resolve o indicador de envio. Status é monotônico na UI: pending → sent →
 * delivered → read. Flag stale de offline não rebaixa um tick já confirmado.
 */
/**
 * Linhas legadas no banco podem ter os dois campos DIVERGENTES (ex.: status='played' com
 * status_mensagem='pending', ou ambos com o ACK cru 'device'/'server' sem canonizar).
 * Para EXIBIÇÃO, vale o mais avançado dos dois — normalizado para o nome canônico, senão
 * 'device' não casa com as regexes abaixo e viraria tique único. Estados especiais
 * (erro/blocked/status_indefinido/aguardando_conexao) não entram no rank: neles a regra
 * original (status_mensagem primeiro) permanece intacta.
 */
const PROGRESS_DISPLAY_RANK = {
  pending: 0, sending: 0, enviando: 0,
  sent: 1, enviada: 1, enviado: 1, server: 1,
  delivered: 2, device: 2, entregue: 2, received: 2,
  read: 3, lida: 3, seen: 3,
  played: 4,
};
const PROGRESS_CANONICAL = ["pending", "sent", "delivered", "read", "played"];

function progressRank(v) {
  const s = safeString(v).toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(PROGRESS_DISPLAY_RANK, s)
    ? PROGRESS_DISPLAY_RANK[s]
    : null;
}

export function resolveOutgoingTick(msg, isGroup) {
  const out = isOutgoingMessage(msg);
  if (!out) return null;

  let raw = msg?.status_mensagem ?? msg?.status ?? msg?.situacao;
  const rankSm = progressRank(msg?.status_mensagem);
  const rankSt = progressRank(msg?.status);
  if (rankSm != null) {
    // status_mensagem é progresso: exibe o MAIOR entre os dois, já canônico.
    raw = PROGRESS_CANONICAL[rankSt != null ? Math.max(rankSm, rankSt) : rankSm];
  } else if (msg?.status_mensagem == null && rankSt != null) {
    raw = PROGRESS_CANONICAL[rankSt];
  }
  const maybeNum = typeof raw === "number" && Number.isFinite(raw) ? raw : (/^\d+$/.test(String(raw || "").trim()) ? Number(raw) : null);
  const rawStatus = raw != null && maybeNum == null ? safeString(raw).toLowerCase() : String(maybeNum ?? "");
  const hasReadAt = !!(msg?.lida_em || msg?.lidaEm || msg?.read_at || msg?.readAt);
  const hasDeliveredAt = !!(msg?.entregue_em || msg?.entregueEm || msg?.delivered_at || msg?.deliveredAt);

  if (maybeNum != null) {
    if (maybeNum <= 0) return { kind: "pending", className: "wa-ticks isPending", title: undefined };
    if (maybeNum === 1) return { kind: "sent", className: "wa-ticks", title: undefined };
    if (maybeNum === 2) return { kind: "delivered", className: "wa-ticks isDelivered", title: undefined };
    if (maybeNum >= 3 && !isGroup) return { kind: "read", className: "wa-ticks isRead", title: undefined };
    if (maybeNum >= 3 && isGroup) return { kind: "delivered", className: "wa-ticks isDelivered", title: undefined };
  }

  const s = rawStatus;
  const hasReadKeyword = /lida|read|seen|visualiz|played/.test(s);
  const hasDeliveredKeyword = /entregue|deliver|receiv/.test(s);
  // "blocked" vem na resposta HTTP quando a proteção de envio barrou a mensagem (no banco a
  // linha fica 'erro'). Sem ele aqui, a bolha caía no fallback "sent" e a falha ficava invisível.
  const isErr = s === "erro" || s === "error" || s === "failed" || s === "falhou" || s === "blocked";
  const statusJaConfirmado = CONFIRMED_STATUS.includes(s);
  const isAguardandoConexao =
    !isErr &&
    !statusJaConfirmado &&
    (s === "aguardando_conexao" || !!msg?.aguardando_conexao);
  const isIndefinido = !isErr && !isAguardandoConexao && (s === "status_indefinido" || !!msg?.envio_incerto);
  const isDemorado = !isErr && !isAguardandoConexao && !!(msg?.envio_demorado || isIndefinido);
  const isRetry = !isErr && !isIndefinido && !isAguardandoConexao && !!(msg?.em_retry);
  const isPending =
    !isRetry &&
    (isAguardandoConexao ||
      isIndefinido ||
      s === "pending" ||
      s === "enviando" ||
      s === "sending");
  let isRead =
    s === "lida" || s === "read" || s === "seen" ||
    s === "visualizada" || s === "played" ||
    hasReadAt ||
    hasReadKeyword;
  if (isGroup) isRead = false;
  const isDelivered =
    isRead ||
    s === "entregue" || s === "delivered" || s === "received" ||
    hasDeliveredAt ||
    hasDeliveredKeyword;
  const isSent = !isErr && !isPending && !isDelivered && !isRead &&
    (!s || s === "sent" || s === "enviada" || s === "enviado");

  const title = isAguardandoConexao
    ? "Aguardando conexão"
    : isRetry
      ? "Aguardando reenvio automático"
      : isIndefinido
        ? "Verificando se a mensagem foi enviada…"
        : isDemorado
          ? "Envio demorado — ainda verificando…"
          : undefined;

  const kind = isErr ? "err" : (isPending || isRetry) ? "pending" : isRead ? "read" : isDelivered ? "delivered" : isSent ? "sent" : "sent";
  const className = `wa-ticks ${isDelivered ? "isDelivered" : ""} ${isRead ? "isRead" : ""} ${isErr ? "isErr" : ""} ${isPending ? "isPending" : ""} ${isRetry ? "isPending isRetry" : ""} ${isDemorado ? "isDemorado" : ""}`;

  return { kind, className, title };
}
