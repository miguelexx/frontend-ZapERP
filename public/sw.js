/* ZapERP — Web Push (VAPID). Android/iOS tratam som, prioridade e entrega em segundo plano de forma distinta; não há API aqui para uniformizar. */
// Marcador de versão do Service Worker. Serve para COMPARAR máquinas: um PC preso numa
// versão antiga do PWA responderá com versão diferente (ou não responderá) ao ZAP_SW_VERSION.
// Atualize a data quando mudar a lógica do SW.
const SW_VERSION = '2026-10-07-offline-shell-1'
const SUPPRESS_REPLY_MS = 180
// Tempo até o banner sumir sozinho (notificação de mensagem não deve ficar fixa na tela).
const AUTO_CLOSE_MS = 4000

// =====================================================
// APP-SHELL OFFLINE (abrir o ZapERP sem internet, estilo WhatsApp)
// Sem isto, abrir o app do zero offline falhava ANTES de qualquer código nosso rodar —
// a leitura offline (snapshots) e os áudios baixados (IndexedDB) só serviam com a aba
// já aberta. Estratégias:
//  - navegação (index.html): network-first; offline → shell em cache (sempre fresco online);
//  - /assets/* (bundles com hash, imutáveis): cache-first (repetição instantânea + offline);
//  - estáticos leves (ícones/manifest/fontes/svg): network-first com fallback em cache.
// NUNCA intercepta: métodos não-GET e QUALQUER outra origem — a API, o Socket.IO e a mídia
// vivem em zapapi.* (origem diferente), então passam direto sem tocar neste SW.
// =====================================================
const CACHE_SHELL = 'zap-shell-v1'
const CACHE_ASSETS = 'zap-assets-v1'
const SHELL_KEY = '/__zap_shell__'

// Teto do cache de assets. O filtro do `activate` remove caches cujo NOME difere, mas os
// nomes são fixos (`v1`) — então nada saía nunca e cada deploy acrescentava chunks com
// hash novo para sempre (medido: o build tem 152 arquivos / 4,1 MB, e o histórico acumula
// ~26 arquivos novos por deploy ao longo de 839 deploys).
//
// O risco não é o espaço e sim a COTA da origem, partilhada com o outbox em IndexedDB
// (mensagens pendentes que precisam sobreviver ao F5) e com o cache de áudios offline: ao
// bater na cota, o browser pode despejar a origem inteira e perder mensagem pendente.
const MAX_ASSETS_EM_CACHE = 120

async function armazenarShell(res) {
  try {
    if (!res || !res.ok) return
    // Response "redirected" não pode ser reutilizada em navegação (SecurityError em
    // alguns browsers) — re-empacota o corpo numa Response limpa.
    const limpa = res.redirected
      ? new Response(await res.clone().blob(), { status: 200, headers: res.headers })
      : res.clone()
    const cache = await caches.open(CACHE_SHELL)
    await cache.put(SHELL_KEY, limpa)
  } catch (_) {}
}

// O index.html é servido sem `Cache-Control`, então o browser aplica cache HEURÍSTICO
// (~10% da idade do arquivo; medido em ~57 min, crescendo com o tempo) e entrega HTML
// VELHO sem revalidar. Esse HTML aponta para chunks com hash que o deploy seguinte já
// apagou → 404 → erro de carregamento de chunk. `cache: 'no-store'` obriga a ida à rede
// e torna o SW independente daquele cabeçalho.
//
// Por que o guard: passar um init rebaixa o mode de 'navigate' para 'same-origin' (regra
// do construtor de Request), o que muda como redirecionamentos se comportam numa
// navegação. Então QUALQUER resposta fora do esperado — não-ok, redirecionada ou opaca —
// e qualquer exceção caem para `fetch(req)`, que é exatamente o comportamento anterior.
// O pior caso desta função é "nada mudou".
async function buscarIndexFresco(req) {
  try {
    const r = await fetch(req.url, { cache: 'no-store' })
    if (r && r.ok && !r.redirected && r.type !== 'opaqueredirect') return r
  } catch (_) {}
  return fetch(req)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (!req || req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch (_) { return }
  if (url.origin !== self.location.origin) return

  // SPA: qualquer navegação (/, /atendimento, ...) devolve o index — fresco quando online,
  // do cache quando offline. É o que permite ABRIR o app sem internet.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await buscarIndexFresco(req)
        armazenarShell(fresh)
        return fresh
      } catch (err) {
        const cached = await caches.match(SHELL_KEY)
        if (cached) return cached
        throw err
      }
    })())
    return
  }

  // Bundles com hash no nome: imutáveis por definição — cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res && res.ok) {
        try { const cache = await caches.open(CACHE_ASSETS); await cache.put(req, res.clone()) } catch (_) {}
      }
      return res
    })())
    return
  }

  // Estáticos leves da raiz (ícones, manifest, padrão de fundo, fontes).
  if (/\.(svg|png|ico|jpg|jpeg|webp|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res && res.ok) {
          try { const cache = await caches.open(CACHE_ASSETS); await cache.put(req, res.clone()) } catch (_) {}
        }
        return res
      } catch (err) {
        const hit = await caches.match(req)
        if (hit) return hit
        throw err
      }
    })())
  }
})

// Responde a versão do SW a quem perguntar (usado pelo diagnóstico no console).
self.addEventListener('message', (event) => {
  try {
    if (event && event.data && event.data.type === 'ZAP_SW_VERSION') {
      const port = event.ports && event.ports[0]
      if (port && typeof port.postMessage === 'function') {
        port.postMessage({ swVersion: SW_VERSION })
      }
    }
  } catch (_) {}
})

/**
 * Pergunta a UM cliente se o Web Push deve ser suprimido (ele já mostra o card local).
 * Resolve false se o cliente não responder dentro de SUPPRESS_REPLY_MS — telemóvel suspenso
 * em segundo plano não responde e o push é mostrado como fallback.
 */
function pedeSupressaoAoCliente(client, conversaId) {
  return new Promise((resolve) => {
    try {
      const mc = new MessageChannel()
      const timer = setTimeout(() => resolve(false), SUPPRESS_REPLY_MS)
      mc.port1.onmessage = (e) => {
        clearTimeout(timer)
        resolve(!!(e && e.data && e.data.suppress))
      }
      client.postMessage({ type: 'ZAP_PUSH_SUPPRESS_CHECK', payload: { conversaId } }, [mc.port2])
    } catch (_) {
      resolve(false)
    }
  })
}

/**
 * Interroga TODOS os clientes de janela vivos em paralelo (não só os focados): um cliente
 * desktop vivo em segundo plano está desfocado mas mostra o card local (Notification API) e
 * responde "suppress" para evitar card duplicado. Paralelo + timeout curto mantém o push
 * rápido mesmo com clientes que não respondem (telemóvel suspenso).
 */
async function algumClientePedeSupressao(clientList, conversaId) {
  const clientes = clientList || []
  if (clientes.length === 0) return false
  const respostas = await Promise.all(clientes.map((c) => pedeSupressaoAoCliente(c, conversaId)))
  return respostas.some(Boolean)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Pré-aquece o shell já na instalação (sem depender de uma navegação futura):
      // quem instalou o SW hoje consegue abrir offline amanhã. Best-effort.
      try {
        const res = await fetch('/', { cache: 'reload' })
        await armazenarShell(res)
      } catch (_) {}
      await self.skipWaiting()
    })()
  )
})

/**
 * Caminhos `/assets/` que o HTML do shell referencia — é o caminho do boot, e nunca é
 * podado: perdê-lo obrigaria a baixar o essencial outra vez (ou, offline, impediria abrir).
 */
function assetsReferenciadosNoShell(html) {
  const refs = new Set()
  if (typeof html !== 'string') return refs
  const re = /\/assets\/[A-Za-z0-9._-]+/g
  let m
  while ((m = re.exec(html)) !== null) refs.add(m[0])
  return refs
}

/**
 * Mantém `zap-assets-v1` abaixo do teto, removendo os mais antigos primeiro.
 *
 * Perder uma entrada aqui NUNCA é erro de correção: `/assets/*` cai para a rede. É o que
 * torna a poda segura. Mesmo assim, os assets do shell atual ficam de fora da poda.
 * Corre no `activate`, isto é, uma vez por atualização do SW — não no caminho quente.
 */
async function podarCacheDeAssets() {
  try {
    const cache = await caches.open(CACHE_ASSETS)
    const chaves = await cache.keys()
    const excedente = chaves.length - MAX_ASSETS_EM_CACHE
    if (excedente <= 0) return 0

    let protegidos = new Set()
    try {
      const shell = await caches.match(SHELL_KEY)
      if (shell) protegidos = assetsReferenciadosNoShell(await shell.clone().text())
    } catch (_) {}

    // `cache.keys()` devolve por ordem de inserção: os primeiros são os mais antigos.
    const candidatos = chaves.filter((req) => {
      try {
        return !protegidos.has(new URL(req.url).pathname)
      } catch (_) {
        return true
      }
    })

    const aRemover = Math.min(candidatos.length, excedente)
    for (let i = 0; i < aRemover; i++) await cache.delete(candidatos[i])
    return aRemover
  } catch (_) {
    return 0
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches zap-* de versões antigas (bump de CACHE_SHELL/CACHE_ASSETS limpa tudo).
      try {
        const manter = new Set([CACHE_SHELL, CACHE_ASSETS])
        const nomes = await caches.keys()
        await Promise.all(
          nomes.filter((n) => n.startsWith('zap-') && !manter.has(n)).map((n) => caches.delete(n))
        )
      } catch (_) {}
      // ...e, dentro do cache que FICA, poda o que sobrou de deploys antigos.
      await podarCacheDeAssets()
      await self.clients.claim()
    })()
  )
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let payload = {}
        try {
          const text = event.data ? await event.data.text() : '{}'
          payload = JSON.parse(text || '{}')
        } catch (_) {
          payload = {}
        }

        const conversaId =
          payload?.data?.conversaId ??
          payload?.data?.conversa_id ??
          payload?.data?.conversation_id
        const msgId =
          payload?.data?.messageId ??
          payload?.data?.mensagem_id
        const candidatos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const suppress = await algumClientePedeSupressao(candidatos, conversaId)
        if (suppress) return

        const title = payload.title || 'ZapERP'
        const tagFallback =
          (msgId != null && String(msgId).trim() !== '' && `zap-${String(msgId)}`) ||
          (typeof payload.tag === 'string' && payload.tag.trim() !== '' && payload.tag.trim()) ||
          `zap-fallback-${Date.now()}`

        // `requireInteraction` deixa o banner FIXO na tela até o usuário fechar. Prioridade de
        // ENTREGA (urgency/priority 'high') não deve implicar isso — senão a notificação de
        // mensagem gruda na tela. Só fixa quando o payload pedir explicitamente.
        const shouldRequireInteraction =
          payload?.requireInteraction === true ||
          payload?.data?.requireInteraction === true

        const options = {
          body: payload.body || '',
          icon: payload.icon,
          badge: payload.badge,
          tag: tagFallback,
          renotify: false,
          requireInteraction: shouldRequireInteraction,
          silent: false,
          data: payload.data && typeof payload.data === 'object' ? payload.data : {},
        }

        await self.registration.showNotification(title, options)

        // Ícone na Tela Início: indicador quando o app está em segundo plano (Badging API no SW).
        try {
          const reg = self.registration
          if (reg && typeof reg.setAppBadge === 'function') {
            const hint = payload?.data?.badgeCount
            const n = hint != null && Number.isFinite(Number(hint)) ? Math.max(0, Math.floor(Number(hint))) : null
            if (n != null && n > 0) {
              await reg.setAppBadge(Math.min(n, 99))
            } else {
              await reg.setAppBadge(1)
            }
          }
        } catch (_) {}

        // Auto-fechar o banner após ~5s (a menos que seja para exigir interação).
        // O SO já esconde o banner sozinho com requireInteraction:false; este close reforça
        // e limpa também da lista, para a notificação não "ficar fixa".
        if (!shouldRequireInteraction) {
          await new Promise((resolve) => setTimeout(resolve, AUTO_CLOSE_MS))
          try {
            const notifs = await self.registration.getNotifications({ tag: options.tag })
            notifs.forEach((n) => {
              try {
                n.close()
              } catch (_) {}
            })
          } catch (_) {}
        }
      } catch (e) {
        console.error('[zaperp-sw] push handler:', e)
      }
    })()
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clients) {
          try {
            client.postMessage({ type: 'ZAP_PUSH_RESYNC_REQUIRED', reason: 'pushsubscriptionchange' })
          } catch (_) {}
        }
      } catch (_) {}
    })()
  )
})

function resolveNotificationOpenPath(data) {
  const d = data && typeof data === 'object' ? data : {}
  let raw =
    d.openUrl ||
    d.url ||
    (typeof d.open === 'string' ? d.open : '') ||
    ''
  raw = typeof raw === 'string' ? raw.trim() : ''
  if (raw) {
    if (raw.startsWith('/chat')) {
      try {
        const u = new URL(raw, self.location.origin)
        const cid =
          u.searchParams.get('conversa_id') ||
          u.searchParams.get('conversa') ||
          ''
        if (cid) return `/atendimento?conversa=${encodeURIComponent(cid)}`
      } catch (_) {}
    }
    return raw.startsWith('/') ? raw : `/${raw}`
  }
  const cid = d.conversaId ?? d.conversa_id
  if (cid != null && String(cid).trim() !== '') {
    return `/atendimento?conversa=${encodeURIComponent(String(cid).trim())}`
  }
  return '/atendimento'
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const openPath = resolveNotificationOpenPath(data)
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
      try {
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
      } catch (e) {
        console.error('[zaperp-sw] notificationclick:', e)
      }
    })()
  )
})
