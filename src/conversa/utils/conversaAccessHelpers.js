/**
 * Helpers puros de acesso por departamento/setor.
 *
 * Extraídos de ConversaView.jsx (não dependem de estado React). Usados no
 * cálculo de elegibilidade (auto-assumir / podeEnviar) — mantêm exatamente a
 * mesma normalização de IDs de departamento que estava inline.
 */

import { isGroupConversation } from "../../utils/conversaUtils";

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

/** Admin da empresa — vê todas as conversas, independente do setor. */
export function isEmpresaAdminUser(user) {
  const r = String(user?.role || user?.perfil || "").toLowerCase();
  return r === "admin" || r === "administrador";
}

/**
 * Mesma regra do GET /chats e da visibilidade Socket: admin vê tudo;
 * conversa assumida pelo usuário permanece; sem setor → todos;
 * com setor → só quem pertence ao departamento.
 * Grupos ficam de fora (política própria no GET).
 */
export function viewerCanSeeConversationRow(row, user) {
  if (!row) return false;
  if (!user) return true;
  if (isEmpresaAdminUser(user)) return true;
  if (isGroupConversation(row)) return true;
  const myId = user?.id;
  const atendenteId = row.atendente_id ?? row.responsavel_id ?? null;
  if (myId != null && atendenteId != null && String(atendenteId) === String(myId)) return true;
  const convDep = normalizeDepartamentoIdForAccess(row.departamento_id ?? row.departamento?.id);
  if (!convDep) return true;
  return getUserDepartamentoIdSet(user).has(convDep);
}
