/**
 * Mensagem de erro de API em português, para toast e painel.
 *
 * Antes cada `catch` fazia `e?.response?.data?.error || e?.message`: sem corpo do servidor,
 * o atendente lia o texto cru do axios ("Network Error", "timeout of 30000ms exceeded",
 * "Request failed with status code 500"). Este helper NUNCA devolve `e.message`:
 *   1. texto que o backend mandou (`error`, `error.message`, `erro`, `message`);
 *   2. sem resposta: rede ou demora, com texto que diz o que fazer;
 *   3. só o status (5xx, 401, 403, 404, 429);
 *   4. o `fallback` de quem chamou.
 *
 * @param {unknown} e erro do axios (ou qualquer erro)
 * @param {string} [fallback]
 * @returns {string}
 */

const SEM_CONEXAO = "Sem conexão com o servidor. Verifique a internet e tente de novo.";
const DEMOROU = "O servidor demorou a responder. Tente de novo em instantes.";

function textoDoServidor(data) {
  if (data == null) return "";
  if (typeof data === "string") {
    const s = data.trim();
    // Página HTML de proxy (502 do nginx etc.) não é mensagem para gente.
    if (!s || s.length > 240 || /<[a-z!/]/i.test(s)) return "";
    return s;
  }
  if (typeof data !== "object") return "";
  const candidatos = [data.error?.message, data.error, data.erro, data.message, data.mensagem];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Timeout do axios (sem resposta do servidor). */
export function isApiTimeoutError(e) {
  if (!e || e.response) return false;
  const code = String(e.code || "");
  return code === "ECONNABORTED" || code === "ETIMEDOUT" || /timeout/i.test(String(e.message || ""));
}

/** Falha sem resposta HTTP (rede caiu, servidor fora do ar, CORS, conexão recusada). */
export function isApiNetworkError(e) {
  if (!e || e.response) return false;
  if (isApiTimeoutError(e)) return false;
  const code = String(e.code || "");
  return code === "ERR_NETWORK" || /network error/i.test(String(e.message || "")) || Boolean(e.request);
}

export function friendlyApiError(e, fallback = "Não foi possível concluir esta ação. Tente de novo.") {
  const doServidor = textoDoServidor(e?.response?.data);
  if (doServidor) return doServidor;
  if (isApiTimeoutError(e)) return DEMOROU;
  if (isApiNetworkError(e)) return SEM_CONEXAO;
  const status = Number(e?.response?.status) || 0;
  if (status >= 500) return "Erro no servidor. Tente novamente em instantes.";
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (status === 403) return "Você não tem permissão para esta ação.";
  if (status === 404) return "Não encontrado. Atualize a lista e tente de novo.";
  if (status === 429) return "Muitas tentativas seguidas. Aguarde um momento e tente de novo.";
  return fallback;
}

export default friendlyApiError;
