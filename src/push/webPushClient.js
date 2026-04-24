import api from "../api/http"
import { getApiBaseUrl } from "../api/baseUrl"

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/** GET chave pública VAPID (sem auth). */
export async function fetchVapidPublicKey() {
  const base = getApiBaseUrl()
  const res = await fetch(`${base}/usuarios/push/vapid-public-key`)
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && !!json.publicKey, ...json }
}

/**
 * Solicita permissão (se necessário), subscreve push e envia subscription ao backend.
 */
export async function subscribeWebPush() {
  if (!pushSupported()) {
    return { ok: false, reason: "unsupported" }
  }

  const vapid = await fetchVapidPublicKey()
  if (!vapid.publicKey) {
    return { ok: false, reason: vapid.enabled === false ? "server_disabled" : "no_public_key" }
  }

  const reg = await navigator.serviceWorker.ready

  let permission = Notification.permission
  if (permission === "default") {
    permission = await Notification.requestPermission()
  }
  if (permission !== "granted") {
    return { ok: false, reason: permission === "denied" ? "permission_denied" : "permission_blocked" }
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
  })

  await sendSubscriptionToBackend(sub)

  return { ok: true }
}

export async function unsubscribeWebPush() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const json = sub.toJSON()
  try {
    await api.delete("/usuarios/me/push/subscribe", { data: { endpoint: json.endpoint } })
  } catch (_) {}
  await sub.unsubscribe().catch(() => {})
  return { ok: true }
}

async function sendSubscriptionToBackend(sub) {
  const json = sub?.toJSON?.() || {}
  await api.post("/usuarios/me/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
  })
}

function hasAuthToken() {
  try {
    const raw = localStorage.getItem("zap_erp_auth")
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return !!parsed?.token
  } catch {
    return false
  }
}

/**
 * Sincroniza subscription sem popup agressivo:
 * - só roda quando permissão já está "granted"
 * - cria subscription se necessário (sem re-pedir permissão)
 * - reenvia endpoint ao backend para manter vínculo atualizado
 */
export async function syncPushSubscriptionSilently() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" }
  if (!hasAuthToken()) return { ok: false, reason: "no_auth" }
  if (Notification.permission !== "granted") return { ok: false, reason: "permission_not_granted" }

  const vapid = await fetchVapidPublicKey()
  if (!vapid.publicKey) {
    return { ok: false, reason: vapid.enabled === false ? "server_disabled" : "no_public_key" }
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    })
  }

  await sendSubscriptionToBackend(sub)
  return { ok: true }
}
