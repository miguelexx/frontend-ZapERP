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

/** Bloqueia/desbloqueia o contato no WhatsApp (opt-out real). Só Whapi suporta. */
export async function toggleBlockContact(conversaId, bloquear) {
  const { data } = await api.post(`/chats/${conversaId}/bloquear`, { bloquear: !!bloquear })
  return data || {}
}
