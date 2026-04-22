/**
 * Helper: detecta se a conversa é de grupo.
 * Regras: remoteJid termina com "@g.us", ou isGroup === true, ou tipo === "grupo".
 *
 * @param {object} conversa - Objeto conversa (pode ter telefone, remoteJid, tipo, is_group)
 * @returns {boolean}
 */
export function isGroupConversation(conversa) {
  if (!conversa) return false
  const jid = conversa.remoteJid ?? conversa.telefone ?? conversa.phone ?? ''
  if (String(jid).endsWith('@g.us')) return true
  if (conversa.is_group === true || conversa.isGroup === true) return true
  const tipo = String(conversa.tipo || '').toLowerCase()
  if (tipo === 'grupo' || tipo === 'group') return true
  return false
}

/**
 * Status efetivo para UI e regras: no detalhe a API pode expor `status_atendimento_real` como fonte de verdade.
 * Na listagem costuma vir `status_atendimento` alinhado ao backend.
 * @param {object} [conversa]
 * @returns {string} valor normalizado (snake_case lower)
 */
export function getStatusAtendimentoEffective(conversa) {
  if (!conversa || typeof conversa !== 'object') return ''
  const raw = conversa.status_atendimento_real ?? conversa.status_atendimento
  return raw != null ? String(raw).toLowerCase().trim().replace(/\s+/g, '_') : ''
}

/** Modo manual: não inferir por `aguardando_cliente_desde` (job automático em em_atendimento). */
export function isAguardandoClienteManual(conversa) {
  return getStatusAtendimentoEffective(conversa) === 'aguardando_cliente'
}
