export const WA_INPUT_FALLBACK_MAX_HEIGHT_PX = 240;
export const COMPOSER_DRAFT_SAVE_MS = 220;
export const STICKER_RECENTS_LIMIT = 36;
export const AUTO_CORRECT_CONTEXT_WINDOW = 12;
export const AUTO_CORRECT_CONTEXT_MATCH = 6;
export const ATTACH_MENU_PORTAL_MQ = "(max-width: 640px)";

export const COMPOSER_EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😅","😎","🙂","🤝","🙏","👏","🔥","✅","❌","⚠️","⭐","🎉","💡","📎","📌","📞","🎧",
  "👍","👎","👌","🤌","✌️","🤞","🫶","💪","🧠","🕒","📍","📅","💬","📷","🎥","🎙️","🎵","🗂️","🧾",
  "❤️","💛","💚","💙","🤍","🖤","💔",
];

export function safeString(value) {
  return value == null ? "" : String(value);
}

/** Detecta comando "/" no cursor (início da linha ou após espaço). */
export function getSlashContext(value, cursor) {
  const text = String(value || "");
  const position = typeof cursor === "number" ? cursor : text.length;
  let index = position - 1;
  while (index >= 0 && !/\s/.test(text[index])) {
    if (text[index] === "/") {
      if (index === 0 || /\s/.test(text[index - 1])) {
        return { start: index, end: position, query: text.slice(index + 1, position) };
      }
      return null;
    }
    index -= 1;
  }
  return null;
}

export function isImageFile(file) {
  if (!file) return false;
  return String(file.type || "").toLowerCase().startsWith("image/");
}

function getStorageIdentity(user) {
  return {
    companyId: user?.company_id ?? user?.empresa_id ?? user?.companyId ?? user?.empresaId ?? "default",
    userId: user?.id ?? user?.user_id ?? user?.userId ?? "anon",
  };
}

export function buildStickerStorageKey(user) {
  const { companyId, userId } = getStorageIdentity(user);
  return `wa_stickers_recent_${companyId}_${userId}`;
}

export function buildAutoCorrectStorageKey(user) {
  const { companyId, userId } = getStorageIdentity(user);
  return `wa_autocorrect_enabled_${companyId}_${userId}`;
}

export function readRecentStickers(user) {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(buildStickerStorageKey(user));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
