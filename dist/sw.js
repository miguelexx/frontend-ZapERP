/* ZapERP — Web Push (VAPID). Android/iOS tratam som, prioridade e entrega em segundo plano de forma distinta; não há API aqui para uniformizar. */
const SUPPRESS_REPLY_MS = 220

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {}
      try {
        const text = event.data ? await event.data.text() : '{}'
        payload = JSON.parse(text || '{}')
      } catch (_) {
        payload = {}
      }

      const conversaId = payload?.data?.conversaId
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      let suppress = false

      for (const client of clients) {
        try {
          const mc = new MessageChannel()
          const done = new Promise((resolve) => {
            mc.port1.onmessage = (e) => resolve(!!e?.data?.suppress)
            setTimeout(() => resolve(false), SUPPRESS_REPLY_MS)
          })
          client.postMessage({ type: 'ZAP_PUSH_SUPPRESS_CHECK', payload: { conversaId } }, [mc.port2])
          if (await done) {
            suppress = true
            break
          }
        } catch (_) {}
      }

      if (suppress) return

      const title = payload.title || 'ZapERP'
      const options = {
        body: payload.body || '',
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag || 'zap-msg',
        renotify: false,
        data: payload.data || {},
      }

      await self.registration.showNotification(title, options)
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const openPath = data.openUrl || data.url || '/atendimento'
  const scope = self.registration.scope || '/'
  let origin
  try {
    origin = new URL(scope).origin
  } catch (_) {
    origin = ''
  }
  const targetUrl =
    openPath.startsWith('http') || openPath.startsWith('//')
      ? openPath
      : `${origin}${openPath.startsWith('/') ? openPath : `/${openPath}`}`

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (origin && String(client.url || '').startsWith(origin) && 'focus' in client) {
          await client.focus()
          client.postMessage({
            type: 'ZAP_PUSH_NAVIGATE',
            openPath: openPath.startsWith('http') ? openPath : openPath,
          })
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })()
  )
})
