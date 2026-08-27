/**
 * Helpers puros de acesso por departamento/setor.
 *
 * Extraídos de ConversaView.jsx (não dependem de estado React). Usados no
 * cálculo de elegibilidade (auto-assumir / podeEnviar) — mantêm exatamente a
 * mesma normalização de IDs de departamento que estava inline.
 */

export function normalizeDepartamentoIdForAccess(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value).trim();
}

export function getUserDepartamentoIdSet(user) {
  const ids = [];
  if (Array.isArray(user?.departamento_ids)) ids.push(...user.departamento_ids);
  if (user?.departamento_id != null) ids.push(user.departamento_id);
  if (Array.isArray(user?.departamentos)) {
    for (const dep of user.departamentos) {
      ids.push(dep?.id ?? dep?.departamento_id ?? dep);
    }
  }

  const set = new Set();
  for (const id of ids) {
    const normalized = normalizeDepartamentoIdForAccess(id);
    if (normalized) set.add(normalized);
  }
  return set;
}
