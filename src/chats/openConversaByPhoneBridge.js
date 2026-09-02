/**
 * Ponte "clicar num telefone dentro da conversa → abrir a conversa desse número".
 *
 * O balão de mensagem (render puro, dentro da virtual list) não pode falar com os
 * stores/serviços diretamente sem acoplar caminho quente. Então o número clicável só
 * dispara um evento global; quem escuta e resolve é o ChatList (sempre montado na
 * página de atendimento, no desktop e no mobile).
 */
import {
  digitsOnly,
  isPlausibleBrPhoneDigits,
  normalizeBrPhoneForSubmit,
} from "./phoneBrFormat";

export const OPEN_CONVERSA_BY_PHONE_EVENT = "zaperp:abrir-conversa-por-telefone";

/**
 * Detecta números de telefone brasileiros em texto livre.
 * Exige o DDD (2 dígitos); aceita máscara, +55 opcional, e separa fixo (8) de celular (9).
 * As guardas (?<!\d)/(?!\d) evitam colar em sequências numéricas maiores (IDs, valores).
 */
export const BR_PHONE_IN_TEXT_REGEX =
  /(?<!\d)(?:\+?55[\s.\-]?)?\(?\d{2}\)?[\s.\-]?\d{4,5}[\s.\-]?\d{4}(?!\d)/g;

/**
 * Retorna os dígitos normalizados (55 + DDD + número) se o trecho for um telefone BR
 * plausível; caso contrário `null`.
 * @param {string} raw
 * @returns {string | null}
 */
export function toBrPhoneDigitsIfValid(raw) {
  const d = digitsOnly(raw);
  if (!isPlausibleBrPhoneDigits(d)) return null;
  return normalizeBrPhoneForSubmit(raw) || null;
}

/**
 * Pede a abertura da conversa desse telefone. Aceita o texto cru clicado; só dispara
 * quando o número é plausível.
 * @param {string} raw
 * @returns {boolean} true se disparou
 */
export function requestOpenConversaByPhone(raw) {
  const telefone = toBrPhoneDigitsIfValid(raw);
  if (!telefone) return false;
  if (typeof window === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent(OPEN_CONVERSA_BY_PHONE_EVENT, { detail: { telefone } })
  );
  return true;
}
