import { isGroupConversation } from "../utils/conversaUtils";
import { getApiBaseUrl } from "../api/baseUrl";
import { contactIdentitiesConflict, rowPhone } from "./chatContactIdentity";

/** true quando o cliente aninhado é outra pessoa (telefone de identidade diferente). */
function nestedClientBelongsToConversation(chat) {
  if (!chat || isGroupConversation(chat)) return true;
  const nested = chat.cliente || chat.clientes;
  if (!nested?.telefone || !rowPhone(chat)) return true;
  return !contactIdentitiesConflict({ telefone: rowPhone(chat) }, { telefone: nested.telefone });
}

/**
 * Aceita tanto URLs absolutas quanto caminhos devolvidos pela API.
 * Algumas integrações persistem a foto como `/uploads/...` ou `uploads/...`;
 * descartar esses valores fazia o card cair nas iniciais mesmo com foto válida.
 */
export function resolveAvatarUrl(raw) {
  const value = raw == null ? "" : String(raw).trim();
  if (!value || value.toLowerCase() === "null" || value.toLowerCase() === "undefined") return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:image/")) {
    return value;
  }
  if (value.startsWith("//")) {
    const protocol = typeof window !== "undefined" && window.location?.protocol
      ? window.location.protocol
      : "https:";
    return `${protocol}${value}`;
  }
  const base = getApiBaseUrl().replace(/\/$/, "");
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

function getAvatarCandidates(chat) {
  const isGroup = isGroupConversation(chat);
  const nestedOk = nestedClientBelongsToConversation(chat);
  return isGroup
    ? [chat?.foto_grupo, chat?.group_photo, chat?.photo_url, chat?.avatar_url]
    : [
        chat?.foto_perfil,
        chat?.foto_perfil_contato_cache,
        nestedOk ? chat?.cliente?.foto_perfil : null,
        nestedOk ? chat?.clientes?.foto_perfil : null,
        chat?.foto,
        chat?.photo_url,
        chat?.avatar_url,
        chat?.avatar,
      ];
}

function firstAvatarUrl(chat) {
  for (const candidate of getAvatarCandidates(chat)) {
    const resolved = resolveAvatarUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
}

/** Mantém a foto já carregada quando um refresh parcial da lista volta sem esse campo. */
export function pickPreferredAvatarUrl(incoming, existing) {
  return firstAvatarUrl(incoming) ?? firstAvatarUrl(existing) ?? null;
}

/** Uma só fonte: telefone no topo. Nunca exibir LID (lid:xxx) — backend envia telefone_exibivel null nesses casos. */
export function getPhone(chat) {
  const tel = chat?.telefone_exibivel ?? chat?.cliente_telefone ?? chat?.telefone ?? chat?.numero ?? chat?.phone ?? chat?.wa_id ?? "";
  const s = String(tel || "").trim();
  if (s.toLowerCase().startsWith("lid:")) return "";
  return s;
}

/**
 * Telefone para EXIBIR (título do card, cabeçalho da conversa, fallback de nome).
 *
 * O formato antigo tratava os 2 primeiros dígitos de um número de 12–13 dígitos como DDD:
 * o código do país virava DDD e o resto ficava com 6 dígitos no fim — `5511976543210` saía
 * `(55) 11976-543210` (26/11/2026). Agora o 55 é reconhecido como país:
 *   55 + 11 dígitos → `(DD) 9XXXX-XXXX`   55 + 10 dígitos → `(DD) XXXX-XXXX`
 *   11 dígitos      → `(DD) 9XXXX-XXXX`   10 dígitos      → `(DD) XXXX-XXXX`
 *   resto (outro país, número curto/longo) → `+dígitos` (ou os dígitos, se < 10)
 * A máscara BR só entra com cara de número BR (27/11/2026, R5-06): DDD sem 0 (nenhum DDD do
 * Brasil tem 0) e, com 11 dígitos, o 9 do celular na 3.ª posição. Sem isso `12025550123`
 * (EUA, +1) saía `(12) 02555-0123`, um número que não existe. Os 10 dígitos aceitam 2–9 na
 * 3.ª posição: cobre fixo e o celular antigo sem o 9 (`558187654321`), muito comum no WhatsApp.
 * Só exibição: nunca gravar o resultado como nome nem usar como chave de identidade.
 */
export function formatPhoneForDisplay(phone) {
  const p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  const local = p.startsWith("55") && (p.length === 12 || p.length === 13) ? p.slice(2) : p;
  if (/^[1-9]{2}/.test(local)) {
    if (local.length === 11 && local[2] === "9") return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10 && /[2-9]/.test(local[2])) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return p.length >= 10 ? `+${p}` : p;
}

/**
 * Nome que é só um telefone BRASILEIRO (dígitos, espaços, `+ ( ) - .`) — o bug antigo de
 * nome=telefone. Número estrangeiro digitado como nome fica como o atendente escreveu
 * (`+1 (202) 555-0123` tem 11 dígitos, mas o `+` sem 55 diz que não é do Brasil).
 */
function looksLikeBrPhoneOnly(value) {
  const s = String(value || "").trim();
  if (!s || !/^[\d\s+().-]+$/.test(s)) return false;
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+") && !d.startsWith("55")) return false;
  return d.length === 10 || d.length === 11 || (d.startsWith("55") && (d.length === 12 || d.length === 13));
}

/**
 * Nome do contato/conversa.
 * Contatos: contato_nome principal; fallback telefone_exibivel ou telefone.
 * Grupos: nome_grupo principal.
 */
export function getDisplayName(chat) {
  if (isGroupConversation(chat)) {
    const nome = chat?.nome_grupo ?? chat?.contato_nome ?? chat?.nome_contato_cache ?? chat?.nome ?? "";
    const n = String(nome || "").trim();
    if (n && !n.toLowerCase().startsWith("lid:")) return n;
    // Id de grupo (120363…, telefone-timestamp) não é telefone: formatado vira lixo.
    const tel = getPhone(chat);
    if (tel.replace(/\D/g, "").length > 13) return "Grupo";
    return formatPhoneForDisplay(tel) || "Grupo";
  }
  const nestedOk = nestedClientBelongsToConversation(chat);
  const raw =
    chat?.contato_nome ??
    chat?.nome_contato_cache ??
    (nestedOk ? chat?.cliente?.nome : null) ??
    (nestedOk ? chat?.clientes?.nome : null) ??
    chat?.cliente_nome ??
    chat?.nome ??
    "";
  const nome = String(raw || "").trim();
  // Nome gravado como o próprio telefone (cadastro antigo) é exibido formatado, igual ao
  // contato sem nome — senão o card mostrava `5511976543210` cru e o avatar um "5".
  // Só troca quando sai a máscara BR, ou quando o nome É o telefone da conversa: um nome
  // digitado como `0800 123 4567` ou `2025550123` virava `+08001234567`/`+2025550123`
  // (o "+" inventava um código de país) — fica como o atendente escreveu.
  if (nome && looksLikeBrPhoneOnly(nome)) {
    const formatado = formatPhoneForDisplay(nome);
    if (formatado.startsWith("(")) return formatado;
    const tel = String(getPhone(chat) || "").replace(/\D/g, "");
    if (tel && tel === nome.replace(/\D/g, "")) return formatado;
  }
  if (nome && !nome.toLowerCase().startsWith("lid:")) return nome;
  const tel = getPhone(chat);
  return tel ? formatPhoneForDisplay(tel) : "Contato";
}

/**
 * Par nome + foto. foto_perfil: só usa se URL http válida; null → avatar padrão.
 * Grupos: foto_grupo ou fallback. Layout não quebra quando foto_perfil é null.
 */
export function getContactDisplay(chat) {
  const isGroup = isGroupConversation(chat);
  const displayName = getDisplayName(chat);
  const phone = formatPhoneForDisplay(chat?.telefone_exibivel ?? chat?.telefone ?? chat?.cliente_telefone ?? chat?.numero ?? "");
  const avatarUrl = firstAvatarUrl(chat);
  return { displayName, avatarUrl, phone, isGroup };
}

/** True se o valor pode ser normalizado para uma fonte utilizável no <img> do card. */
export function isHttpAvatarUrl(url) {
  return Boolean(resolveAvatarUrl(url));
}

/**
 * Trava a foto do card por identidade da conversa.
 * Anti-flicker: não descartar URL válida quando o payload vem sem foto (null).
 * B03: aceita URL http nova (foto atualizada via sync/contato_atualizado).
 *
 * @param {{ identity: string|null, url: string|null }} locked
 * @param {string} identity - ex.: conv:123
 * @param {string|null} incomingUrl
 * @returns {{ identity: string, url: string|null }}
 */
export function lockCardAvatarUrl(locked, identity, incomingUrl) {
  const id = identity != null ? String(identity) : "";
  const next = resolveAvatarUrl(incomingUrl);
  if (!id) return { identity: "", url: next };
  if (!locked || locked.identity !== id) {
    return { identity: id, url: next };
  }
  // Mantém a foto atual se o store veio sem URL (evita pulo null ↔ CDN).
  if (!next && isHttpAvatarUrl(locked.url)) {
    return locked;
  }
  return { identity: id, url: next };
}
