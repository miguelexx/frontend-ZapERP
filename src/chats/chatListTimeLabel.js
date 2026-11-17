import {
  companyDayKey,
  formatDiaCurtoEmpresa,
  formatHoraEmpresa,
  getCompanyFormatter,
} from "../utils/companyTimezone";

/*
 * Rótulo de hora do card da lista, igual ao WhatsApp:
 *   hoje           → "14:05"
 *   ontem          → "Ontem"
 *   2 a 6 dias     → dia da semana curto ("Seg", "Ter", …)
 *   mais antigo    → data curta ("03/11")
 *
 * "Hoje"/"ontem" são decididos pelo DIA CIVIL NO FUSO DA EMPRESA (`companyDayKey`), nunca
 * pelo fuso do aparelho nem por um fuso cravado — perto da meia-noite os dois discordam.
 * Nada aqui faz aritmética de horas: a diferença de dias sai das chaves AAAA-MM-DD.
 */

const WEEKDAY_OPTS = { weekday: "short" };

function dayKeyToUtcMs(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Dias civis (fuso da empresa) entre `date` e `now`. 0 = hoje, 1 = ontem. null se inválido. */
export function companyDaysAgo(date, now = new Date()) {
  const a = dayKeyToUtcMs(companyDayKey(date));
  const b = dayKeyToUtcMs(companyDayKey(now));
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

function formatWeekdayCurto(date) {
  const fmt = getCompanyFormatter(WEEKDAY_OPTS);
  if (!fmt) return "";
  try {
    // pt-BR devolve "seg." — sem o ponto e com maiúscula, como o WhatsApp.
    const s = String(fmt.format(date) || "").replace(/\.$/, "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  } catch {
    return "";
  }
}

/**
 * @param {Date} date  momento da última mensagem
 * @param {Date} [now] relógio de referência (testes)
 */
export function formatChatListTimeLabel(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const dias = companyDaysAgo(date, now);
  // Futuro (relógio do aparelho atrasado) ou chave indisponível: mostra a hora.
  if (dias == null || dias <= 0) return formatHoraEmpresa(date);
  if (dias === 1) return "Ontem";
  if (dias < 7) return formatWeekdayCurto(date) || formatDiaCurtoEmpresa(date);
  return formatDiaCurtoEmpresa(date);
}
