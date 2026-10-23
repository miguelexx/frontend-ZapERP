/**
 * `parseToDate` — unica funcao de `conversaViewHelpers` que o caminho da LISTA usa.
 *
 * Vivia naquele arquivo (68 exports, 41 kB, que ainda arrasta `conversaUtils`), e
 * `chats/chatListRowAtendimento.js` e `chats/chatsStore.js` importavam-no so' por ela.
 * Enquanto o motor de conversas estava no chunk de entrada isso nao custava nada —
 * medi 0 kB de ganho em 23/10. Depois de o motor sair (ver runtime/sessionRuntime.js),
 * passou a arrastar 41+15 kB para o boot por causa de 13 linhas.
 *
 * `conversaViewHelpers` reexporta daqui, entao nada do lado da conversa mudou.
 */

export function parseToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") return new Date(ts);
  const s = String(ts).trim();
  if (!s) return null;
  // Se vier sem timezone (ex.: "2026-02-10T20:36:00"), assuma UTC (Supabase timestamp sem TZ)
  const noTzIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(s);
  const normalized = !hasTz && noTzIso.test(s) ? `${s}Z` : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}
