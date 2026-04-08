/* ZapERP — service worker conservador: apenas assets estáticos do mesmo origin.
 * Não armazena respostas de API, outros domínios, navegação/HTML nem requisições com Authorization.
 */

const STATIC_CACHE = "zaperp-static-v1"

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((key) => (key !== STATIC_CACHE ? caches.delete(key) : Promise.resolve()))
      )
      await self.clients.claim()
    })()
  )
})

function isSameOriginAsScope(url, scopeOrigin) {
  return url.origin === scopeOrigin
}

function shouldNeverCacheGet(request, url, scopeOrigin) {
  if (request.method !== "GET") return true

  if (!isSameOriginAsScope(url, scopeOrigin)) return true

  if (request.headers.has("Authorization")) return true

  if (request.mode === "navigate" || request.destination === "document") return true

  const path = url.pathname

  if (path === "/" || path.endsWith(".html")) return true

  const lower = path.toLowerCase()
  if (lower.includes("/api/") || lower === "/api") return true
  if (lower === "/login" || lower.startsWith("/login/")) return true
  if (lower === "/auth" || lower.startsWith("/auth/")) return true
  if (lower.includes("/socket.io")) return true

  if (path === "/sw.js" || path.endsWith("manifest.webmanifest")) return true

  return false
}

function isCacheableStaticAsset(path) {
  if (path.startsWith("/assets/")) return true
  const ext = path.split(".").pop() || ""
  return /^(js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg)$/i.test(ext)
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  return cached || networkPromise || fetch(request)
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  const scopeOrigin = new URL(self.registration.scope).origin

  if (shouldNeverCacheGet(request, url, scopeOrigin)) {
    return
  }

  if (request.method === "GET" && isCacheableStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
