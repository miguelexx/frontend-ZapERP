import { create } from "zustand"
import {
  getChatById,
  assumirChat,
  transferirChat,
  encerrarChat,
  reabrirChat,
  listarAtendimentos,
} from "./conversaService"
import { getSocket } from "../socket/socket"
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

  setSelectedId: (id) => set({ selectedId: id }),

  /* =====================================================
     CARREGAR CONVERSA
  ===================================================== */
  carregarConversa: async (id) => {
    const normalizedId = id != null && id !== "" ? (Number(id) || String(id)) : null
    if (!normalizedId) return

    const socket = getSocket?.()
    const prevId = get().selectedId

    if (socket && prevId && String(prevId) !== String(normalizedId)) {
      socket.emit("leave_conversa", prevId)
    }

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
      mensagens = attachReplyMeta(normalizedId, mensagens)

      set({
        conversa,
        mensagens,
        tags: Array.isArray(tags) ? tags : [],
        loading: false,
        loadError: null,
        cursor: nextCursor,
        hasMore: !!nextCursor,
      })

      if (socket) socket.emit("join_conversa", normalizedId)
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

      set({
        conversa,
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
     MENSAGENS
  ===================================================== */
  anexarMensagem: (msg) => {
    if (!msg?.id) return
    set((state) => {
      const list = state.mensagens || []
      const existe = list.some((m) => String(m.id) === String(msg.id))
      if (existe) return state
      const byId = new Map(list.map((m) => [String(m.id), m]))
      byId.set(String(msg.id), msg)
      const sorted = Array.from(byId.values()).sort(
        (a, b) =>
          new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
          (Number(a.id) - Number(b.id))
      )
      return { mensagens: sorted }
    })
  },

  patchMensagem: (mensagemId, partial) => {
    if (mensagemId == null || !partial) return
    set((state) => {
      const list = state.mensagens || []
      const idx = list.findIndex((m) => String(m.id) === String(mensagemId))
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
    set((state) => {
      if (!state.conversa || String(state.conversa.id) !== String(partial.id))
        return state
      return { conversa: { ...state.conversa, ...partial } }
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
