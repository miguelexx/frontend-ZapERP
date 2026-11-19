/**
 * Ranking gamificado — funções puras de apresentação (testadas em
 * scripts/test-ranking-gamificado.mjs). Sem React, sem store, sem rede.
 */

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Janela em que um campeão recém-anunciado ainda é celebrado para quem não estava online. */
export const JANELA_CELEBRACAO_MS = 3 * 24 * 60 * 60 * 1000;

const MEDALHAS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function medalhaDaPosicao(posicao) {
  return MEDALHAS[Number(posicao)] || null;
}

/** Quebra o tempo restante para a contagem regressiva. */
export function partesTempoRestante(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  return {
    encerrado: total <= 0,
    dias: Math.floor(total / 86400),
    horas: Math.floor((total % 86400) / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  };
}

/** "2d 5h 12min" · "5h 12min" · "12min 08s" · "encerrando…" */
export function formatarTempoRestante(ms) {
  const p = partesTempoRestante(ms);
  if (p.encerrado) return "apurando resultado…";
  if (p.dias > 0) return `${p.dias}d ${p.horas}h ${p.minutos}min`;
  if (p.horas > 0) return `${p.horas}h ${String(p.minutos).padStart(2, "0")}min`;
  return `${p.minutos}min ${String(p.segundos).padStart(2, "0")}s`;
}

function tzSeguro(timezone) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    return "America/Sao_Paulo";
  }
}

/** "sex., 20/11 às 18:00" no fuso da competição. */
export function formatarDataHora(iso, timezone = "America/Sao_Paulo") {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  const tz = tzSeguro(timezone);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${dia} às ${hora}`;
}

/** "16/11 – 20/11/2026" (data local do fim é a data da premiação). */
export function formatarPeriodo(inicioIso, fimIso, timezone = "America/Sao_Paulo") {
  const tz = tzSeguro(timezone);
  const fmt = (iso, ano) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      ...(ano ? { year: "numeric" } : {}),
    }).format(new Date(iso));
  if (!inicioIso || !fimIso) return "—";
  return `${fmt(inicioIso, false)} – ${fmt(fimIso, true)}`;
}

/** "João", "João e Maria", "Ana, João e Maria". */
export function juntarNomes(nomes) {
  const lista = (nomes || []).map((n) => String(n || "").trim()).filter(Boolean);
  if (lista.length <= 1) return lista[0] || "";
  return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}

export function rotuloAtendimentos(total) {
  const n = Number(total) || 0;
  return `${n} ${n === 1 ? "atendimento" : "atendimentos"}`;
}

/** Texto do anúncio. Empate = todos reconhecidos, sem desempate. */
export function mensagemCampeao(ciclo) {
  const vencedores = Array.isArray(ciclo?.vencedores) ? ciclo.vencedores : [];
  if (vencedores.length === 0) return null;
  const nomes = juntarNomes(vencedores.map((v) => v.nome));
  const empate = vencedores.length > 1;
  return {
    titulo: empate ? "Temos campeões!" : "Temos um campeão!",
    destaque: empate
      ? `${nomes} dividiram o 1º lugar nesta semana!`
      : `${nomes} conquistou o 1º lugar nesta semana!`,
    total: empate
      ? `Foram ${rotuloAtendimentos(ciclo.total_vencedor)} cada.`
      : `Foram ${rotuloAtendimentos(ciclo.total_vencedor)} realizados.`,
  };
}

/**
 * Celebrar este ciclo para este usuário? Só se tem vencedor, foi encerrado há pouco
 * e ainda não foi mostrado neste navegador (o servidor anuncia uma única vez; aqui
 * garantimos que cada pessoa vê uma única vez, mesmo se estava offline no anúncio).
 */
export function deveCelebrar(ciclo, ultimoVistoId, agoraMs = Date.now(), janelaMs = JANELA_CELEBRACAO_MS) {
  if (!ciclo || ciclo.status !== "encerrado") return false;
  if (!Array.isArray(ciclo.vencedores) || ciclo.vencedores.length === 0) return false;
  const id = Number(ciclo.id);
  if (!Number.isFinite(id) || id <= (Number(ultimoVistoId) || 0)) return false;
  const encerradoMs = new Date(ciclo.encerrado_em || ciclo.fim).getTime();
  if (!Number.isFinite(encerradoMs)) return false;
  return agoraMs - encerradoMs <= janelaMs;
}

export function chaveCelebracaoVista(user) {
  return `zaperp_ranking_celebrado:${user?.company_id ?? "x"}:${user?.id ?? "x"}`;
}

export function lerCelebracaoVista(user) {
  try {
    return Number(localStorage.getItem(chaveCelebracaoVista(user))) || 0;
  } catch {
    return 0;
  }
}

export function marcarCelebracaoVista(user, cicloId) {
  try {
    const atual = lerCelebracaoVista(user);
    if (Number(cicloId) > atual) localStorage.setItem(chaveCelebracaoVista(user), String(Number(cicloId)));
  } catch {
    /* storage bloqueado: no pior caso a celebração aparece de novo */
  }
}
