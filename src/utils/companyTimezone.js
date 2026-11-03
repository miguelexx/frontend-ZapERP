// Fuso horário da empresa — fonte única do lado do cliente.
//
// Todo horário exibido no atendimento (lista de conversas, thread, busca, visto por
// último, chat interno) é formatado NO FUSO DA EMPRESA, não no fuso do aparelho e não
// mais no "America/Sao_Paulo" que estava cravado no código. Uma empresa de Mato Grosso
// (America/Cuiaba, uma hora atrás de Brasília) via toda mensagem uma hora adiantada.
//
// O valor vem de GET /config/empresa (campo `timezone`, gravado em
// ia_config.chatbot_triage pelo seletor de estado em Configurações → Geral) e é guardado
// em localStorage para já estar certo na PRIMEIRA pintura do próximo carregamento —
// antes de a requisição voltar. Sem isso a lista nasceria no fuso errado e se corrigiria
// depois, piscando.
//
// Nada aqui faz aritmética de horas: só zonas IANA via Intl, para que mudanças de
// horário de verão continuem corretas sozinhas.

import { DEFAULT_TIMEZONE } from "../ia/shared/brazilTimezones";

const STORAGE_KEY = "zaperp.company_timezone";

/** true se o runtime (ICU) conhece a zona. Zona inválida quebraria todo formatador. */
export function isUsableTimezone(tz) {
  const v = String(tz || "").trim();
  if (!v) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isUsableTimezone(v) ? v : "";
  } catch {
    return "";
  }
}

let currentTimezone = readStored() || DEFAULT_TIMEZONE;
let version = 0;
const listeners = new Set();
const formatterCache = new Map();

/** Fuso em vigor (nunca vazio, nunca inválido). */
export function getCompanyTimezone() {
  return currentTimezone;
}

/**
 * Contador que muda sempre que o fuso muda. Serve de prop/dependência para componentes
 * memoizados reformatarem o que já está na tela.
 */
export function getCompanyTimezoneVersion() {
  return version;
}

/**
 * Define o fuso da empresa. Ignora valores vazios ou desconhecidos pelo runtime (assim
 * uma resposta incompleta do backend nunca derruba a formatação) e não faz nada quando o
 * valor é o mesmo — a lista de conversas não precisa repintar à toa.
 * @returns {boolean} true se o fuso mudou
 */
export function setCompanyTimezone(tz) {
  const v = String(tz || "").trim();
  if (!v || !isUsableTimezone(v)) return false;
  if (v === currentTimezone) return false;

  currentTimezone = v;
  version += 1;
  formatterCache.clear();
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {}
  for (const fn of listeners) {
    try {
      fn(currentTimezone, version);
    } catch {}
  }
  return true;
}

/** Volta ao padrão e esquece o valor guardado (logout / troca de empresa). */
export function clearCompanyTimezone() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  if (currentTimezone === DEFAULT_TIMEZONE) return;
  currentTimezone = DEFAULT_TIMEZONE;
  version += 1;
  formatterCache.clear();
  for (const fn of listeners) {
    try {
      fn(currentTimezone, version);
    } catch {}
  }
}

/** Assina mudanças de fuso. Devolve a função de cancelamento. */
export function subscribeCompanyTimezone(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Intl.DateTimeFormat no fuso da empresa, memoizado por (locale, opções).
 * Construir um Intl.DateTimeFormat é caro e a lista de conversas formata uma hora por
 * linha visível a cada render — por isso o cache, zerado quando o fuso muda.
 */
export function getCompanyFormatter(options, locale = "pt-BR") {
  const key = `${locale}|${JSON.stringify(options || {})}`;
  const hit = formatterCache.get(key);
  if (hit !== undefined) return hit;

  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone: currentTimezone });
  } catch {
    try {
      // Runtime sem a zona: formata no fuso do aparelho em vez de não mostrar nada.
      fmt = new Intl.DateTimeFormat(locale, options);
    } catch {
      fmt = null;
    }
  }
  formatterCache.set(key, fmt);
  return fmt;
}

const HORA_OPTS = { hour: "2-digit", minute: "2-digit" };
const DIA_OPTS = { day: "2-digit", month: "2-digit", year: "numeric" };
const DIA_CURTO_OPTS = { day: "2-digit", month: "2-digit" };
const CHAVE_DIA_OPTS = { year: "numeric", month: "2-digit", day: "2-digit" };

/** "14:05" no fuso da empresa. "" quando a data é inválida. */
export function formatHoraEmpresa(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const fmt = getCompanyFormatter(HORA_OPTS);
  if (!fmt) return "";
  try {
    return fmt.format(date);
  } catch {
    return "";
  }
}

/** "03/11/2026" no fuso da empresa. */
export function formatDiaEmpresa(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const fmt = getCompanyFormatter(DIA_OPTS);
  if (!fmt) return "";
  try {
    return fmt.format(date);
  } catch {
    return "";
  }
}

/** "03/11" no fuso da empresa. */
export function formatDiaCurtoEmpresa(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const fmt = getCompanyFormatter(DIA_CURTO_OPTS);
  if (!fmt) return "";
  try {
    return fmt.format(date);
  } catch {
    return "";
  }
}

/**
 * Chave "AAAA-MM-DD" do dia civil NO FUSO DA EMPRESA.
 *
 * É isso que decide se duas mensagens caem no mesmo separador de data. Comparar
 * getFullYear/getMonth/getDate (fuso do aparelho) com um rótulo formatado no fuso da
 * empresa produziria um separador "Hoje" em cima de mensagens de ontem perto da
 * meia-noite. Usa formatToParts para não depender do formato do locale.
 */
export function companyDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const fmt = getCompanyFormatter(CHAVE_DIA_OPTS, "en-US");
  if (!fmt) return "";
  try {
    const parts = fmt.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : "";
  } catch {
    return "";
  }
}

/** true se as duas datas caem no mesmo dia civil do fuso da empresa. */
export function isSameCompanyDay(a, b) {
  const ka = companyDayKey(a);
  const kb = companyDayKey(b);
  return ka !== "" && ka === kb;
}
