import { io } from "socket.io-client"
import { useChatStore } from "../chats/chatsStore"
import { useConversaStore } from "../conversa/conversaStore"
import { useNotificationStore } from "../notifications/notificationStore"

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
      const n = new Notification(title, { body, icon: "/favicon.ico" })
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

  const base =
    import.meta.env.VITE_API_URL ||
    "http://wksos40okks4cccoogwwc8co.72.60.147.139.sslip.io"

  socket = io(base, {
    auth: { token },
    transports: ["websocket", "polling"],
  })

  socket.on("connect", () => console.log("🟢 Socket conectado:", socket.id))
  socket.on("disconnect", () => console.log("🔴 Socket desconectado"))

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
       🔔 NOTIFICAÇÕES (som, desktop, toast) — somente se conversa NÃO aberta
    ---------------------------------- */
    if (!isAberta) {
      chatStore.incUnread(conversaId, 1)

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
       conversa aberta → só anexar msg
    ---------------------------------- */
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
     ✅ STATUS DA MENSAGEM (Z-API)
  =========================== */
  socket.on("status_mensagem", ({ mensagem_id, conversa_id, status }) => {
    if (!mensagem_id) return
    const s = status != null ? String(status) : null

    const convStore = useConversaStore.getState()
    if (conversa_id && convStore.selectedId && String(convStore.selectedId) === String(conversa_id)) {
      convStore.patchMensagem(mensagem_id, { status_mensagem: s, status: s })
    } else {
      // mesmo se não for a conversa aberta, ainda pode atualizar preview se for última
    }

    if (conversa_id) {
      const chatStore = useChatStore.getState()
      const chats = chatStore.chats || []
      const idx = chats.findIndex((c) => String(c.id) === String(conversa_id))
      if (idx >= 0) {
        const cur = chats[idx]
        const u = cur?.ultima_mensagem
        if (u && String(u.id) === String(mensagem_id)) {
          chatStore.setUltimaMensagem(conversa_id, { ...u, status_mensagem: s, status: s })
        }
      }
    }
  })

  /* ===========================
     MENSAGENS LIDAS
  =========================== */
  socket.on("mensagens_lidas", ({ conversa_id }) => {
    if (!conversa_id) return
    useChatStore.getState().setUnread(conversa_id, 0)
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
  socket.on("conversa_atribuida", () => {
    /* Conversa atribuída a este usuário; a lista será atualizada no próximo carregamento */
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
