import { getApiBaseUrl } from "../api/baseUrl.js";

/**
 * Só URLs relativas servidas pelo próprio backend (`/uploads/...`).
 * @param {unknown} path
 */
export function isSafeInternalMediaPath(path) {
  if (path == null || typeof path !== "string") return false;
  const t = path.trim();
  return t.startsWith("/uploads/");
}

/**
 * URL absoluta para exibir mídia (img, audio, video). `null` se inválida.
 * @param {unknown} mediaUrl caminho relativo da API
 */
export function internalMediaAbsoluteUrl(mediaUrl) {
  if (!isSafeInternalMediaPath(mediaUrl)) return null;
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const path = String(mediaUrl).trim().startsWith("/") ? String(mediaUrl).trim() : `/${String(mediaUrl).trim()}`;
  return `${base}${path}`;
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
