/**
 * Formatação de presença WhatsApp (Whapi) para o header da conversa.
 *
 * "Hoje"/"ontem" e a hora seguem o fuso da empresa (Configurações → Geral → Estado),
 * igual ao resto do atendimento — e não o fuso do aparelho de quem está atendendo.
 */

import {
  companyDayKey,
  formatDiaCurtoEmpresa,
  formatHoraEmpresa,
} from "../../utils/companyTimezone";

export function digitsOnlyPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Compara telefone da conversa com payload de `presenca_contato` / entry Whapi. */
export function presenceMatchesConversa(payload, conversa) {
  if (!payload || !conversa) return false;
  const cTel = digitsOnlyPhone(conversa.telefone);
  if (!cTel) return false;

  const pTel = digitsOnlyPhone(payload.telefone);
  if (pTel && (pTel === cTel || pTel.endsWith(cTel) || cTel.endsWith(pTel))) return true;

  const chatRaw = String(payload.chat_id || payload.entry_id || "");
  const chatDigits = digitsOnlyPhone(chatRaw.split("@")[0]);
  if (chatDigits && (chatDigits === cTel || chatDigits.endsWith(cTel) || cTel.endsWith(chatDigits))) {
    return true;
  }
  return false;
}

function formatLastSeenUnix(lastSeen) {
  const n = Number(lastSeen);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Whapi usa unix seconds; se vier ms, normaliza
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const diaVisto = companyDayKey(d);

  const time = formatHoraEmpresa(d) ||
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diaVisto && diaVisto === companyDayKey(now)) return `visto por último hoje às ${time}`;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (diaVisto && diaVisto === companyDayKey(yesterday)) return `visto por último ontem às ${time}`;

  const date = formatDiaCurtoEmpresa(d) ||
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `visto por último em ${date} às ${time}`;
}

/**
 * @returns {{ text: string, kind: 'online'|'typing'|'recording'|'last_seen'|'offline'|null, animate?: boolean }}
 */
export function formatContactPresenceLabel(presence) {
  if (!presence) return { text: "", kind: null };
  const status = String(presence.status || "").trim().toLowerCase();

  if (status === "online") return { text: "online", kind: "online" };
  if (status === "typing") {
    return { text: "digitando", kind: "typing", animate: true };
  }
  if (status === "recording") {
    return { text: "gravando áudio", kind: "recording", animate: true };
  }

  const lastSeenLabel = formatLastSeenUnix(presence.last_seen ?? presence.lastSeen);
  if (lastSeenLabel) return { text: lastSeenLabel, kind: "last_seen" };

  if (status === "offline" || status === "paused") {
    return { text: "", kind: "offline" };
  }
  return { text: "", kind: null };
}
