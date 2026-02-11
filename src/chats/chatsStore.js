import { create } from "zustand"

export const useChatStore = create((set, get) => ({
  /* =========================================
     STATE
  ========================================= */
  chats: [],
  loading: false,

  /* =========================================
     BASE
  ========================================= */
  setChats: (chats) => set({ chats: chats || [] }),
  setLoading: (loading) => set({ loading: !!loading }),

  /** Adiciona ou atualiza conversa na lista (evita duplicar; remove "sem conversa" do mesmo cliente).
   * Ao mesclar com item existente, preserva contato_nome e foto_perfil se o payload não trouxer valor
   * (evita trocar nome/foto por "Conversa" e null em atualizações parciais via socket). */
  addChat: (chat) => {
    if (!chat?.id) return
    let chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(chat.id))
    const merged = { ...chat, unread_count: Number(chat.unread_count ?? chat.unread) || 0 }
    if (chat.cliente_id != null) {
      chats = chats.filter(c => !(c.sem_conversa && String(c.cliente_id) === String(chat.cliente_id)))
    }
    const newIdx = chats.findIndex(c => String(c.id) === String(chat.id))
    if (newIdx >= 0) {
      const next = [...chats]
      const existing = next[newIdx]
      const updated = {
        ...existing,
        ...merged,
        contato_nome: merged.contato_nome != null && merged.contato_nome !== '' ? merged.contato_nome : existing.contato_nome,
        foto_perfil: merged.foto_perfil !== undefined && merged.foto_perfil !== null ? merged.foto_perfil : existing.foto_perfil
      }
      next[newIdx] = updated
      set({ chats: [next[newIdx], ...next.filter((_, i) => i !== newIdx)] })
    } else {
      set({ chats: [merged, ...chats] })
    }
  },

  /* =========================================
     🔥 PATCH GENÉRICO (usado pelo socket)
  ========================================= */
  updateChat: (partial) => {
    if (!partial?.id) return

    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(partial.id))

    // NUNCA adicionar conversa nova via socket — evita vazamento entre setores
    if (idx === -1) return

    const next = [...chats]
    next[idx] = { ...next[idx], ...partial }

    set({ chats: next })
  },

  /** Atualiza nome e foto do contato em tempo real (sync Z-API) */
  updateChatContato: (conversa_id, { contato_nome, foto_perfil }) => {
    if (conversa_id == null) return
    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(conversa_id))
    if (idx === -1) return
    const next = [...chats]
    const cur = next[idx]
    next[idx] = {
      ...cur,
      ...(contato_nome != null && { contato_nome }),
      ...(foto_perfil !== undefined && { foto_perfil })
    }
    set({ chats: next })
  },

  /* =========================================
     TAGS
  ========================================= */
  adicionarTag: (conversa_id, tag) =>
    set((state) => ({
      chats: state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? { ...c, tags: [...(c.tags || []), tag] }
          : c
      )
    })),

  removerTag: (conversa_id, tag_id) =>
    set((state) => ({
      chats: state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? {
              ...c,
              tags: (c.tags || []).filter(t => String(t.id) !== String(tag_id))
            }
          : c
      )
    })),

  /* =========================================
     🔥 MENSAGEM / PREVIEW
  ========================================= */
  setUltimaMensagem: (conversa_id, msg) =>
    set((state) => ({
      chats: state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? { ...c, ultima_mensagem: msg }
          : c
      )
    })),

  /* =========================================
     🔥 ORDENAR (TotalChat behavior)
     sobe conversa quando recebe msg
  ========================================= */
  bumpChatToTop: (conversa_id) => {
    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(conversa_id))
    if (idx <= 0) return

    const item = chats[idx]
    const next = [item, ...chats.filter((_, i) => i !== idx)]

    set({ chats: next })
  },

  /* =========================================
     🔥 UNREAD (PADRÃO BACKEND)
     usa unread_count (não unread)
  ========================================= */
  setUnread: (conversa_id, count) =>
    set((state) => ({
      chats: state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? { ...c, unread_count: Number(count) || 0 }
          : c
      )
    })),

  incUnread: (conversa_id, inc = 1) =>
    set((state) => ({
      chats: state.chats.map(c => {
        if (String(c.id) !== String(conversa_id)) return c
        const cur = Number(c.unread_count || 0)
        return { ...c, unread_count: cur + Number(inc) }
      })
    })),

  clearUnread: (conversa_id) =>
    set((state) => ({
      chats: state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? { ...c, unread_count: 0 }
          : c
      )
    })),

  /* =========================================
     🔥 REMOVER CHAT (opcional futuro)
  ========================================= */
  removeChat: (conversa_id) =>
    set((state) => ({
      chats: state.chats.filter(c => String(c.id) !== String(conversa_id))
    })),

  /* =========================================
     RESET
  ========================================= */
  limpar: () =>
    set({
      chats: [],
      loading: false
    })
}))
