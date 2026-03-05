import { create } from "zustand"
import {
  getChatById,
  assumirChat,
  transferirChat,
  encerrarChat,
  reabrirChat,
  listarAtendimentos,
} from "./conversaService"
import { getSocket, leaveConversa, joinConversaIfNeeded } from "../socket/socket"
import { useChatStore } from "../chats/chatsStore"
import { attachReplyMeta } from "./replyMeta"

const PAGE_LIMIT = 50

export const useConversaStore = create((set, get) => ({
  selectedId: null,
  conversa: null,
  mensagens: [],
  tags: [],
  loading: false,
  loadError: null,

  // ⭐ LOCK REALTIME
  lockedBy: null,

  // paginação
  cursor: null,
  hasMore: true,
  loadingMore: false,

  // timeline/auditoria
  atendimentos: [],
  atendimentosLoading: false,
  atendimentosLoadedFor: null,

  // Indicador de digitação em tempo real: { [conversaId]: { usuario_id, nome, expiresAt } }
  typing: {},

  setSelectedId: (id) => set({ selectedId: id }),

  /** Define quem está digitando na conversa (via WebSocket typing_start). Expira em 5s. */
  setTyping: (conversa_id, payload) => {
    if (!conversa_id) return
    const id = String(conversa_id)
    const expiresAt = Date.now() + 5000
    set((state) => ({
      typing: {
        ...state.typing,
        [id]: payload ? { ...payload, expiresAt } : undefined,
      },
    }))
  },

  /** Remove indicador de digitação (typing_stop ou timeout). */
  clearTyping: (conversa_id) => {
    if (!conversa_id) return
    set((state) => {
      const next = { ...state.typing }
      delete next[String(conversa_id)]
      return { typing: next }
    })
  },

  /* =====================================================
     CARREGAR CONVERSA
  ===================================================== */
  carregarConversa: async (id) => {
    const normalizedId = id != null && id !== "" ? (Number(id) || String(id)) : null
    if (!normalizedId) return

    const prevId = get().selectedId
    if (prevId && String(prevId) !== String(normalizedId)) {
      leaveConversa(prevId)
    }
    joinConversaIfNeeded(normalizedId)

    set({
      loading: true,
      selectedId: normalizedId,
      loadError: null,
      cursor: null,
      hasMore: true,
      mensagens: [],
      tags: [],
      conversa: null,
      lockedBy: null,

      atendimentos: [],
      atendimentosLoading: false,
      atendimentosLoadedFor: null,
    })

    try {
      const data = await getChatById(normalizedId, { limit: PAGE_LIMIT })

      // Evita aplicar resposta de conversa antiga se o usuário já trocou de conversa (race condition)
      if (String(get().selectedId) !== String(normalizedId)) return

      let conversa = data?.conversa ? data.conversa : (data ?? null)
      let mensagens = data?.mensagens ?? conversa?.mensagens ?? []
      const tags = data?.tags ?? conversa?.tags ?? []

      const nextCursor = data?.next_cursor ?? conversa?.next_cursor ?? null

      if (Array.isArray(mensagens)) {
        const byId = new Map()
        mensagens.forEach((m) => {
          if (m?.id != null) byId.set(String(m.id), m)
        })
        mensagens = Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
            (Number(a.id) - Number(b.id))
        )
      } else {
        mensagens = []
      }
      mensagens = attachReplyMeta(normalizedId, mensagens)

      // Mantém nome/foto sincronizados com a lista de conversas:
      // se o backend ainda não devolveu contato_nome/foto_perfil atualizados,
      // aproveita o que já está no chatStore para o mesmo id.
      try {
        const chats = useChatStore.getState?.().chats || []
        const fromList = chats.find?.((c) => String(c.id) === String(normalizedId))
        if (fromList) {
          const merged = { ...conversa }
          if (!merged.contato_nome && fromList.contato_nome) merged.contato_nome = fromList.contato_nome
          if (!merged.contato_nome && fromList.nome_contato_cache) merged.contato_nome = fromList.nome_contato_cache
          if (!merged.contato_nome && fromList.pushname) merged.contato_nome = fromList.pushname
          if (!merged.cliente_nome && (fromList.contato_nome || fromList.nome || fromList.nome_contato_cache)) {
            merged.cliente_nome = fromList.contato_nome || fromList.nome || fromList.nome_contato_cache
          }
          if (!merged.foto_perfil && fromList.foto_perfil) merged.foto_perfil = fromList.foto_perfil
          if (!merged.foto_perfil && fromList.foto_perfil_contato_cache) merged.foto_perfil = fromList.foto_perfil_contato_cache
          if (!merged.nome_grupo && fromList.nome_grupo) merged.nome_grupo = fromList.nome_grupo
          if (!merged.cliente && fromList.cliente) merged.cliente = fromList.cliente
          conversa = merged
        }
      } catch (_) {}

      set({
        conversa,
        mensagens,
        tags: Array.isArray(tags) ? tags : [],
        loading: false,
        loadError: null,
        cursor: nextCursor,
        hasMore: !!nextCursor,
      })

      const socket = getSocket?.()
      if (socket) {
        joinConversaIfNeeded(normalizedId)
        socket.emit("marcar_conversa_lida", { conversa_id: normalizedId })
      }
      useChatStore.getState().clearUnread(normalizedId)
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Erro ao carregar conversa"
      console.error("Erro ao carregar conversa:", err)
      set({ loading: false, loadError: msg })
    }
  },

  /* =====================================================
     REFRESH
  ===================================================== */
  refresh: async (opts = {}) => {
    const id = get().selectedId
    if (!id) return

    const silent = opts?.silent === true
    if (!silent) set({ loading: true })

    try {
      const data = await getChatById(id, { limit: PAGE_LIMIT })

      if (String(get().selectedId) !== String(id)) return

      const conversa = data?.conversa ? data.conversa : (data ?? null)
      let mensagens = data?.mensagens ?? conversa?.mensagens ?? []
      const tags = data?.tags ?? conversa?.tags ?? []

      const nextCursor = data?.next_cursor ?? conversa?.next_cursor ?? null

      if (Array.isArray(mensagens)) {
        const byId = new Map()
        mensagens.forEach((m) => {
          if (m?.id != null) byId.set(String(m.id), m)
        })
        mensagens = Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
            (Number(a.id) - Number(b.id))
        )
      } else {
        mensagens = []
      }
      mensagens = attachReplyMeta(id, mensagens)

      // Preserva nome, telefone e foto — dados fixos do contato não devem mudar após refresh
      let merged = conversa
      try {
        const current = get().conversa
        const chats = useChatStore.getState?.().chats || []
        const fromList = chats.find?.((c) => String(c.id) === String(id))
        const sources = [conversa, current, fromList].filter(Boolean)
        if (sources.length > 1) {
          merged = { ...conversa }
          const pick = (f) => {
            for (const s of sources) {
              const v = s?.[f] ?? s?.cliente?.[f === "telefone_exibivel" ? "telefone" : f]
              if (v != null && String(v).trim() !== "") return v
            }
            return null
          }
          if (!merged.contato_nome) merged.contato_nome = pick("contato_nome") ?? fromList?.nome_contato_cache ?? fromList?.pushname
          if (!merged.cliente_nome) merged.cliente_nome = pick("cliente_nome") ?? pick("contato_nome")
          if (!merged.telefone && !merged.telefone_exibivel) merged.telefone_exibivel = pick("telefone_exibivel") ?? pick("telefone") ?? pick("cliente_telefone")
          if (!merged.telefone_exibivel && merged.telefone) merged.telefone_exibivel = merged.telefone
          if (!merged.foto_perfil) merged.foto_perfil = pick("foto_perfil") ?? fromList?.foto_perfil_contato_cache
          if (!merged.nome_grupo) merged.nome_grupo = pick("nome_grupo")
          if (!merged.cliente) merged.cliente = fromList?.cliente
        }
      } catch (_) {}

      set({
        conversa: merged,
        mensagens,
        tags,
        loading: false,
        cursor: nextCursor,
        hasMore: !!nextCursor,
      })
    } catch (err) {
      console.error("Erro ao atualizar conversa:", err)
      set({ loading: false })
    }
  },

  /* =====================================================
     PAGINAÇÃO
  ===================================================== */
  loadMore: async () => {
    const { selectedId, cursor, hasMore, loadingMore } = get()
    if (!selectedId || !hasMore || !cursor || loadingMore) return

    set({ loadingMore: true })

    try {
      const data = await getChatById(selectedId, { cursor, limit: PAGE_LIMIT })

      if (String(get().selectedId) !== String(selectedId)) {
        set({ loadingMore: false })
        return
      }

      const conversa = data?.conversa ? data.conversa : (data ?? null)
      const mais = data?.mensagens ?? conversa?.mensagens ?? []

      const nextCursor = data?.next_cursor ?? conversa?.next_cursor ?? null

      set((state) => {
        const atual = state.mensagens || []
        const ids = new Set(atual.map((m) => String(m.id)))
        const filtradas = (mais || []).filter((m) => m?.id != null && !ids.has(String(m.id)))
        const merged = [...filtradas, ...atual]
        const byId = new Map()
        merged.forEach((m) => byId.set(String(m.id), m))
        const sorted = Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
            (Number(a.id) - Number(b.id))
        )
        return {
          mensagens: attachReplyMeta(selectedId, sorted),
          cursor: nextCursor,
          hasMore: !!nextCursor,
          loadingMore: false,
        }
      })
    } catch (e) {
      console.error("Erro loadMore:", e)
      set({ loadingMore: false })
    }
  },

  /* =====================================================
     MENSAGENS (de-dup por whatsapp_id preferencial, id ou tempId)
     Aceita msg só com whatsapp_id (espelhadas fromMe do celular)
  ===================================================== */
  anexarMensagem: (msg) => {
    const key = msg?.whatsapp_id ?? msg?.id ?? msg?.tempId
    if (!key) return
    set((state) => {
      const list = state.mensagens || []
      if (msg.whatsapp_id && list.some((m) => String(m.whatsapp_id) === String(msg.whatsapp_id))) return state
      if (msg.id && list.some((m) => String(m.id) === String(msg.id))) return state
      if (msg.tempId && list.some((m) => String(m.tempId) === String(msg.tempId))) return state
      const byId = new Map()
      list.forEach((m) => {
        const k = m.whatsapp_id ? `wa-${m.whatsapp_id}` : m.id ? String(m.id) : m.tempId ? `temp-${m.tempId}` : null
        if (k) byId.set(k, m)
      })
      const newK = msg.whatsapp_id ? `wa-${msg.whatsapp_id}` : msg.id ? String(msg.id) : `temp-${msg.tempId}`
      byId.set(newK, msg)
      const sorted = Array.from(byId.values()).sort(
        (a, b) =>
          new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
          (Number(a.id) - Number(b.id)) ||
          String(a.tempId || "").localeCompare(String(b.tempId || ""))
      )
      return { mensagens: sorted }
    })
  },

  /** Substitui mensagem temp (optimistic) pela real quando API retorna */
  reconciliarMensagem: (tempId, realMsg) => {
    if (!tempId || !realMsg) return
    set((state) => {
      const list = state.mensagens || []
      const idx = list.findIndex((m) => String(m.tempId) === String(tempId))
      if (idx === -1) return state
      const next = [...list]
      next[idx] = { ...realMsg, conversa_id: state.conversa?.id }
      return { mensagens: next }
    })
  },

  /** Atualiza mensagem por id, whatsapp_id ou tempId (status_mensagem) */
  patchMensagem: (mensagemId, partial) => {
    if ((mensagemId == null || mensagemId === "") && !partial?.whatsapp_id && !partial?.tempId) return
    if (!partial || (Object.keys(partial).length === 0)) return
    set((state) => {
      const list = state.mensagens || []
      let idx = -1
      if (mensagemId != null && mensagemId !== "") {
        idx = list.findIndex((m) => String(m.id) === String(mensagemId))
      }
      if (idx === -1 && partial?.whatsapp_id) {
        idx = list.findIndex((m) => String(m.whatsapp_id) === String(partial.whatsapp_id))
      }
      if (idx === -1 && partial?.tempId) {
        idx = list.findIndex((m) => String(m.tempId) === String(partial.tempId))
      }
      if (idx === -1) return state
      const next = [...list]
      next[idx] = { ...next[idx], ...partial }
      return { mensagens: next }
    })
  },

  removerMensagem: (mensagemId) => {
    if (mensagemId == null) return
    set((state) => {
      const list = state.mensagens || []
      const next = list.filter((m) => String(m.id) !== String(mensagemId))
      if (next.length === list.length) return state
      return { mensagens: next }
    })
  },

  /** Remove mensagem temp (optimistic) quando envio falha */
  removerMensagemTemp: (tempId) => {
    if (!tempId) return
    set((state) => {
      const list = state.mensagens || []
      const next = list.filter((m) => String(m.tempId) !== String(tempId))
      if (next.length === list.length) return state
      return { mensagens: next }
    })
  },

  setTags: (tags) => set({ tags: tags || [] }),

  /* =====================================================
     AÇÕES DE ATENDIMENTO
  ===================================================== */
  assumirConversa: async (conversaId) => {
    await assumirChat(conversaId)
    await get().refresh()
    set({ atendimentosLoadedFor: null })
  },

  transferirConversa: async (conversaId, novoAtendenteId, observacao = null) => {
    await transferirChat(conversaId, Number(novoAtendenteId), observacao)
    await get().refresh()
    set({ atendimentosLoadedFor: null })
  },

  encerrarConversa: async (conversaId) => {
    await encerrarChat(conversaId)
    await get().refresh()
    set({ atendimentosLoadedFor: null })
  },

  reabrirConversa: async (conversaId) => {
    await reabrirChat(conversaId)
    await get().refresh()
    set({ atendimentosLoadedFor: null })
  },

  /* =====================================================
     TIMELINE
  ===================================================== */
  carregarAtendimentos: async (conversaId) => {
    const id = conversaId ?? get().selectedId
    if (!id) return

    set({ atendimentosLoading: true })

    const data = await listarAtendimentos(id)

    set({
      atendimentos: data || [],
      atendimentosLoading: false,
      atendimentosLoadedFor: id,
    })
  },

  /* =====================================================
     PATCHES SOCKET
  ===================================================== */
  patchConversa: (partial) => {
    if (!partial?.id) return
    const fixedFields = ["contato_nome", "cliente_nome", "telefone", "telefone_exibivel", "cliente_telefone", "nome_grupo", "foto_perfil"]
    set((state) => {
      if (!state.conversa || String(state.conversa.id) !== String(partial.id))
        return state
      const cur = state.conversa
      const merged = { ...cur, ...partial }
      // Não sobrescreve campos fixos do header com valor vazio — mantém nome e telefone estáveis
      for (const k of fixedFields) {
        const newVal = partial[k]
        const isEmpty = newVal == null || String(newVal || "").trim() === ""
        if (isEmpty && (cur[k] != null && String(cur[k] || "").trim() !== ""))
          merged[k] = cur[k]
      }
      return { conversa: merged }
    })
  },

  // ⭐ LOCK REALTIME
  patchLock: ({ conversa_id, locked_by }) => {
    const { selectedId } = get()
    if (String(selectedId) !== String(conversa_id)) return
    set({ lockedBy: locked_by ?? null })
  },

  /* =====================================================
     LIMPAR
  ===================================================== */
  limpar: () =>
    set({
      selectedId: null,
      conversa: null,
      mensagens: [],
      tags: [],
      loading: false,
      cursor: null,
      hasMore: true,
      loadingMore: false,
      lockedBy: null,
      atendimentos: [],
      atendimentosLoading: false,
      atendimentosLoadedFor: null,
    }),
}))
