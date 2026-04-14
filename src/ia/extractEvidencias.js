import { isPlainObject } from "./aiAskTypes.js";

const LIST_KEYS = ["evidencias", "mensagens", "trechos", "amostra", "items"];

/**
 * @typedef {object} EvidenciaNormalizada
 * @property {string|number|null} mensagem_id
 * @property {string|number|null} conversa_id
 * @property {string|number|null} cliente_id
 * @property {string|number|null} internal_message_id
 * @property {string|number|null} internal_conversation_id
 * @property {string} snippet
 */

/** @param {unknown} raw @returns {EvidenciaNormalizada | null} */
export function normalizeEvidenceRow(raw) {
  if (!isPlainObject(raw)) return null;
  const mensagem_id = raw.mensagem_id ?? raw.message_id ?? raw.id ?? null;
  const conversa_id = raw.conversa_id ?? raw.conversaId ?? null;
  const cliente_id = raw.cliente_id ?? raw.clienteId ?? null;
  const internal_message_id = raw.internal_message_id ?? raw.internalMessageId ?? null;
  const internal_conversation_id = raw.internal_conversation_id ?? raw.internalConversationId ?? null;
  const snippet =
    [raw.texto, raw.snippet, raw.preview, raw.conteudo, raw.mensagem, raw.body]
      .map((x) => (x != null ? String(x).trim() : ""))
      .find(Boolean) || "";

  const hasAny =
    mensagem_id != null ||
    conversa_id != null ||
    cliente_id != null ||
    internal_message_id != null ||
    internal_conversation_id != null;
  if (!hasAny && !snippet) return null;

  return {
    mensagem_id,
    conversa_id,
    cliente_id,
    internal_message_id,
    internal_conversation_id,
    snippet: snippet.slice(0, 200),
  };
}

function keyForRow(row) {
  return [
    row.conversa_id,
    row.mensagem_id,
    row.cliente_id,
    row.internal_conversation_id,
    row.internal_message_id,
    row.snippet,
  ].join("|");
}

/**
 * @param {unknown} data
 * @returns {EvidenciaNormalizada[]}
 */
export function extractEvidenciasFromData(data) {
  if (!isPlainObject(data)) return [];
  const lists = [];
  for (const k of LIST_KEYS) {
    if (Array.isArray(data[k])) lists.push(...data[k]);
  }
  const seen = new Set();
  const out = [];
  for (const raw of lists) {
    const row = normalizeEvidenceRow(raw);
    if (!row) continue;
    const k = keyForRow(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out.slice(0, 24);
}
