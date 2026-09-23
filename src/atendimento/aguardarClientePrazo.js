/**
 * Prazo do alarme "Aguardar cliente" (frontend).
 * Espelha helpers/aguardarClientePrazo.js do backend para a contagem otimista.
 * O valor autoritativo sempre vem da resposta do backend/socket.
 */

function endOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * @param {string} prazo 1h | 2h | 4h | hoje | amanha | data
 * @param {string} [dataIso] YYYY-MM-DD quando prazo=data
 * @returns {string|null} ISO do vencimento, ou null se inválido
 */
export function calcularAguardarClientePrazoAteLocal(prazo, dataIso) {
  const key = String(prazo || "").trim().toLowerCase();
  const now = new Date();
  let due = null;
  if (key === "1h") due = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  else if (key === "2h") due = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  else if (key === "4h") due = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  else if (key === "hoje") due = endOfLocalDay(now);
  else if (key === "amanha") {
    const amanha = new Date(now);
    amanha.setDate(amanha.getDate() + 1);
    due = endOfLocalDay(amanha);
  } else if (key === "data") {
    const raw = String(dataIso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parsed = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    due = endOfLocalDay(parsed);
  }
  return due && !Number.isNaN(due.getTime()) ? due.toISOString() : null;
}

/**
 * Formata o tempo restante/estourado de forma curta e legível ("faltam 3h 12m",
 * "vence em 45m", "atrasado 2h").
 * @param {string|number|Date} prazoAte
 * @param {number} [nowMs]
 * @returns {{ overdue:boolean, label:string, diffMs:number }|null}
 */
export function formatarPrazoRestante(prazoAte, nowMs = Date.now()) {
  if (!prazoAte) return null;
  const ate = new Date(prazoAte).getTime();
  if (!Number.isFinite(ate)) return null;
  const diffMs = ate - nowMs;
  const overdue = diffMs <= 0;
  const abs = Math.abs(diffMs);
  const totalMin = Math.floor(abs / 60000);
  const dias = Math.floor(totalMin / (60 * 24));
  const horas = Math.floor((totalMin % (60 * 24)) / 60);
  const min = totalMin % 60;

  let corpo;
  if (dias > 0) corpo = `${dias}d ${horas}h`;
  else if (horas > 0) corpo = `${horas}h ${min}m`;
  else corpo = `${min}m`;

  const label = overdue ? `atrasado ${corpo}` : `faltam ${corpo}`;
  return { overdue, label, diffMs };
}
