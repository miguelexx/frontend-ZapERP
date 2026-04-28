/**
 * Badging API — bolinha / número no ícone da PWA (Tela Início).
 * Safari iOS 16.4+ (PWA instalada), Chromium Android/desktop com suporte.
 * Requer HTTPS; comportamento final depende do SO (como WhatsApp Web no ícone).
 */

const MAX_BADGE = 99

function hasBadgeApi() {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator && "clearAppBadge" in navigator
}

/**
 * @param {number} total - soma de unread_count das conversas (ou 0 para limpar)
 */
export function syncAppBadgeFromUnreadTotal(total) {
  if (!hasBadgeApi()) return
  const n = Math.floor(Number(total) || 0)
  if (n <= 0) {
    navigator.clearAppBadge().catch(() => {})
    return
  }
  const display = Math.min(n, MAX_BADGE)
  navigator.setAppBadge(display).catch(() => {})
}

export function clearAppBadgeIfSupported() {
  if (!hasBadgeApi()) return
  navigator.clearAppBadge().catch(() => {})
}

export function isAppBadgeSupported() {
  return hasBadgeApi()
}
