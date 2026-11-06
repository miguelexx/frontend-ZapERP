/**
 * A regra que decide se a tela de reconexão (QR Code) pode acender.
 *
 * Fica num módulo sem dependências (nem React, nem HTTP) porque é a última
 * porta antes de tirar o atendimento inteiro do ar: precisa ser testada
 * sozinha (scripts/test-whapi-reconnect-qr.mjs).
 *
 * Escala oficial do GET /health da Whapi:
 *   1 INIT   — canal subindo no servidor da Whapi
 *   2 LAUNCH — conectando na conta do WhatsApp
 *   3 QR     — sessão vazia, esperando leitura do QR / pareamento
 *   4 AUTH   — conectado
 *   5 ERROR  — erro
 * Fora da escala: STOP (canal desativado) e SYNC_ERROR (falha de sync).
 *
 * INIT → LAUNCH → AUTH é a RECONEXÃO NORMAL (2–3s) de quando a rede oscila.
 * Só QR prova que o aparelho foi desvinculado e que ler um QR resolve — por
 * isso a lista é de PERMISSÃO: estado novo, transitório, de erro ou
 * desconhecido nunca acende a tela.
 */

export const WHAPI_UNLINKED_CODE = 3;
export const WHAPI_UNLINKED_STATUS = new Set([
  "QR",
  "UNAUTHORIZED",
  "LOGGED_OUT",
  "LOGOUT",
  "EXPIRED",
]);

/**
 * `s` é a resposta de GET /chats/whapi-status.
 *
 * O backend já aplica a mesma regra e manda o veredito em `unlinked`; aqui ela
 * é repetida porque uma resposta antiga (cache, API de versão anterior) não
 * pode acender a tela, e porque queda de internet jamais pode virar QR Code.
 */
export function isWhapiOverlayDisconnected(s) {
  if (s?.isWhapi !== true || s?.connected !== false) return false;
  if (s?.unlinked === false) return false;
  const code = codigoOuNulo(s?.statusCode);
  if (code != null) return code === WHAPI_UNLINKED_CODE;
  const status = String(s?.status || "").trim().toUpperCase();
  return WHAPI_UNLINKED_STATUS.has(status);
}

/**
 * Código ausente é `null`, nunca `0`: `Number(null)` é 0 e faria um canal
 * desvinculado sem código ser lido como "código 0" — a tela nunca acenderia.
 */
export function codigoOuNulo(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `navigator.onLine` só é confiável no "false": sem rede, nada de acusar o canal. */
export function navegadorOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
