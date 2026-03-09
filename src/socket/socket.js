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

    // Nome/foto: NUNCA atualizar a partir de msg outbound (sender somos nós)
    const isOutbound = msg?.direcao === "out" || msg?.fromMe
    const nomeContato = isOutbound
      ? null
      : (msg.chatName && String(msg.chatName).trim() && String(msg.chatName).trim() !== "name")
        ? String(msg.chatName).trim()
        : (msg.senderName && String(msg.senderName).trim() && String(msg.senderName).trim() !== "name")
          ? String(msg.senderName).trim()
          : null
    const fotoContato = isOutbound
      ? null
      : (msg.senderPhoto && String(msg.senderPhoto).trim().startsWith("http")) ? String(msg.senderPhoto).trim()
        : (msg.photo && String(msg.photo).trim().startsWith("http")) ? String(msg.photo).trim()
          : null

    if (!jaNaLista) {
      const isAbertaParaInc = convStore.selectedId && String(convStore.selectedId) === String(conversaId)
      const nomeInicial = nomeContato || undefined
      chatStore.addChat({
        id: conversaId,
        contato_nome: nomeInicial || "Conversa",
        foto_perfil: fotoContato,
        unread_count: isAbertaParaInc ? 0 : 1,
        ultima_mensagem: msg
      })
    } else {
      // Só preenche nome/foto quando vazio — NUNCA sobrescrever contato_nome com msg outbound
      const existing = chats.find(c => String(c.id) === String(conversaId))
      const patch = {}
      const nomeVazio = !existing?.contato_nome || !String(existing.contato_nome).trim()
      const fotoVazia = !existing?.foto_perfil || !String(existing.foto_perfil).trim()
      if (nomeContato && nomeVazio) patch.contato_nome = nomeContato
      if (fotoContato && fotoVazia) patch.foto_perfil = fotoContato
      if (Object.keys(patch).length > 0) {
        chatStore.updateChatContato(conversaId, patch)
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
      if (jaNaLista && msg.direcao === "in") chatStore.incUnread(conversaId, 1)
      updateDocumentTitleFromChats()

      if (msg.direcao === "in") {
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
    // Sempre tenta patch quando há conversa aberta — patchMensagem filtra por conversa internamente
    // (conversa_id do payload pode vir em formato diferente do selectedId)
    if (convStore.selectedId) {
      convStore.patchMensagem(mensagem_id, partial, {
        conversa_id: conversa_id ?? convStore.conversa?.id ?? convStore.selectedId,
        whatsapp_id,
      })
    }

    // Sincronizar setas na lista de conversas (preview da última mensagem = mesma lógica do bubble no chat)
    // Fallback: match por mensagem_id ou whatsapp_id
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
        const match = (m) => matchById(m) || matchByWa(m)
        if (u && match(u)) {
          chatStore.setUltimaMensagem(conversa_id, { ...u, status_mensagem: s, status: s })
        } else if (lastFromArray && match(lastFromArray)) {
          chatStore.setUltimaMensagem(conversa_id, { ...lastFromArray, status_mensagem: s, status: s })
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
  =========================== */
  socket.on("zapi_sync_contatos", (payload) => {
    try {
      const p = payload || {}
      const total = p.total_contatos ?? 0
      const criados = p.criados ?? 0
      const atualizados = p.atualizados ?? 0
      useNotificationStore.getState().showToast({
        type: "success",
        title: "Z-API",
        message: `Contatos sincronizados: ${total} (${criados} novos, ${atualizados} atualizados).`,
      })
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
  =========================== */
  async function patchEverywhere(payload) {
    if (!payload?.id) return

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

    // conversa aberta: patch apenas metadados (conversa), nunca mensagens
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(payload.id)) {
      convStore.patchConversa(payload)
    }
  }

  socket.on("conversa_atualizada", patchEverywhere)
  socket.on("conversa_encerrada", patchEverywhere)
  socket.on("conversa_transferida", patchEverywhere)
  socket.on("conversa_reaberta", patchEverywhere)
  socket.on("conversa_atribuida", (payload) => {
    if (payload?.id) patchEverywhere(payload)
    updateDocumentTitleFromChats()
  })

  /* Sinal do webhook Z-API: conversa teve atividade (status, transferência, etc.)
     Backend NÃO emite para mensagem nova (usa nova_mensagem).
     Refetchar só a LISTA — nunca as mensagens do chat aberto (evita "aparecer e sumir"). */
  const atualizarDebounce = {}
  socket.on("atualizar_conversa", ({ id } = {}) => {
    if (!id) return
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
          // NUNCA aplicar mensagens ao conversaStore — a lista pode ter chat.mensagens, mas conversaStore.mensagens vem só de nova_mensagem/carregarConversa
        }
      } catch (_) {}
    }, 400)
  })

  /* Nome e foto do contato atualizados pela Z-API (tempo real) — só preenche quando vazio */
  socket.on("contato_atualizado", ({ conversa_id, contato_nome, foto_perfil }) => {
    if (conversa_id == null) return
    useChatStore.getState().updateChatContatoSeVazio(conversa_id, { contato_nome, foto_perfil })
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(conversa_id)) {
      const conv = convStore.conversa
      const nomeVazio = !conv?.contato_nome && !conv?.cliente_nome
      const fotoVazia = !conv?.foto_perfil
      if ((nomeVazio && contato_nome) || (fotoVazia && foto_perfil)) {
        convStore.patchConversa({
          id: conversa_id,
          ...(nomeVazio && contato_nome && { contato_nome, cliente_nome: contato_nome }),
          ...(fotoVazia && foto_perfil && { foto_perfil })
        })
      }
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
