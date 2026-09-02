import { safeString } from "./conversaViewHelpers";
import {
  BR_PHONE_IN_TEXT_REGEX,
  requestOpenConversaByPhone,
  toBrPhoneDigitsIfValid,
} from "../../chats/openConversaByPhoneBridge";

export const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

function handlePhoneClick(e, raw) {
  e.preventDefault();
  e.stopPropagation();
  requestOpenConversaByPhone(raw);
}

/** Torna telefones BR clicáveis num trecho de texto (sem URL). Ao clicar, abre a conversa do número. */
function renderPhonesInPlainText(str, keyPrefix) {
  if (!str) return str;
  const out = [];
  let lastIndex = 0;
  let match;
  BR_PHONE_IN_TEXT_REGEX.lastIndex = 0;
  while ((match = BR_PHONE_IN_TEXT_REGEX.exec(str)) !== null) {
    const raw = match[0];
    const idx = match.index;
    // Só vira link se for um telefone plausível de verdade.
    if (!toBrPhoneDigitsIfValid(raw)) continue;
    if (idx > lastIndex) out.push(str.slice(lastIndex, idx));
    out.push(
      <button
        key={`${keyPrefix}-tel-${idx}`}
        type="button"
        className="wa-phoneLink"
        onClick={(e) => handlePhoneClick(e, raw)}
        title="Abrir conversa com este número"
      >
        {raw}
      </button>
    );
    lastIndex = idx + raw.length;
  }
  if (out.length === 0) return str;
  if (lastIndex < str.length) out.push(str.slice(lastIndex));
  return out;
}

/** Deixa URLs em texto azuis e clicáveis (http/https) e telefones BR clicáveis (abrem a conversa). */
export function renderTextWithLinks(text) {
  const s = safeString(text);
  if (!s) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(s)) !== null) {
    const url = match[0];
    const idx = match.index;
    if (idx > lastIndex) {
      parts.push(renderPhonesInPlainText(s.slice(lastIndex, idx), `t-${lastIndex}`));
    }
    parts.push(
      <a
        key={`link-${idx}-${url}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="wa-link"
      >
        {url}
      </a>
    );
    lastIndex = idx + url.length;
  }
  if (lastIndex < s.length) {
    parts.push(renderPhonesInPlainText(s.slice(lastIndex), `t-${lastIndex}`));
  }
  return parts;
}
