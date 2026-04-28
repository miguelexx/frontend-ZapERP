/**
 * Badging API — bolinha / número no ícone da PWA (Tela Início).
 * Safari iOS 16.4+ (PWA instalada), Chromium Android/desktop com suporte.
 * Requer HTTPS; comportamento final depende do SO (como WhatsApp Web no ícone).
 */

function hasBadgeApi() {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator && "clearAppBadge" in navigator
}

/**
 * @param {number} value - número a mostrar no ícone (ex.: quantidade de conversas em aberto na fila)
 */
export function syncAppBadgeNumber(value) {
  if (!hasBadgeApi()) return
  const n = Math.floor(Number(value) || 0)
  if (n <= 0) {
    navigator.clearAppBadge().catch(() => {})
    return
  }
  navigator.setAppBadge(n).catch(() => {})
}

export function clearAppBadgeIfSupported() {
  if (!hasBadgeApi()) return
  navigator.clearAppBadge().catch(() => {})
}

export function isAppBadgeSupported() {
  return hasBadgeApi()
}
