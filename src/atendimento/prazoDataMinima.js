import { companyDayKey } from "../utils/companyTimezone";

/*
 * Data mínima dos modais "Aguardar cliente" / "Aguardar pagamento" (A3-11, 27/11/2026).
 *
 * Antes: `new Date().toISOString().slice(0, 10)` — o dia em UTC. Às 21h em São Paulo (19h no
 * Acre) o UTC já é amanhã, e o calendário nativo bloqueava o próprio dia ("pagamento para
 * hoje" impossível à noite). Doc 14: dia civil sempre no fuso da empresa (companyDayKey).
 * Sem fuso utilizável, cai no dia do APARELHO — nunca no UTC.
 */

function diaDoAparelho(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "AAAA-MM-DD" de hoje no fuso da empresa (para o `min` de um <input type="date">). */
export function hojeNoFusoDaEmpresa(agora = new Date()) {
  return companyDayKey(agora) || diaDoAparelho(agora);
}
