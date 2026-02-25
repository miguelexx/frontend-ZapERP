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

const audio = new Audio("/notification.mp3")
audio.volume = 0.6

function getChatDisplayName(conversaId) {
  const chats = useChatStore.getState().chats || []
  const c = chats.find((x) => String(x.id) === String(conversaId))
  const nome = c?.contato_nome || c?.nome || c?.cliente?.nome || c?.telefone
  return nome || "Nova mensagem"
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

  socket.on("connect", () => {
    const convId = useConversaStore.getState().selectedId
    if (convId) socket.emit("join_conversa", convId)
    updateDocumentTitleFromChats()
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
     🔥 NOVA MENSAGEM (COM SOM + BADGE)
  =========================== */
  socket.on("nova_mensagem", (msg) => {
    const conversaId = msg?.conversa_id
    if (!conversaId) return

    const chatStore = useChatStore.getState()
    const convStore = useConversaStore.getState()
    const chats = chatStore.chats || []
    const jaNaLista = chats.some(c => String(c.id) === String(conversaId))

    if (!jaNaLista) {
      chatStore.addChat({
        id: conversaId,
        contato_nome: "Conversa",
        foto_perfil: null,
        unread_count: 0,
        ultima_mensagem: msg
      })
    }

    chatStore.setUltimaMensagem(conversaId, msg)
    chatStore.bumpChatToTop(conversaId)

    const isAberta =
      convStore.selectedId &&
      String(convStore.selectedId) === String(conversaId)

    /* ----------------------------------
       🔔 NOTIFICAÇÕES (som, desktop, toast, título) — somente se conversa NÃO aberta
    ---------------------------------- */
    if (!isAberta) {
      chatStore.incUnread(conversaId, 1)
      updateDocumentTitleFromChats()

      if (msg.direcao === "in") {
        const contato = getChatDisplayName(conversaId)
        const texto = (msg.texto || "").slice(0, 80)
        try {
          audio.currentTime = 0
          audio.play()
        } catch (_) {}
        showDesktopNotification(contato, texto || "Nova mensagem")
        useNotificationStore.getState().showToast({
          type: "info",
          title: contato,
          message: texto || "Nova mensagem",
        })
      }
      return
    }

    /* ----------------------------------
       conversa aberta → anexar msg e limpar indicador de digitação
    ---------------------------------- */
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
     ✅ STATUS DA MENSAGEM (Z-API)
  =========================== */
  socket.on("status_mensagem", ({ mensagem_id, conversa_id, status, whatsapp_id }) => {
    if (!mensagem_id) return
    // Normalizar para o mesmo valor em lista e mensagem (setas sincronizadas)
    const raw = status != null ? String(status).toLowerCase().trim() : ""
    const s =
      raw === "enviada" || raw === "enviado" ? "sent"
        : raw === "entregue" || raw === "received" ? "delivered"
        : raw === "lida" || raw === "seen" || raw === "visualizada" || raw === "read_by_me" ? "read"
        : raw || null

    const convStore = useConversaStore.getState()
    if (conversa_id) {
      if (convStore.selectedId && String(convStore.selectedId) === String(conversa_id)) {
        convStore.patchMensagem(mensagem_id, { status_mensagem: s, status: s, ...(whatsapp_id ? { whatsapp_id } : {}) })
      }
    } else if (convStore.selectedId) {
      convStore.patchMensagem(mensagem_id, { status_mensagem: s, status: s, ...(whatsapp_id ? { whatsapp_id } : {}) })
    }

    // Sincronizar setas na lista de conversas (preview da última mensagem = mesma lógica do bubble no chat)
    if (conversa_id) {
      const chatStore = useChatStore.getState()
      const chats = chatStore.chats || []
      const idx = chats.findIndex((c) => String(c.id) === String(conversa_id))
      if (idx >= 0) {
        const cur = chats[idx]
        const u = cur?.ultima_mensagem
        const msgs = cur?.mensagens || cur?.messages || []
        const lastFromArray = Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : null
        if (u && String(u.id) === String(mensagem_id)) {
          chatStore.setUltimaMensagem(conversa_id, { ...u, status_mensagem: s, status: s })
        } else if (lastFromArray && String(lastFromArray.id) === String(mensagem_id)) {
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
     🔥 PARTE CRÍTICA (sincronização total)
  =========================== */
  function patchEverywhere(payload) {
    if (!payload?.id) return

    // lista
    useChatStore.getState().updateChat(payload)

    // conversa aberta
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

  /* Sinal do webhook Z-API: conversa teve atividade (nova msg, status, etc.)
     Busca dados frescos do backend e atualiza a lista — garante que nome, foto,
     última mensagem e contadores fiquem corretos sem precisar de reload. */
  socket.on("atualizar_conversa", async ({ id } = {}) => {
    if (!id) return
    try {
      const data = await fetchChatById(id)
      if (!data) return
      const chat = data?.conversa ? data.conversa : data
      if (chat?.id) useChatStore.getState().addChat(chat)
    } catch (_) {}
  })

  /* Nome e foto do contato atualizados pela Z-API (tempo real) — uma só fonte na lista e na conversa */
  socket.on("contato_atualizado", ({ conversa_id, contato_nome, foto_perfil }) => {
    if (conversa_id == null) return
    useChatStore.getState().updateChatContato(conversa_id, { contato_nome, foto_perfil })
    const convStore = useConversaStore.getState()
    if (String(convStore.selectedId) === String(conversa_id)) {
      convStore.patchConversa({
        id: conversa_id,
        contato_nome: contato_nome ?? undefined,
        cliente_nome: contato_nome ?? undefined,
        foto_perfil: foto_perfil ?? undefined
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

  try {
    if (socket) socket.disconnect()
  } catch (_) {}
  socket = null
}

export { updateDocumentTitleFromChats, applyDocumentTitle }
