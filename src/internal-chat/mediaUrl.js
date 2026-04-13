import { getApiBaseUrl } from "../api/baseUrl.js";

/**
 * Só URLs relativas servidas pelo próprio backend (`/uploads/...`).
 * @param {unknown} path
 */
export function isSafeInternalMediaPath(path) {
  if (path == null || typeof path !== "string") return false;
  const t = path.trim();
  if (t.startsWith("/uploads/")) return true;
  return /^uploads\//i.test(t);
}

/**
 * URL absoluta para mídias do chat interno (img, áudio, vídeo, documento).
 * Aceita `https://…` ou caminho `/uploads/…` (também `uploads/…` sem barra inicial).
 * @param {unknown} mediaRef
 * @param {string | null | undefined} publicMediaBaseUrl retorno opcional de `GET /api/internal-chat/status`
 */
export function resolveInternalChatMediaUrl(mediaRef, publicMediaBaseUrl = null) {
  if (mediaRef == null || typeof mediaRef !== "string") return null;
  const t = mediaRef.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  let path = t;
  if (!path.startsWith("/")) {
    if (/^uploads\//i.test(path)) path = `/${path}`;
    else return null;
  }
  if (!path.startsWith("/uploads/")) return null;
  const base = String(publicMediaBaseUrl || getApiBaseUrl() || "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${path}`;
}

/**
 * URL absoluta com base da API (sem CDN de status).
 * @param {unknown} mediaUrl caminho relativo ou URL absoluta
 */
export function internalMediaAbsoluteUrl(mediaUrl) {
  return resolveInternalChatMediaUrl(mediaUrl, null);
}

/**
 * Avatar em `client-contacts`: só `/uploads/…` (API) ou URL https explícita.
 * @param {unknown} avatar
 */
export function resolveClientContactAvatarUrl(avatar) {
  if (avatar == null || typeof avatar !== "string") return null;
  const t = avatar.trim();
  if (!t) return null;
  if (isSafeInternalMediaPath(t)) return internalMediaAbsoluteUrl(t);
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}
