import { io } from "socket.io-client"
import { useChatStore } from "../chats/chatsStore"
import { useConversaStore } from "../conversa/conversaStore"
import { useNotificationStore } from "../notifications/notificationStore"
import { getApiBaseUrl } from "../api/baseUrl"
import { fetchChatById } from "../chats/chatService"

const TYPING_EXPIRY_MS = 5000
let typingExpiryTimer = null

function applyDocumentTitle(unreadTotal) {
  if (typeof document === "undefined") return
  const base = "ZapERP — Atendimento inteligente"
  document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base
}

function updateDocumentTitleFromChats() {
  const chats = useChatStore.getState().chats || []
  const total = chats.reduce((acc, c) => acc + (Number(c.unread_count) || 0), 0)
  applyDocumentTitle(total)
}

// Som de notificação: tenta arquivo MP3, fallback para beep via Web Audio API
function playNotificationSound() {
  try {
    const audio = new Audio("/notification.mp3")
    audio.volume = 0.6
    audio.play().catch(() => playFallbackBeep())
  } catch (_) {
    playFallbackBeep()
  }
}

function playFallbackBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = "sine"
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch (_) {}
}

function getChatDisplayName(conversaId) {
  const chats = useChatStore.getState().chats || []
  const c = chats.find((x) => String(x.id) === String(conversaId))
  if (!c) return "Nova mensagem"
  // Grupos: nome_grupo tem prioridade
  const jid = c.remoteJid ?? c.telefone ?? c.phone ?? ""
  if (String(jid).endsWith("@g.us") || c.is_group || c.isGroup) {
    const gn = c?.nome_grupo ?? c?.contato_nome ?? c?.nome ?? ""
    if (String(gn || "").trim() && !String(gn).toLowerCase().startsWith("lid:")) return String(gn).trim()
  }
  const nome = c?.contato_nome || c?.nome || c?.cliente?.nome || c?.telefone
  return nome || "Nova mensagem"
}

/** Multi-tenant: company_id do usuário logado (evita circular com authStore) */
function getCurrentCompanyId() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("zap_erp_auth") : null
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const u = parsed?.user
    return u?.company_id ?? u?.empresa_id ?? null
  } catch {
    return null
  }
}

/** Ignora evento se payload.company_id não bater com o do usuário (multi-tenant) */
function shouldIgnoreByCompany(payload) {
  const payloadCompany = payload?.company_id ?? payload?.empresa_id
  if (payloadCompany == null) return false
  const myCompany = getCurrentCompanyId()
  if (myCompany == null) return false
  return String(payloadCompany) !== String(myCompany)
}

function showDesktopNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission === "granted") {
    try {
      const icon = "/brand/zaperp-favicon.svg"
      const n = new Notification(title, { body, icon })
      n.onclick = () => window.focus()
      setTimeout(() => n.close(), 5000)
    } catch (_) {}
    return
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") showDesktopNotification(title, body)
    })
  }
}

function getMessagesScrollMetrics() {
  if (typeof document === "undefined") return null
  const container = document.querySelector(".wa-messages")
  if (!container) return null
  return {
    scrollTop: Number(container.scrollTop || 0),
    scrollHeight: Number(container.scrollHeight || 0),
    clientHeight: Number(container.clientHeight || 0),
  }
}

function logSocketConversaDebug(eventName, payload) {
  const selectedId = useConversaStore.getState().selectedId
  const payloadId = payload?.id ?? payload?.conversa_id ?? null
  if (selectedId == null || payloadId == null) return
  if (String(selectedId) !== String(payloadId)) return
  console.debug(`[scroll-debug] socket:${eventName}`, {
    conversaId: payloadId,
    metrics: getMessagesScrollMetrics(),
  })
}

let socket = null
/** Ref para idempotência de join — evita joins duplicados ao reconectar ou trocar conversa */
let currentConversationId = null

/** Emite leave da sala atual. Sempre usar antes de join em outra conversa. */
export function leaveConversa(id) {
  if (!id) return
  const s = String(id)
  if (currentConversationId === s) currentConversationId = null
  try {
    if (socket) socket.emit("leave_conversa", id)
  } catch (_) {}
}

/** Join idempotente: só emite se ainda não está na sala X. */
export function joinConversaIfNeeded(id) {
  if (!socket || !id) return
  const s = String(id)
  if (currentConversationId === s) return
  currentConversationId = s
  socket.emit("join_conversa", id)
}

export function initSocket(token) {
  if (socket) return socket

  const base = getApiBaseUrl()

  socket = io(base, {
    auth: { token },
    transports: ["websocket", "polling"],
  })

  if (import.meta.env.DEV) {
    socket.on("connect", () => console.log("🟢 Socket conectado:", socket.id))
    socket.on("disconnect", () => console.log("🔴 Socket desconectado"))
  }

  // Listeners idempotentes: remove antes de registrar (evita duplicar ao re-init)
  const off = (ev) => { try { socket?.off(ev) } catch (_) {} }
  off("typing_start")
  off("typing_stop")
  off("tag_adicionada")
  off("tag_removida")
  off("nova_conversa")
  off("nova_mensagem")
  off("mensagem_excluida")
  off("mensagem_editada")
  off("mensagem_oculta")
  off("status_mensagem")
  off("mensagens_lidas")
  off("zapi_sync_contatos")
  off("conversa_atualizada")
  off("conversa_encerrada")
  off("conversa_transferida")
  off("conversa_reaberta")
  off("conversa_atribuida")
  off("atualizar_conversa")
  off("contato_atualizado")

  socket.on("connect", () => {
    currentConversationId = null
    const convId = useConversaStore.getState().selectedId
    if (convId) joinConversaIfNeeded(convId)
    updateDocumentTitleFromChats()
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }
  })

  /* ===========================
     INDICADOR DE DIGITAÇÃO
  =========================== */
  socket.on("typing_start", ({ conversa_id, usuario_id, nome }) => {
    if (!conversa_id) return
    useConversaStore.getState().setTyping(conversa_id, { usuario_id, nome })
    if (typingExpiryTimer) clearTimeout(typingExpiryTimer)
    typingExpiryTimer = setTimeout(() => {
      useConversaStore.getState().clearTyping(conversa_id)
      typingExpiryTimer = null
    }, TYPING_EXPIRY_MS)
  })

  socket.on("typing_stop", ({ conversa_id }) => {
    if (!conversa_id) return
    if (typingExpiryTimer) {
      clearTimeout(typingExpiryTimer)
      typingExpiryTimer = null
    }
    useConversaStore.getState().clearTyping(conversa_id)
  })

  /* ===========================
     TAGS
  =========================== */
  socket.on("tag_adicionada", ({ conversa_id, tag }) => {
    if (!conversa_id) return

    useChatStore.getState().adicionarTag(conversa_id, tag)

    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(conversa_id)) {
      convStore.setTags([...(convStore.tags || []), tag])
    }
  })

  socket.on("tag_removida", ({ conversa_id, tag_id }) => {
    if (!conversa_id || !tag_id) return

    useChatStore.getState().removerTag(conversa_id, tag_id)

    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(conversa_id)) {
      convStore.setTags((convStore.tags || []).filter(t => t.id !== tag_id))
    }
  })

  /* Nova conversa criada (ex.: primeira mensagem via webhook Z-API) — adiciona à lista */
  socket.on("nova_conversa", (payload) => {
    if (!payload?.id) return
    useChatStore.getState().addChat(payload)
  })

  /* ===========================
     🔥 NOVA MENSAGEM (COM SOM + BADGE) — de-dup por whatsapp_id
  =========================== */
  socket.on("nova_mensagem", (msg) => {
    const conversaId = msg?.conversa_id
    if (!conversaId) return
    if (shouldIgnoreByCompany(msg)) return
    if (msg.fromMe && !msg.direcao) msg = { ...msg, direcao: "out" }

    const chatStore = useChatStore.getState()
    const convStore = useConversaStore.getState()
    const chats = chatStore.chats || []
    const jaNaLista = chats.some(c => String(c.id) === String(conversaId))

    /* Não fazer early-return por "jaExiste": anexarMensagem faz UPSERT — merge status/whatsapp_id se já existir */

    // Nome/foto do CONTATO (quem estamos conversando): usar sempre que vier no payload
    // Inbound: pushname do remetente. Outbound (envio pelo celular): sync UltraMSG traz nome/foto do destinatário
    const isOutbound = msg?.direcao === "out" || msg?.fromMe
    const nomeContato = (msg.chatName && String(msg.chatName).trim() && String(msg.chatName).trim() !== "name")
      ? String(msg.chatName).trim()
      : (msg.senderName && String(msg.senderName).trim() && String(msg.senderName).trim() !== "name")
        ? String(msg.senderName).trim()
        : null
    const fotoContato = (msg.senderPhoto && String(msg.senderPhoto).trim().startsWith("http")) ? String(msg.senderPhoto).trim()
      : (msg.photo && String(msg.photo).trim().startsWith("http")) ? String(msg.photo).trim()
        : null

    if (!jaNaLista) {
      const isAbertaParaInc = convStore.selectedId && String(convStore.selectedId) === String(conversaId)
      // Nome imutável: usar só o da mensagem (inbound); outbound não inventa nome
      const nomeInicial = nomeContato || undefined
      const isGroup = msg?.isGroup || msg?.is_group || String(msg?.chatId ?? msg?.remoteJid ?? "").endsWith("@g.us")
      const payload = {
        id: conversaId,
        contato_nome: nomeInicial,
        foto_perfil: fotoContato,
        unread_count: isAbertaParaInc ? 0 : 1,
        ultima_mensagem: msg
      }
      if (isGroup) {
        payload.is_group = true
        if (nomeContato && String(nomeContato).trim() && String(nomeContato).toLowerCase() !== "name") {
          payload.nome_grupo = nomeContato.trim()
        }
      }
      chatStore.addChat(payload)
    } else {
      // Só preenche quando vazio — nome NUNCA troca uma vez definido
      if (nomeContato || fotoContato) {
        chatStore.updateChatContato(conversaId, {
          contato_nome: nomeContato || undefined,
          foto_perfil: fotoContato || undefined
        })
      }
      // Grupos: preencher nome_grupo quando vier na mensagem e o chat ainda não tiver
      const isGroup = msg?.isGroup || msg?.is_group || String(msg?.chatId ?? msg?.remoteJid ?? "").endsWith("@g.us")
      if (isGroup && nomeContato && String(nomeContato).trim() && String(nomeContato).toLowerCase() !== "name") {
        const chats = chatStore.chats || []
        const c = chats.find((x) => String(x.id) === String(conversaId))
        const nomeGrupoAtual = c?.nome_grupo
        if (!nomeGrupoAtual || !String(nomeGrupoAtual).trim() || String(nomeGrupoAtual).toLowerCase().startsWith("lid:")) {
          chatStore.updateChat({ id: conversaId, nome_grupo: nomeContato.trim(), is_group: true })
        }
      }
    }

    if (typeof chatStore.setUltimaMensagemEBump === "function") {
      chatStore.setUltimaMensagemEBump(conversaId, msg)
    } else {
      chatStore.setUltimaMensagem(conversaId, msg)
      chatStore.bumpChatToTop(conversaId)
    }

    const isAberta =
      convStore.selectedId &&
      String(convStore.selectedId) === String(conversaId)

    /* ----------------------------------
       🔔 NOTIFICAÇÕES (som, desktop, toast, título) — somente se conversa NÃO aberta
       incUnread só para direcao 'in' (mensagem recebida)
    ---------------------------------- */
    if (!isAberta) {
      if (jaNaLista && !msg.fromMe && msg.direcao === "in") {
        if (typeof chatStore.incUnreadComBadge === "function") {
          chatStore.incUnreadComBadge(conversaId, 1)
        } else {
          chatStore.incUnread(conversaId, 1)
        }
      }
      updateDocumentTitleFromChats()

      if (!msg.fromMe && msg.direcao === "in") {
        const contato = getChatDisplayName(conversaId)
        const tipo = (msg.tipo || "").toLowerCase()
        const textoBruto = (msg.texto || "").trim()
        const texto =
          textoBruto
            ? textoBruto.slice(0, 80)
            : tipo === "imagem"
              ? "📷 Imagem"
              : tipo === "video"
                ? "🎬 Vídeo"
                : tipo === "sticker"
                  ? "🎭 Figurinha"
                  : tipo === "audio"
                    ? "🎵 Áudio"
                    : tipo === "arquivo"
                      ? "📎 Arquivo"
                      : "Nova mensagem"
        playNotificationSound()
        showDesktopNotification(contato, texto)
        useNotificationStore.getState().showToast({
          type: "info",
          title: contato,
          message: texto,
        })
      }
      return
    }

    /* ----------------------------------
       conversa aberta → anexar msg e limpar indicador de digitação
       Ignora quando mensagens_bloqueadas (conversa assumida por outro atendente)
    ---------------------------------- */
    const convAberta = convStore.conversa
    if (convAberta?.mensagens_bloqueadas && String(convAberta?.id) === String(conversaId)) {
      return
    }
    convStore.clearTyping(conversaId)
    convStore.anexarMensagem(msg)
  })

  /* ===========================
     🗑️ MENSAGEM EXCLUÍDA (realtime)
  =========================== */
  socket.on("mensagem_excluida", ({ conversa_id, mensagem_id, ultima_mensagem }) => {
    if (!conversa_id || !mensagem_id) return

    const chatStore = useChatStore.getState()
    chatStore.setUltimaMensagem(conversa_id, ultima_mensagem || null)

    const convStore = useConversaStore.getState()
    if (convStore.selectedId && String(convStore.selectedId) === String(conversa_id)) {
      convStore.removerMensagem(mensagem_id)
    }
  })

  /* ===========================
     ✏️ MENSAGEM EDITADA (WhatsApp)
     Atualiza apenas o texto da mensagem pelo id — nunca remove ou reordena
  =========================== */
  socket.on("mensagem_editada", (msg) => {
    if (!msg?.id) return
    const convStore = useConversaStore.getState()
    const selectedId = convStore.selectedId
    if (!selectedId) return
    const conversaId = msg?.conversa_id
    if (conversaId && String(conversaId) !== String(selectedId)) return
    convStore.patchMensagem(msg.id, {
      texto: msg.texto ?? msg.conteudo,
      conteudo: msg.conteudo ?? msg.texto,
      editado: true,
    })
  })

  /* Mensagem ocultada "pra mim" (somente usuário) */
  socket.on("mensagem_oculta", ({ conversa_id, mensagem_id }) => {
    if (!conversa_id || !mensagem_id) return
    const convStore = useConversaStore.getState()
    if (convStore.selectedId && String(convStore.selectedId) === String(conversa_id)) {
      convStore.removerMensagem(mensagem_id)
    }
  })

  /* ===========================
     ✅ STATUS DA MENSAGEM (Z-API) — fallback por whatsapp_id
     Sincroniza ticks em tempo real: conversa aberta + lista de chats
  =========================== */
  socket.on("status_mensagem", (payload) => {
    // Suporte a payload aninhado (ex: { data: { ... } }) e chaves alternativas (Z-API, etc.)
    const p = payload?.data || payload || {}
    const mensagem_id = p.mensagem_id ?? p.message_id ?? p.msg_id ?? p.id ?? payload?.mensagem_id ?? payload?.message_id
    const conversa_id = p.conversa_id ?? p.chat_id ?? p.chatId ?? payload?.conversa_id ?? payload?.chat_id
    const status = p.status ?? payload?.status
    const whatsapp_id = p.whatsapp_id ?? p.wamid ?? p.wa_id ?? p.whatsappMessageId ?? payload?.whatsapp_id ?? payload?.wamid
    if (!mensagem_id && !whatsapp_id && !status) return
    if (shouldIgnoreByCompany(payload)) return
    // Normalizar: pending/sent/delivered/read/played (WhatsApp Web)
    const raw = status != null ? String(status).toLowerCase().trim() : ""
    const s =
      raw === "enviada" || raw === "enviado" ? "sent"
        : raw === "entregue" || raw === "received" ? "delivered"
        : raw === "lida" || raw === "seen" || raw === "visualizada" || raw === "read_by_me" ? "read"
        : raw === "played" || raw === "reproduzida" ? "played"
        : raw || null

    const convStore = useConversaStore.getState()
    const partial = { status_mensagem: s, status: s }
    if (whatsapp_id) partial.whatsapp_id = whatsapp_id

    // Patch na conversa aberta: só quando for a mesma conversa (ou conversa_id ausente)
    const selectedId = convStore.selectedId
    const isConversaAberta = selectedId != null
    const conversaIdMatch = !conversa_id || String(conversa_id) === String(selectedId)
    if (isConversaAberta && conversaIdMatch) {
      convStore.patchMensagem(mensagem_id, partial, {
        conversa_id: conversa_id ?? convStore.conversa?.id ?? selectedId,
        whatsapp_id,
      })
    }

    // Sincronizar setas na lista de conversas (preview da última mensagem)
    // Match por mensagem_id, whatsapp_id ou fallback: última mensagem "out" recente (optimistic)
    if (conversa_id) {
      const chatStore = useChatStore.getState()
      const chats = chatStore.chats || []
      const idx = chats.findIndex((c) => String(c.id) === String(conversa_id))
      if (idx >= 0) {
        const cur = chats[idx]
        const u = cur?.ultima_mensagem
        const msgs = cur?.mensagens || cur?.messages || []
        const lastFromArray = Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : null
        const matchById = (m) => mensagem_id && String(m?.id) === String(mensagem_id)
        const matchByWa = (m) => whatsapp_id && String(m?.whatsapp_id) === String(whatsapp_id)
        const match = (m) => m && (matchById(m) || matchByWa(m))

        let targetMsg = null
        if (u && match(u)) targetMsg = u
        else if (lastFromArray && match(lastFromArray)) targetMsg = lastFromArray
        else if (u && String(u?.direcao || "").toLowerCase() === "out") {
          // Fallback: última msg out (ticks só aplicam a mensagens enviadas por nós)
          // Útil quando status chega antes do whatsapp_id ser atribuído (optimistic)
          const recentMs = 60_000
          const ts = new Date(u?.criado_em || 0).getTime()
          if (Date.now() - ts < recentMs) targetMsg = u
        }

        if (targetMsg) {
          chatStore.setUltimaMensagem(conversa_id, { ...targetMsg, status_mensagem: s, status: s })
        }
      }
    }
  })

  /* ===========================
     MENSAGENS LIDAS (igual WhatsApp: ao abrir a conversa marca como lida e remove notificação)
  =========================== */
  socket.on("mensagens_lidas", ({ conversa_id }) => {
    if (!conversa_id) return
    useChatStore.getState().setUnread(conversa_id, 0)
    updateDocumentTitleFromChats()
  })

  /* ===========================
     Z-API: SYNC DE CONTATOS FINALIZADO (auto)
     Toast apenas no início da sessão (primeira sincronização após conectar)
  =========================== */
  let syncToastJaMostradoNestaSessao = false
  socket.on("zapi_sync_contatos", (payload) => {
    try {
      const p = payload || {}
      const total = p.total_contatos ?? 0
      const criados = p.criados ?? 0
      const atualizados = p.atualizados ?? 0
      if (!syncToastJaMostradoNestaSessao) {
        syncToastJaMostradoNestaSessao = true
        useNotificationStore.getState().showToast({
          type: "success",
          title: "UltraMSG",
          message: `Contatos sincronizados: ${total} (${criados} novos, ${atualizados} atualizados).`,
        })
      }
    } catch (_) {}

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent("zapi_sync_contatos", { detail: payload }))
      } catch (_) {}
    }
  })

  /* ===========================
     STATUS / AÇÕES DE ATENDIMENTO
     conversa_atualizada: merge defensivo na lista; NUNCA refetchar mensagens do chat aberto
     ultima_mensagem_preview: só preview na lista — NUNCA adicionar às mensagens do chat (não tem id)
  =========================== */
  function handleConversaAtualizada(payload) {
    if (!payload?.id) return
    logSocketConversaDebug("conversa_atualizada", payload)
    const chatStore = useChatStore.getState()
    const chats = chatStore.chats || []
    const idx = chats.findIndex((c) => String(c.id) === String(payload.id))
    if (idx >= 0) {
      const next = { ...chats[idx] }
      if (payload.ultima_atividade != null) next.ultima_atividade = payload.ultima_atividade
      if (payload.contato_nome != null && payload.contato_nome !== "") next.contato_nome = payload.contato_nome
      if (payload.nome_contato_cache != null && payload.nome_contato_cache !== "") next.nome_contato_cache = payload.nome_contato_cache
      if (payload.foto_perfil != null && payload.foto_perfil !== "") next.foto_perfil = payload.foto_perfil
      if (payload.foto_perfil_contato_cache != null && payload.foto_perfil_contato_cache !== "") next.foto_perfil_contato_cache = payload.foto_perfil_contato_cache
      if (payload.status_atendimento != null) next.status_atendimento = payload.status_atendimento
      if (payload.telefone != null) next.telefone = payload.telefone
      if (payload.cliente_id != null) next.cliente_id = payload.cliente_id
      if (payload.exibir_badge_aberta !== undefined) next.exibir_badge_aberta = !!payload.exibir_badge_aberta
      if (payload.ultima_mensagem_preview != null) {
        next.ultima_mensagem_preview = payload.ultima_mensagem_preview
        next.ultima_mensagem = payload.ultima_mensagem_preview
        if (payload.ultima_mensagem_preview?.criado_em) next.ultima_atividade = payload.ultima_mensagem_preview.criado_em
      }
      if (payload.ultima_mensagem != null && !payload.ultima_mensagem?.id) {
        next.ultima_mensagem_preview = payload.ultima_mensagem
        next.ultima_mensagem = payload.ultima_mensagem
        if (payload.ultima_mensagem?.criado_em) next.ultima_atividade = payload.ultima_mensagem.criado_em
      }
      if (payload.tem_novas_mensagens === true) {
        next.tem_novas_mensagens = true
        next.lida = false
      }
      chatStore.updateChat({ id: payload.id, ...next })
    }
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(payload.id)) {
      convStore.patchConversa(payload)
    }
  }

  async function patchEverywhere(payload) {
    if (!payload?.id) return
    logSocketConversaDebug("patch_everywhere", payload)
    const chatStore = useChatStore.getState()
    const chats = chatStore.chats || []
    const idx = chats.findIndex((c) => String(c.id) === String(payload.id))
    if (idx >= 0) {
      chatStore.updateChat(payload)
    } else {
      try {
        const data = await fetchChatById(payload.id)
        const chat = data?.conversa ?? data
        if (chat?.id) chatStore.addChat(chat)
      } catch (_) {}
    }
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(payload.id)) {
      convStore.patchConversa(payload)
    }
  }

  socket.on("conversa_atualizada", handleConversaAtualizada)
  socket.on("conversa_encerrada", (payload) => {
    logSocketConversaDebug("conversa_encerrada", payload)
    patchEverywhere(payload)
  })
  socket.on("conversa_transferida", patchEverywhere)
  socket.on("conversa_reaberta", (payload) => {
    logSocketConversaDebug("conversa_reaberta", payload)
    patchEverywhere(payload)
  })
  socket.on("conversa_atribuida", (payload) => {
    if (payload?.id) patchEverywhere(payload)
    updateDocumentTitleFromChats()
  })

  /* Sinal do webhook Z-API: conversa teve atividade (status, transferência, etc.)
     Backend NÃO emite para mensagem nova (usa nova_mensagem).
     NUNCA refetchar mensagens do chat aberto — isso causa "aparecer e sumir".
     Apenas atualizar item na lista quando for outra conversa. */
  const atualizarDebounce = {}
  socket.on("atualizar_conversa", ({ id } = {}) => {
    if (!id) return
    logSocketConversaDebug("atualizar_conversa", { id })
    const selectedId = useConversaStore.getState().selectedId
    if (String(id) === String(selectedId)) {
      return
    }
    const key = String(id)
    if (atualizarDebounce[key]) clearTimeout(atualizarDebounce[key])
    atualizarDebounce[key] = setTimeout(async () => {
      delete atualizarDebounce[key]
      try {
        const data = await fetchChatById(id)
        if (!data) return
        const chat = data?.conversa ? data.conversa : data
        if (chat?.id) {
          useChatStore.getState().addChat(chat)
        }
      } catch (_) {}
    }, 400)
  })

  /* Nome e foto do contato atualizados pela API UltraMsg (tempo real) — name (nome salvo no celular) tem prioridade sobre pushname */
  socket.on("contato_atualizado", ({ conversa_id, contato_nome, nome_contato_cache, nome_grupo, foto_perfil, foto_perfil_contato_cache, foto_grupo }) => {
    if (conversa_id == null) return
    const nome = contato_nome ?? nome_contato_cache
    const foto = foto_perfil ?? foto_perfil_contato_cache
    if (nome != null || foto != null || nome_grupo != null || foto_grupo != null) {
      const patch = {
        id: conversa_id,
        contato_nome: nome || undefined,
        nome_contato_cache: nome || undefined,
        foto_perfil: foto || undefined,
        foto_perfil_contato_cache: foto || undefined
      }
      if (nome_grupo != null && String(nome_grupo).trim()) patch.nome_grupo = nome_grupo.trim()
      if (foto_grupo != null && String(foto_grupo).trim().startsWith("http")) patch.foto_grupo = foto_grupo
      useChatStore.getState().updateChat(patch)
    }
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(conversa_id) && (nome || foto)) {
      convStore.patchConversa({
        id: conversa_id,
        ...(nome && { contato_nome: nome, cliente_nome: nome, nome_contato_cache: nome }),
        ...(foto && { foto_perfil: foto, foto_perfil_contato_cache: foto })
      })
    }
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  try {
    if (typingExpiryTimer) {
      clearTimeout(typingExpiryTimer)
      typingExpiryTimer = null
    }
  } catch (_) {}

  currentConversationId = null
  try {
    if (socket) socket.disconnect()
  } catch (_) {}
  socket = null
}

export { updateDocumentTitleFromChats, applyDocumentTitle }
