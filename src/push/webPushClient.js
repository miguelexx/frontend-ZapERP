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
  const endpoints = ["/users/push/vapid-public-key", "/usuarios/push/vapid-public-key"]
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${base}${ep}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.publicKey) return { ok: true, ...json }
      if (json?.enabled === false) return { ok: false, ...json }
    } catch (_) {}
  }
  return { ok: false, publicKey: null }
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
  const endpoints = ["/users/me/push/subscribe", "/usuarios/me/push/subscribe"]
  for (const ep of endpoints) {
    try {
      await api.delete(ep, { data: { endpoint: json.endpoint } })
      break
    } catch (_) {}
  }
  await sub.unsubscribe().catch(() => {})
  return { ok: true }
}

async function sendSubscriptionToBackend(sub) {
  const json = sub?.toJSON?.() || {}
  const payload = { endpoint: json.endpoint, keys: json.keys }
  try {
    await api.post("/users/me/push/subscribe", payload)
    return
  } catch (e) {
    if (e?.response?.status && e.response.status !== 404) throw e
  }
  await api.post("/usuarios/me/push/subscribe", payload)
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

export async function hasActivePushSubscription() {
  if (!pushSupported()) return false
  if (Notification.permission !== "granted") return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
