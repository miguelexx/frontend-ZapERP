/**
 * Regras puras do modal de Atendentes (sem React) — testadas em
 * scripts/test-atendentes-regras.mjs. Espelham o backend
 * (controllers/chat/attendanceController.js).
 */

/** Mesmo teto do backend: 1 principal + 3 co-atendentes. */
export const MAX_CO_ATENDENTES = 3;

const PERFIL_LABEL = {
  admin: "Administrador",
  supervisor: "Supervisor",
  atendente: "Atendente",
};

export function initials(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Busca sem acento e sem caixa: "gabriela" acha "Gabriéla". */
export function normalizarBusca(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function perfilLabel(perfil) {
  const k = String(perfil || "").toLowerCase();
  return PERFIL_LABEL[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
}

/**
 * Quem pode o quê:
 * - incluir terceiros: admin/supervisor, o responsável ou um co-atendente ativo;
 *   os demais só podem incluir a si mesmos ("Participar");
 * - remover: admin/supervisor, o responsável, quem incluiu a pessoa, ou ela própria (sair);
 * - sem responsável: ninguém entra até alguém assumir;
 * - encerrada: somente leitura.
 */
export function calcularPermissoes({ participantes = [], meuUsuarioId, meuPerfil, encerrada, podeAdicionar }) {
  const me = meuUsuarioId != null && meuUsuarioId !== "" && Number.isFinite(Number(meuUsuarioId))
    ? Number(meuUsuarioId)
    : null;
  const perfil = String(meuPerfil || "").toLowerCase();
  const gestor = perfil === "admin" || perfil === "supervisor";
  const principal = participantes.find((p) => p.tipo === "principal") ?? null;
  const coAtendentes = participantes.filter((p) => p.tipo === "participante");
  const souPrincipal = me != null && principal != null && Number(principal.usuario_id) === me;
  const souCo = me != null && coAtendentes.some((p) => Number(p.usuario_id) === me);
  const limiteAtingido = coAtendentes.length >= MAX_CO_ATENDENTES;

  const podeEditar = !!podeAdicionar && !encerrada;
  const podeIncluirOutros = podeEditar && !!principal && (gestor || souPrincipal || souCo);
  const podeParticipar = podeEditar && !!principal && !souPrincipal && !souCo;

  const podeRemover = (p) => {
    if (!p || encerrada || p.tipo !== "participante") return false;
    if (gestor || souPrincipal) return true;
    if (me == null) return false;
    if (Number(p.usuario_id) === me) return true;
    const addPor = p.adicionado_por_usuario?.id;
    return addPor != null && Number(addPor) === me;
  };

  return {
    me,
    gestor,
    principal,
    coAtendentes,
    souPrincipal,
    souCo,
    limiteAtingido,
    podeEditar,
    podeIncluirOutros,
    podeParticipar,
    podeRemover,
  };
}

/** Disponíveis que aparecem para adicionar (sem quem já participa; só eu se não posso incluir outros). */
export function filtrarDisponiveis(disponiveis, { participantesIds, busca, podeIncluirOutros, me }) {
  const q = normalizarBusca(busca);
  return (disponiveis || []).filter((u) => {
    const uid = Number(u.id ?? u.usuario_id);
    if (participantesIds.has(uid)) return false;
    if (!podeIncluirOutros && uid !== me) return false;
    if (!q) return true;
    return normalizarBusca(u.nome).includes(q) || normalizarBusca(u.email).includes(q);
  });
}
