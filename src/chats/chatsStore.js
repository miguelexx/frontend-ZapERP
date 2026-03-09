import { create } from "zustand"

/** Chave canônica para dedupe: telefone | canonicalPhone | chat_lid */
function canonicalKey(c) {
  const tel = c?.telefone ?? c?.numero ?? c?.phone ?? c?.wa_id ?? ""
  const canon = c?.canonicalPhone ?? c?.canonical_phone ?? ""
  const lid = c?.chat_lid ?? c?.chatLid ?? ""
  const s = String(tel || canon || lid || "").trim()
  return s.toLowerCase().startsWith("lid:") ? `lid:${lid}` : s || `id-${c?.id ?? ""}`
}

/** Ordena conversas por ultima_atividade DESC (mais recente no topo) */
function sortConversasByRecent(arr) {
  if (!Array.isArray(arr) || arr.length <= 1) return arr
  return [...arr].sort((a, b) => {
    const ta = new Date(a?.ultima_atividade ?? a?.ultima_mensagem?.criado_em ?? a?.criado_em ?? 0).getTime()
    const tb = new Date(b?.ultima_atividade ?? b?.ultima_mensagem?.criado_em ?? b?.criado_em ?? 0).getTime()
    return tb - ta
  })
}

/** Remove duplicatas: mantém a que tem telefone (não lid), ultima_atividade maior, nome/foto preenchidos */
function dedupeConversas(list) {
  if (!Array.isArray(list) || list.length === 0) return list
  const byKey = new Map()
  for (const c of list) {
    const key = canonicalKey(c)
    if (!key || key === "id-") {
      byKey.set(`uniq-${c?.id ?? Math.random()}`, c)
      continue
    }
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, c)
      continue
    }
    const hasPhone = (x) => {
      const t = x?.telefone ?? x?.numero ?? x?.phone ?? ""
      const s = String(t || "").trim()
      return s && !s.toLowerCase().startsWith("lid:")
    }
    const ts = (x) => new Date(x?.ultima_atividade ?? x?.ultima_mensagem?.criado_em ?? x?.criado_em ?? 0).getTime()
    const hasName = (x) => !!(x?.contato_nome ?? x?.nome_contato_cache ?? x?.nome_grupo ?? "").trim()
    const hasFoto = (x) => !!(x?.foto_perfil ?? x?.foto_perfil_contato_cache ?? "").trim()
    let keep = c
    if (hasPhone(existing) && !hasPhone(c)) keep = existing
    else if (!hasPhone(existing) && hasPhone(c)) keep = c
    else if (ts(c) > ts(existing)) keep = c
    else if (ts(c) === ts(existing) && (hasName(c) || hasFoto(c)) && !(hasName(existing) && hasFoto(existing))) keep = c
    else keep = existing
    byKey.set(key, keep)
  }
  return Array.from(byKey.values())
}

export const useChatStore = create((set, get) => ({
  /* =========================================
     STATE
  ========================================= */
  chats: [],
  loading: false,

  /* =========================================
     BASE
  ========================================= */
  setChats: (chats) => {
    const arr = typeof chats === "function" ? null : (chats || [])
    if (arr) {
      set({ chats: dedupeConversas(arr) })
    } else {
      set((state) => ({ chats: dedupeConversas(chats(state.chats || []) || []) }))
    }
  },
  setLoading: (loading) => set({ loading: !!loading }),

  /** Adiciona ou atualiza conversa na lista (evita duplicar; remove "sem conversa" do mesmo cliente).
   * Ao mesclar com item existente, preserva contato_nome e foto_perfil se o payload não trouxer valor
   * (evita trocar nome/foto por "Conversa" e null em atualizações parciais via socket). */
  addChat: (chat) => {
    if (!chat?.id) return
    let chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(chat.id))
    const existing = idx >= 0 ? chats[idx] : null
    // Preserva unread_count local quando o servidor não envia (ex.: resposta de fetchChatById) — evita zerar badge após nova_mensagem
    const unread =
      chat.unread_count != null || chat.unread != null
        ? Number(chat.unread_count ?? chat.unread) || 0
        : (existing ? Number(existing.unread_count ?? existing.unread) || 0 : 0)
    const merged = { ...chat, unread_count: unread }
    if (chat.cliente_id != null) {
      chats = chats.filter(c => !(c.sem_conversa && String(c.cliente_id) === String(chat.cliente_id)))
    }
    const nomeNorm = (v) => (v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'name' ? String(v).trim() : null)
    const fotoNorm = (v) => (v != null && String(v).trim().startsWith('http') ? String(v).trim() : null)
    const mergedNome = merged.contato_nome != null && merged.contato_nome !== '' ? merged.contato_nome : nomeNorm(merged.chatName) ?? nomeNorm(merged.senderName) ?? null
    const mergedFoto = merged.foto_perfil !== undefined && merged.foto_perfil != null ? merged.foto_perfil : fotoNorm(merged.senderPhoto) ?? fotoNorm(merged.photo) ?? null
    const newIdx = chats.findIndex(c => String(c.id) === String(chat.id))
    if (newIdx >= 0) {
      const next = [...chats]
      const existing = next[newIdx]
      const nomeAtual = (existing.contato_nome || existing.nome || "").trim()
      const nomeNovo = (mergedNome || "").trim()
      const updated = {
        ...existing,
        ...merged,
        contato_nome: nomeAtual && (!nomeNovo || nomeNovo === "Conversa") ? nomeAtual : (mergedNome ?? existing.contato_nome),
        foto_perfil: (existing.foto_perfil && String(existing.foto_perfil).trim()) || mergedFoto || existing.foto_perfil
      }
      next[newIdx] = updated
      set({ chats: sortConversasByRecent(dedupeConversas(next)) })
    } else {
      const newChat = {
        ...merged,
        contato_nome: mergedNome ?? merged.contato_nome ?? undefined,
        foto_perfil: mergedFoto ?? merged.foto_perfil ?? undefined
      }
      set({ chats: sortConversasByRecent(dedupeConversas([newChat, ...chats])) })
    }
  },

  /* =========================================
     🔥 PATCH GENÉRICO (usado pelo socket)
     conversa_atualizada: merge defensivo — nunca sobrescrever com undefined ou string vazio
     ultima_mensagem: usa payload.ultima_mensagem para preview (sem refetch)
  ========================================= */
  updateChat: (partial) => {
    if (!partial?.id) return

    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(partial.id))

    // NUNCA adicionar conversa nova via socket — evita vazamento entre setores
    if (idx === -1) return

    const next = [...chats]
    const cur = next[idx]
    const merged = { ...cur }

    // Merge defensivo: nunca sobrescrever com undefined; strings vazias só em nome/foto (bloqueados abaixo)
    const skipKeys = new Set(["contato_nome", "nome_contato_cache", "foto_perfil"])
    for (const k of Object.keys(partial)) {
      if (k === "id" || skipKeys.has(k)) continue
      if (partial[k] !== undefined) merged[k] = partial[k]
    }

    // Nome/foto: só quando valor válido (preserva nome completo da agenda)
    if (partial.contato_nome != null && String(partial.contato_nome).trim() !== "") {
      merged.contato_nome = partial.contato_nome
      merged.nome_contato_cache = partial.nome_contato_cache ?? partial.contato_nome
    } else if (partial.nome_contato_cache != null && String(partial.nome_contato_cache).trim() !== "") {
      merged.contato_nome = partial.nome_contato_cache
      merged.nome_contato_cache = partial.nome_contato_cache
    }
    if (partial.foto_perfil != null && String(partial.foto_perfil).trim() !== "") {
      merged.foto_perfil = partial.foto_perfil
    }

    // ultima_mensagem: usar para preview na lista (evita refetch)
    if (partial.ultima_mensagem != null) {
      merged.ultima_mensagem = partial.ultima_mensagem
      if (partial.ultima_mensagem?.criado_em) merged.ultima_atividade = partial.ultima_mensagem.criado_em
    }
    if (partial.ultima_atividade != null) merged.ultima_atividade = partial.ultima_atividade
    if (partial.tem_novas_mensagens === true) {
      merged.tem_novas_mensagens = true
      merged.lida = false
    }

    next[idx] = merged
    set({ chats: sortConversasByRecent(next) })
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
      ...(contato_nome != null && String(contato_nome).trim() !== "" && {
        contato_nome,
        nome_contato_cache: contato_nome,
      }),
      ...(foto_perfil !== undefined && foto_perfil != null && String(foto_perfil).trim() !== "" && { foto_perfil }),
    }
    set({ chats: next })
  },

  /** Só preenche nome/foto quando vazio — evita sobrescrever com dados inconsistentes */
  updateChatContatoSeVazio: (conversa_id, { contato_nome, foto_perfil }) => {
    if (conversa_id == null) return
    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(conversa_id))
    if (idx === -1) return
    const cur = chats[idx]
    const patch = {}
    if (contato_nome != null && (!cur?.contato_nome || !String(cur.contato_nome).trim())) patch.contato_nome = contato_nome
    if (foto_perfil != null && (!cur?.foto_perfil || !String(cur.foto_perfil).trim())) patch.foto_perfil = foto_perfil
    if (Object.keys(patch).length === 0) return
    const next = [...chats]
    next[idx] = { ...cur, ...patch }
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
    set((state) => {
      const updated = state.chats.map(c =>
        String(c.id) === String(conversa_id)
          ? {
              ...c,
              ultima_mensagem: msg,
              ultima_atividade: msg?.criado_em || c.ultima_atividade,
            }
          : c
      )
      return { chats: sortConversasByRecent(updated) }
    }),

  /* =========================================
     🔥 ORDENAR (TotalChat behavior)
     sobe conversa quando recebe msg — em um único set() evita "piscar"
  ========================================= */
  bumpChatToTop: (conversa_id) => {
    const chats = get().chats || []
    const idx = chats.findIndex(c => String(c.id) === String(conversa_id))
    if (idx < 0) return
    if (idx === 0) return

    const item = chats[idx]
    const next = [item, ...chats.filter((_, i) => i !== idx)]
    set({ chats: next })
  },

  /** Atualiza ultima_mensagem E move para o topo em uma única operação — evita contato "sumir" */
  setUltimaMensagemEBump: (conversa_id, msg) => {
    set((state) => {
      const chats = state.chats || []
      const idx = chats.findIndex(c => String(c.id) === String(conversa_id))
      if (idx < 0) return state
      const updated = chats.map(c =>
        String(c.id) === String(conversa_id)
          ? {
              ...c,
              ultima_mensagem: msg,
              ultima_atividade: msg?.criado_em || c.ultima_atividade,
            }
          : c
      )
      return { chats: sortConversasByRecent(updated) }
    })
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
