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
 * Nomes EXATOS das etiquetas automáticas criadas pelo monitor no backend
 * (services/aguardandoClienteMonitorService.js). Mantidos em sincronia à mão —
 * usados no frontend para (a) mapear nível→rótulo e (b) evitar duplicar a
 * etiqueta no card da lista (o selo premium já comunica o estado).
 */
export const AUTO_TAG_AGUARDANDO_NOMES = [
  "⏳ Aguardando cliente",
  "⏰ Cliente atrasado",
  "🚨 Cliente sem resposta",
];

/** true se a etiqueta é uma das automáticas de "Aguardar cliente". */
export function isAutoTagAguardandoCliente(tag) {
  const nome = String(tag?.nome || "").trim();
  return AUTO_TAG_AGUARDANDO_NOMES.includes(nome);
}

const AUTO_TAG_NOME_PARA_NIVEL = {
  "⏳ Aguardando cliente": "aguardando",
  "⏰ Cliente atrasado": "atrasado",
  "🚨 Cliente sem resposta": "sem_resposta",
};

/**
 * Deriva o nível do alarme a partir das etiquetas automáticas presentes na lista
 * (fallback no F5, quando as colunas de prazo ainda não vieram no GET da lista).
 * Prioriza o nível mais grave.
 * @returns {"aguardando"|"atrasado"|"sem_resposta"|null}
 */
export function nivelFromAutoTags(tags) {
  if (!Array.isArray(tags)) return null;
  const presentes = new Set();
  for (const t of tags) {
    const nivel = AUTO_TAG_NOME_PARA_NIVEL[String(t?.nome || "").trim()];
    if (nivel) presentes.add(nivel);
  }
  if (presentes.has("sem_resposta")) return "sem_resposta";
  if (presentes.has("atrasado")) return "atrasado";
  if (presentes.has("aguardando")) return "aguardando";
  return null;
}

/**
 * Formato ultra-compacto para o card da lista: "3h", "45m", "2d".
 * @returns {{ overdue:boolean, compact:string, diffMs:number }|null}
 */
export function formatarPrazoCompacto(prazoAte, nowMs = Date.now()) {
  if (!prazoAte) return null;
  const ate = new Date(prazoAte).getTime();
  if (!Number.isFinite(ate)) return null;
  const diffMs = ate - nowMs;
  const overdue = diffMs <= 0;
  const totalMin = Math.max(1, Math.floor(Math.abs(diffMs) / 60000));
  const dias = Math.floor(totalMin / (60 * 24));
  const horas = Math.floor((totalMin % (60 * 24)) / 60);
  const min = totalMin % 60;
  let compact;
  if (dias >= 1) compact = horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
  else if (horas >= 1) compact = min > 0 ? `${horas}h ${min}m` : `${horas}h`;
  else compact = `${min}m`;
  return { overdue, compact, diffMs };
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
