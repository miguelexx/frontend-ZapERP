import api from "../api/http"

/** Normaliza resposta de PATCH /chats/:id/prefs para o formato da lista (`silenciado`, etc.). */
export function mergePrefsFromPatchResponse(data) {
  if (!data || typeof data !== "object") return {}
  const d = data
  const out = {}
  if (d.silenciada !== undefined) out.silenciado = !!d.silenciada
  else if (d.silenciado !== undefined) out.silenciado = !!d.silenciado
  if (d.fixada !== undefined) out.fixada = !!d.fixada
  if (d.favorita !== undefined) out.favorita = !!d.favorita
  if (d.fixada_em !== undefined) out.fixada_em = d.fixada_em
  return out
}

async function patchConversationPrefs(conversaId, partialPrefs) {
  const { data } = await api.patch(`/chats/${conversaId}/prefs`, partialPrefs)
  return data || {}
}

export async function toggleMuteConversation(conversaId, silenciada) {
  return patchConversationPrefs(conversaId, { silenciada: !!silenciada })
}

export async function togglePinConversation(conversaId, fixada) {
  return patchConversationPrefs(conversaId, { fixada: !!fixada })
}

export async function toggleFavoriteConversation(conversaId, favorita) {
  return patchConversationPrefs(conversaId, { favorita: !!favorita })
}

export async function clearConversation(conversaId) {
  const { data } = await api.post(`/chats/${conversaId}/limpar-mensagens`)
  return data || {}
}

export async function deleteConversation(conversaId) {
  const { data } = await api.delete(`/chats/${conversaId}`)
  return data || {}
}

/**
 * O que aconteceu no WhatsApp do celular ao apagar a conversa (resposta de DELETE /chats/:id).
 * Antes a tela dizia "apagada" sempre — inclusive quando o celular manteve o chat, e o
 * atendente só descobria abrindo o WhatsApp.
 *
 * @returns {{ ok: boolean, aviso: string|null }} `aviso` = texto para o usuário quando NÃO saiu
 * do celular (null quando saiu, ou quando o backend é antigo e não informa).
 */
export function resultadoExclusaoNoWhatsapp(resp) {
  const r = resp && typeof resp === "object" ? resp : {}
  if (r.whatsapp_apagado === true) return { ok: true, aviso: null }
  const motivo = String(r.whatsapp_motivo || "")
  switch (motivo) {
    case "":
    case "chat_nao_existe_no_whatsapp":
      // Backend antigo (sem campo) ou o chat já não estava no celular: nada a avisar.
      return { ok: true, aviso: null }
    case "residuo_arquivado_no_whatsapp":
      return {
        ok: false,
        aviso: "O WhatsApp do celular manteve parte do histórico antigo desta conversa. Ela foi movida para \"Arquivadas\" no celular.",
      }
    case "residuo_no_whatsapp":
      return { ok: false, aviso: "O WhatsApp do celular manteve esta conversa na lista. Apague-a por lá, se precisar." }
    case "provedor_recusou":
    case "erro_de_conexao":
      return {
        ok: false,
        aviso: "Não foi possível apagar no WhatsApp do celular agora (verifique se o número está conectado). A conversa continua lá.",
      }
    case "conversa_por_lid":
    case "conversa_sem_telefone":
      return { ok: false, aviso: "Não foi possível identificar o número desta conversa no WhatsApp. Ela continua no celular." }
    default:
      return { ok: false, aviso: "A conversa não foi apagada no WhatsApp do celular." }
  }
}

/*
 * Estado de bloqueio CONHECIDO (A3-12). O backend não guarda nem devolve o bloqueio na linha
 * da conversa (a blacklist do WhatsApp é a fonte de verdade) — só o `bloqueado` na resposta
 * do POST /bloquear. O menu mostrava "Bloquear" e "Desbloquear" juntos; agora mostra só a
 * ação que faz sentido. Fica fora do store para sobreviver ao recarregamento da lista, que
 * traz as linhas sem esse campo.
 *
 * Também no localStorage deste navegador (revisão A3-12, 27/11/2026): só em memória, um F5
 * (ou deploy/reinício) apagava o que se sabia e quem foi bloqueado aqui ontem voltava a
 * mostrar só "Bloquear" — sem caminho direto para desbloquear. Continua sendo só uma pista
 * deste navegador: bloqueio feito pelo celular ou em outro aparelho segue desconhecido.
 * Erro de storage (aba anônima, cota) não quebra nada: cai para a memória.
 */
const BLOCK_STATE_STORAGE_KEY = "zaperp.contatoBloqueado.v1"
const BLOCK_STATE_MAX = 300
let knownBlockState = null

function blockStateMap() {
  if (knownBlockState) return knownBlockState
  knownBlockState = new Map()
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(BLOCK_STATE_STORAGE_KEY) : null
    // Lista de pares [id, bloqueado] (não objeto: chaves numéricas perderiam a ordem de idade).
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      for (const par of parsed) {
        if (Array.isArray(par) && par[0] != null && typeof par[1] === "boolean") knownBlockState.set(String(par[0]), par[1])
      }
    }
  } catch {
    /* storage indisponível ou corrompido: só memória */
  }
  return knownBlockState
}

export function rememberContactBlockState(conversaId, bloqueado) {
  if (conversaId == null) return
  const map = blockStateMap()
  const id = String(conversaId)
  // Reinsere no fim: a ordem do Map é a idade, e o corte abaixo descarta as mais antigas.
  map.delete(id)
  map.set(id, bloqueado === true)
  while (map.size > BLOCK_STATE_MAX) map.delete(map.keys().next().value)
  try {
    localStorage.setItem(BLOCK_STATE_STORAGE_KEY, JSON.stringify([...map]))
  } catch {
    /* sem storage: vale só nesta aba */
  }
}

/**
 * true/false quando o estado é conhecido (campo `bloqueado` do backend, se um dia vier na
 * linha, ou o resultado do último bloquear/desbloquear feito neste navegador); null quando
 * não se sabe.
 */
export function getKnownContactBlockState(chat) {
  if (!chat) return null
  if (typeof chat.bloqueado === "boolean") return chat.bloqueado
  const id = chat.id != null ? String(chat.id) : ""
  if (!id) return null
  const map = blockStateMap()
  return map.has(id) ? map.get(id) : null
}

/** Bloqueia/desbloqueia o contato no WhatsApp (opt-out real). Só Whapi suporta. */
export async function toggleBlockContact(conversaId, bloquear) {
  const { data } = await api.post(`/chats/${conversaId}/bloquear`, { bloquear: !!bloquear })
  return data || {}
}
