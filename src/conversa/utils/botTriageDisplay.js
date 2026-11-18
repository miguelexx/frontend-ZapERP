/**
 * Resumo VISUAL da triagem automática na thread (18/11/2026).
 *
 * O bot grava o menu de setores e a confirmação como mensagens `out` comuns, sem marca própria,
 * e a transferência dele vira um "Movimentação interna" (card escuro). Na thread isso eram três
 * blocos grandes antes de o atendente ver a primeira mensagem útil. Aqui só se DECIDE COMO
 * DESENHAR: nada muda no bot, no backend, no store ou no que é enviado ao cliente.
 *
 * Regras conservadoras — na dúvida, a bolha fica como sempre:
 *  - bolha do bot = saída, texto, SEM ninguém por trás (sem autor, sem nome de atendente, sem
 *    `enviado_por_usuario`, sem tempId de envio otimista). Mensagem digitada por atendente nunca
 *    casa;
 *  - menu = ≥ 2 opções numeradas + palavra de triagem (setor, escolha, responda…);
 *  - confirmação = "direcionado/encaminhado/transferido" + "setor/equipe/atendimento", curta;
 *  - transferência do SISTEMA = movimentação `transferiu` sem `de_usuario_id` (o texto antigo
 *    diz "Usuário transferiu…" sem nome). Transferência feita por atendente continua visível.
 */
import { isOutgoingMessage, safeString } from "./conversaViewHelpers";
import { isInternalNote } from "../internalNote";

const OPTION_LINE = /^\s*(?:\*\s*)?(?:[0-9]️?⃣|\d{1,2}\s*(?:[-–—.):]|️?⃣))\s*\*?\s*(\S.*)$/;
const MENU_HINT = /(setor|departamento|op[cç](?:[aã]o|[oõ]es)|escolh|digite|responda|selecione)/i;
const CONFIRM_VERB = /(direcionad|encaminhad|transferid)/i;
const CONFIRM_OBJ = /(setor|equipe|atendimento|departamento)/i;

function textOf(msg) {
  return safeString(msg?.texto ?? msg?.conteudo ?? msg?.message ?? msg?.body);
}

function cleanLabel(raw) {
  return String(raw || "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function hasHumanAuthor(msg) {
  return Boolean(
    msg?.enviado_por_usuario ||
      safeString(msg?.usuario_nome) ||
      msg?.autor_usuario_id != null ||
      msg?.tempId ||
      msg?.client_temp_id
  );
}

function menuOptions(text) {
  const opts = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(OPTION_LINE);
    if (m && m[1]) {
      const label = cleanLabel(m[1]);
      if (label) opts.push(label);
    }
  }
  return opts;
}

/**
 * @returns {null | { kind: "menu", options: string[] } | { kind: "confirmacao", setor: string }}
 */
export function classifyBotTriageMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (!isOutgoingMessage(msg) || isInternalNote(msg) || msg.mensagem_interna === true) return null;
  const tipo = safeString(msg.tipo).toLowerCase();
  if (tipo && tipo !== "texto" && tipo !== "text" && tipo !== "chat") return null;
  if (hasHumanAuthor(msg)) return null;
  if (msg.apagada_para_todos || msg.reply_meta?.poll) return null;
  const text = textOf(msg);
  if (!text || text.length > 1500) return null;

  const options = menuOptions(text);
  if (options.length >= 2 && MENU_HINT.test(text)) {
    return { kind: "menu", options };
  }
  if (options.length === 0 && text.length <= 400 && CONFIRM_VERB.test(text) && CONFIRM_OBJ.test(text)) {
    const m = text.match(/setor\s+(?:de\s+|do\s+|da\s+)?\*?([^\n.!,*;]{2,40})/i);
    return { kind: "confirmacao", setor: m ? cleanLabel(m[1]) : "" };
  }
  return null;
}

/** Movimentação interna `transferiu` feita pelo sistema (bot/distribuição), não por pessoa. */
export function isSystemTransferMovement(msg) {
  if (!msg || typeof msg !== "object") return false;
  const meta = msg.movimentacao_interna && typeof msg.movimentacao_interna === "object"
    ? msg.movimentacao_interna
    : null;
  if (meta) {
    return String(meta.acao || "").toLowerCase() === "transferiu" && meta.de_usuario_id == null;
  }
  if (msg.mensagem_interna !== true &&
      String(msg.tipo || "").toLowerCase() !== "movimentacao_interna_atendimento") {
    return false;
  }
  // Formato antigo (só texto): "Usuário transferiu…" SEM nome = origem sistema.
  return /(^|\n)\s*Usu[aá]rio transferiu este atendimento/i.test(textOf(msg));
}

/** Rótulo curto da pílula. */
export function botTriageLabel(info) {
  if (!info) return "";
  if (info.kind === "menu") {
    const opts = info.options.slice(0, 4).join(" · ");
    const more = info.options.length > 4 ? ` +${info.options.length - 4}` : "";
    return `Menu de setores · ${opts}${more}`;
  }
  return info.setor ? `Direcionado para ${info.setor}` : "Atendimento direcionado ao setor";
}
