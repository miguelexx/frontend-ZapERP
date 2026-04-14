/**
 * Contrato da API POST /api/ai/ask (corpo e envelope de resposta).
 * @typedef {object} AiAskRequestBody
 * @property {string} question
 * @property {number} [period_days]
 */

/**
 * @typedef {"mensagens_whatsapp" | "internal_messages" | null} FonteDadosAnalitica
 */

/**
 * @typedef {"aviso" | "info" | "erro"} SeveridadeAlertaAnalitica
 */

/**
 * @typedef {object} CandidatoUsuarioAnalitica
 * @property {number|string} usuario_id
 * @property {string} [nome]
 */

/**
 * @typedef {object} CandidatoClienteAnalitica
 * @property {number|string} cliente_id
 * @property {string} [nome]
 * @property {string} [telefone]
 */

/**
 * @typedef {object} AlertaAnaliticaUi
 * @property {string} codigo
 * @property {SeveridadeAlertaAnalitica} severidade
 * @property {string} titulo
 * @property {string} mensagem
 * @property {string} [origem]
 * @property {(CandidatoUsuarioAnalitica|CandidatoClienteAnalitica)[]} [candidatos]
 */

/**
 * @typedef {object} AnaliticaUiPayload
 * @property {string} [intent]
 * @property {number} [periodo_dias_efetivo]
 * @property {boolean} [periodo_definido_na_requisicao]
 * @property {boolean} [periodo_padrao_usado]
 * @property {FonteDadosAnalitica} [fonte_dados]
 * @property {AlertaAnaliticaUi[]} [alertas]
 */

/**
 * envelope axios: { ok, intent, answer, data }
 * @typedef {object} AiAskResponseBody
 * @property {boolean} [ok]
 * @property {string} [intent]
 * @property {string} [answer]
 * @property {unknown} [data]
 * @property {string} [response]
 * @property {string} [message]
 * @property {string} [error]
 */

export function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** @param {unknown} data campo `data` da resposta */
export function getAnaliticaUiFromData(data) {
  if (!isPlainObject(data)) return null;
  const ui = data.analitica_ui;
  return isPlainObject(ui) ? ui : null;
}

/** Há algo a mostrar na barra de período / fonte / intent. */
export function analiticaUiHasBarContent(ui) {
  if (!isPlainObject(ui)) return false;
  const dias = ui.periodo_dias_efetivo;
  const showPeriodo = dias != null && Number.isFinite(Number(dias));
  const fonte = ui.fonte_dados;
  const showFonte = fonte === "mensagens_whatsapp" || fonte === "internal_messages";
  const showIntent = Boolean(String(ui.intent || "").trim());
  return showPeriodo || showFonte || showIntent;
}
