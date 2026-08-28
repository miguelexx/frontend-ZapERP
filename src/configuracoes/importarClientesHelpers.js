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

export function alunosVinculadosPreview(alunos, nomePrincipal) {
  const list = Array.isArray(alunos) ? alunos : []
  const principal = String(nomePrincipal || "").replace(/\s+/g, " ").trim().toLowerCase()
  const seen = new Set()
  const out = []
  for (const aluno of list) {
    const nome = String(aluno?.nome || "").replace(/\s+/g, " ").trim()
    if (!nome) continue
    const key = nome.toLowerCase()
    if (principal && key === principal) continue
    if (seen.has(key)) continue
    seen.add(key)
    const serie = String(aluno?.serie || "").trim()
    out.push({ nome, serie: serie || null })
  }
  return out
}

export function deveExibirSwitchVincularAlunos(preview) {
  const stats = preview?.stats || {}
  const conflicts = Array.isArray(preview?.conflicts) ? preview.conflicts.length : 0
  return Number(stats.telefonesCompartilhados || stats.conflitos || conflicts) > 0
}

export function labelAlunoVinculado(aluno) {
  const nome = String(aluno?.nome || "").trim()
  const serie = String(aluno?.serie || "").trim()
  if (!nome) return ""
  return serie ? `${nome} — ${serie}` : nome
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
    nomesVinculados: r.nomesVinculados ?? 0,
    nomesVinculadosAtualizados: r.nomesVinculadosAtualizados ?? 0,
  }
}
