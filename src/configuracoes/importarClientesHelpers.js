/**
 * Regras puras da UI de importação de clientes por planilha.
 */

export function mapeamentoIncompleto(mapping) {
  return mapping == null || mapping.nome == null || mapping.telefone == null
}

export function confirmacaoDesabilitada({ mapping, loading, confirmando, telefonesUnicos }) {
  return Boolean(
    loading ||
    confirmando ||
    mapeamentoIncompleto(mapping) ||
    !Number(telefonesUnicos)
  )
}

export function nomesPrincipaisIniciais(conflicts) {
  const out = {}
  for (const c of Array.isArray(conflicts) ? conflicts : []) {
    const key = c.phoneKey || c.telefone
    if (key && c.nome) out[key] = c.nome
  }
  return out
}

export function resumoImportacao(resumo) {
  const r = resumo || {}
  return {
    linhas: r.totalLinhas ?? 0,
    criados: r.clientesCriados ?? r.clientesImportados ?? 0,
    atualizados: r.clientesAtualizados ?? 0,
    jaExistentes: r.clientesJaExistentes ?? 0,
    nomesAlterados: r.nomesAlterados ?? 0,
    nomesProtegidos: r.nomesProtegidos ?? 0,
    nomesManuaisPreservados: r.nomesManuaisPreservados ?? 0,
    ignoradas: r.linhasIgnoradas ?? 0,
    conflitos: r.conflitos ?? 0,
    falhas: r.falhas ?? 0,
    telefonesUnicos: r.telefonesUnicos ?? 0,
  }
}
