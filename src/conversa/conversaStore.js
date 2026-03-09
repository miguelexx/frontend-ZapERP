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

      // Backend: quando assumida por outro atendente, mensagens vêm vazias e mensagens_bloqueadas=true
      const mensagens_bloqueadas = data?.mensagens_bloqueadas ?? conversa?.mensagens_bloqueadas ?? false
      const atendente_nome = data?.atendente_nome ?? conversa?.atendente_nome ?? null
      if (conversa) {
        conversa = { ...conversa, mensagens_bloqueadas, atendente_nome }
      }

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

      let conversa = data?.conversa ? data.conversa : (data ?? null)
      let mensagens = data?.mensagens ?? conversa?.mensagens ?? []
      const tags = data?.tags ?? conversa?.tags ?? []

      // Backend: quando assumida por outro atendente, mensagens vêm vazias e mensagens_bloqueadas=true
      const mensagens_bloqueadas = data?.mensagens_bloqueadas ?? conversa?.mensagens_bloqueadas ?? false
      const atendente_nome = data?.atendente_nome ?? conversa?.atendente_nome ?? null
      if (conversa) {
        conversa = { ...conversa, mensagens_bloqueadas, atendente_nome }
      }

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
    const { selectedId, cursor, hasMore, loadingMore, conversa } = get()
    if (!selectedId || !hasMore || !cursor || loadingMore) return
    if (conversa?.mensagens_bloqueadas) return

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
     MENSAGENS — UPSERT (dedupe + merge)
     Nunca append cego: verifica id OU (conversa_id + whatsapp_id).
     Após qualquer upsert: SEMPRE ordenar por criado_em ASC = última posição.
  ===================================================== */
  _sortMensagensByCriadoEmAsc: (arr) =>
    [...arr].sort((a, b) =>
      new Date(a.criado_em || 0) - new Date(b.criado_em || 0) ||
      (Number(a.id) - Number(b.id)) ||
      String(a.tempId || "").localeCompare(String(b.tempId || ""))
    ),

  anexarMensagem: (msg) => {
    const conversaId = msg?.conversa_id ?? get().conversa?.id
    if (!conversaId) return
    const key = msg?.whatsapp_id ?? msg?.id ?? msg?.tempId
    if (!key) return
    set((state) => {
      const list = state.mensagens || []
      const convId = state.conversa?.id ?? conversaId

      // UPSERT: por id OU por (conversa_id + whatsapp_id) — evita "aparecer e sumir"
      const findExisting = () => {
        if (msg.id) {
          const byId = list.findIndex((m) => String(m.id) === String(msg.id))
          if (byId >= 0) return byId
        }
        const waId = msg.whatsapp_id || null
        if (waId && convId) {
          const byWa = list.findIndex((m) => (m.conversa_id == null || String(m.conversa_id) === String(convId)) && String(m.whatsapp_id || "") === String(waId))
          if (byWa >= 0) return byWa
        }
        if (msg.tempId) {
          const byTemp = list.findIndex((m) => String(m.tempId) === String(msg.tempId))
          if (byTemp >= 0) return byTemp
        }
        return -1
      }

      const existingIdx = findExisting()
      if (existingIdx >= 0) {
        // MERGE: atualizar campos (status, whatsapp_id, id se faltando)
        const existing = list[existingIdx]
        const merged = { ...existing, ...msg }
        if (convId) merged.conversa_id = convId
        if (msg.id && !existing.id) merged.id = msg.id
        if (msg.whatsapp_id && !existing.whatsapp_id) merged.whatsapp_id = msg.whatsapp_id
        if (msg.status != null) merged.status = msg.status
        if (msg.status_mensagem != null) merged.status_mensagem = msg.status_mensagem
        const next = [...list]
        next[existingIdx] = merged
        return { mensagens: get()._sortMensagensByCriadoEmAsc(next) }
      }

      // Reconciliação: socket nova_mensagem fromMe → SUBSTITUIR temp otimista, NUNCA duplicar
      // Funciona com whatsapp_id OU id (backend pode enviar um ou outro)
      const isFromMe = msg?.direcao === "out" || msg?.fromMe
      const textoIn = (msg.texto || msg.conteudo || "").toString().trim()
      const recentMs = 90_000
      const now = Date.now()

      if (isFromMe) {
        let replaceIdx = -1
        // 1) Procurar temp otimista (tempId, direcao out, recente)
        for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i]
          if (m?.tempId && m?.direcao === "out") {
            const ts = new Date(m?.criado_em || 0).getTime()
            if (now - ts < recentMs) {
              const textoMatch = !textoIn || (m.texto || m.conteudo || "").toString().trim() === textoIn
              if (textoMatch) {
                replaceIdx = i
                break
              }
            }
          }
        }
        // 2) Procurar msg out recente sem id (optimistic) ou sem whatsapp_id — mesma mensagem
        if (replaceIdx < 0) {
          for (let i = list.length - 1; i >= 0; i--) {
            const m = list[i]
            if (m?.direcao !== "out") continue
            const ts = new Date(m?.criado_em || 0).getTime()
            if (now - ts > recentMs) break
            const textoMatch = !textoIn || (m.texto || m.conteudo || "").toString().trim() === textoIn
            if (!textoMatch) continue
            // Temp sem id real, ou msg com id mas sem whatsapp_id
            if ((m.tempId || !m.id) || (m.id && !m.whatsapp_id && msg.whatsapp_id)) {
              replaceIdx = i
              break
            }
          }
        }
        if (replaceIdx >= 0) {
          const existing = list[replaceIdx]
          const merged = { ...existing, ...msg, conversa_id: convId }
          if (msg.id) merged.id = msg.id
          if (msg.whatsapp_id) merged.whatsapp_id = msg.whatsapp_id
          if (msg.status != null) merged.status = msg.status
          if (msg.status_mensagem != null) merged.status_mensagem = msg.status_mensagem
          const tsExisting = new Date(existing?.criado_em || 0).getTime()
          const tsMsg = new Date(msg?.criado_em || 0).getTime()
          if (tsExisting > tsMsg || !msg.criado_em) merged.criado_em = existing.criado_em
          const next = [...list]
          next[replaceIdx] = merged
          return { mensagens: get()._sortMensagensByCriadoEmAsc(next) }
        }
      }

      // Cenário 3: API chegou depois do socket (reconciliarMensagem chama anexarMensagem)
      // Socket já substituiu temp; realMsg tem id da API mas nossa msg tem whatsapp_id sem id
      // Procurar msg "out" recente com whatsapp_id mas sem id → merge id + reply_meta da API
      const isFromMeAlt = msg?.direcao === "out" || msg?.fromMe
      if (msg.id && isFromMeAlt) {
        const now = Date.now()
        const recentMs = 90_000
        const textoIn = (msg.texto || msg.conteudo || "").toString().trim()
        for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i]
          if (m?.direcao !== "out") continue
          if (m?.tempId) continue
          const ts = new Date(m?.criado_em || 0).getTime()
          if (now - ts > recentMs) break
          const textoMatch = !textoIn || (m.texto || m.conteudo || "").toString().trim() === textoIn
          if (m.whatsapp_id && !m.id && textoMatch) {
            const merged = { ...m, ...msg, conversa_id: convId }
            // Preservar status mais avançado: socket pode ter "sent" enquanto API retorna "pending"
            const order = { pending: 0, sent: 1, delivered: 2, read: 3, played: 4 }
            const mVal = order[String(m?.status_mensagem || m?.status || "").toLowerCase()] ?? 0
            const msgVal = order[String(msg?.status_mensagem || msg?.status || "").toLowerCase()] ?? 0
            if (mVal > msgVal) {
              merged.status = m.status
              merged.status_mensagem = m.status_mensagem
            }
            const next = [...list]
            next[i] = merged
            return { mensagens: get()._sortMensagensByCriadoEmAsc(next) }
          }
        }
      }

      // Nova mensagem: adicionar com dedupe por Map
      const byId = new Map()
      list.forEach((m) => {
        const k = m.whatsapp_id ? `wa-${m.whatsapp_id}` : m.id ? String(m.id) : m.tempId ? `temp-${m.tempId}` : null
        if (k) byId.set(k, m)
      })
      const newMsg = { ...msg }
      if (convId) newMsg.conversa_id = convId
      const newK = msg.whatsapp_id ? `wa-${msg.whatsapp_id}` : msg.id ? String(msg.id) : `temp-${msg.tempId}`
      byId.set(newK, newMsg)
      return { mensagens: get()._sortMensagensByCriadoEmAsc(Array.from(byId.values())) }
    })
  },

  /** Substitui mensagem temp (optimistic) pela real quando API retorna.
   * Se temp não existir (socket chegou primeiro), faz merge via anexarMensagem. */
  reconciliarMensagem: (tempId, realMsg) => {
    if (!tempId || !realMsg) return
    let replaced = false
    set((state) => {
      const list = state.mensagens || []
      const idx = list.findIndex((m) => String(m.tempId) === String(tempId))
      if (idx >= 0) {
        replaced = true
        const next = [...list]
        next[idx] = { ...realMsg, conversa_id: state.conversa?.id }
        return { mensagens: get()._sortMensagensByCriadoEmAsc(next) }
      }
      return state
    })
    if (!replaced) {
      get().anexarMensagem(realMsg)
    }
  },

  /** Atualiza mensagem(ns) por id, whatsapp_id ou tempId.
   * status_mensagem: atualiza TODAS as mensagens que correspondam a mensagem_id OU whatsapp_id na conversa. */
  patchMensagem: (mensagemId, partial, opts = {}) => {
    const hasIdentifier = (mensagemId != null && mensagemId !== "") || partial?.whatsapp_id || partial?.tempId
    const hasStatus = partial?.status_mensagem != null || partial?.status != null
    if (!hasIdentifier && !hasStatus) return
    if (!partial || (Object.keys(partial).length === 0)) return
    const { whatsapp_id: optsWhatsappId } = opts
    set((state) => {
      const list = state.mensagens || []
      // Sempre filtra pela conversa SELECIONADA — conversa_id do payload pode vir em formato diferente
      const convId = state.conversa?.id ?? state.selectedId
      const waId = optsWhatsappId ?? partial?.whatsapp_id

      // Índices de TODAS as mensagens que correspondem: mensagem_id OU whatsapp_id na mesma conversa
      // Inclui mensagens sem conversa_id (optimistic) — lista é sempre da conversa selecionada
      const indices = new Set()
      list.forEach((m, i) => {
        if (convId && m.conversa_id != null && String(m.conversa_id) !== String(convId)) return
        if (mensagemId != null && mensagemId !== "" && String(m.id) === String(mensagemId)) indices.add(i)
        else if (waId && String(m.whatsapp_id) === String(waId)) indices.add(i)
        else if (partial?.tempId && String(m.tempId) === String(partial.tempId)) indices.add(i)
      })

      // Fallback: status_mensagem pode chegar antes de nova_mensagem ou sem identificadores
      // Atualiza última msg "out" recente (últimos 60s)
      if (indices.size === 0 && hasStatus && convId && list.length > 0) {
        const now = Date.now()
        const recentMs = 60_000
        let fallbackIdx = -1
        for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i]
          if (m?.direcao !== "out") continue
          const ts = new Date(m?.criado_em || 0).getTime()
          if (now - ts > recentMs) break
          // Match: tem id/whatsapp_id OU é a última out recente (tempId ou id)
          const hasMatch = (waId && String(m.whatsapp_id) === String(waId)) ||
            (mensagemId && String(m.id) === String(mensagemId))
          if (hasMatch || !m.whatsapp_id) {
            fallbackIdx = i
            break
          }
        }
        if (fallbackIdx >= 0) indices.add(fallbackIdx)
      }

      if (indices.size === 0) return state
      const next = [...list]
      indices.forEach((i) => {
        next[i] = { ...next[i], ...partial }
      })
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
    const fixedFields = ["contato_nome", "nome_contato_cache", "cliente_nome", "telefone", "telefone_exibivel", "cliente_telefone", "nome_grupo", "foto_perfil"]
    const preserveBlocked = ["mensagens_bloqueadas", "atendente_nome"]
    set((state) => {
      if (!state.conversa || String(state.conversa.id) !== String(partial.id))
        return state
      const cur = state.conversa
      const merged = { ...cur, ...partial }
      for (const k of preserveBlocked) {
        if (merged[k] === undefined && cur[k] !== undefined) merged[k] = cur[k]
      }
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
