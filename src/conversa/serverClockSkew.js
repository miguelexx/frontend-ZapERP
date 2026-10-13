/**
 * Diferença observada entre o relógio do SERVIDOR e o do navegador.
 *
 * Por que isto existe: a bolha otimista nasce com `Date.now()` (relógio do cliente),
 * mas `criado_em` é gravado pelo backend com o relógio DELE. Com os dois relógios
 * dessincronizados, uma mensagem reconciliada "pula" para o horário do servidor e passa
 * a ficar na frente de uma bolha otimista criada DEPOIS dela — a rajada aparece fora de
 * ordem até a última bolha reconciliar (auditoria 10/10/2026 mediu ~2-3s de adiantamento
 * no servidor; a rajada 7C-1..7C-5 exibiu 7C-5 em primeiro por ~10s).
 *
 * A correção não é mudar quem manda na ordem — o horário do servidor continua sendo a
 * fonte de verdade, senão a ordem AO VIVO divergiria da ordem APÓS F5. A correção é a
 * bolha otimista já nascer estimando o relógio do servidor, para que a reconciliação
 * quase não mova o horário.
 *
 * Segurança: a amostra é `servidor - cliente` no instante em que recebemos o horário, SEM
 * compensar a latência. Como a latência é sempre positiva, isso SUBESTIMA o adiantamento
 * real — erramos para baixo de propósito, nunca jogando a bolha para um futuro distante.
 * Sem nenhuma amostra o offset é 0 e o comportamento é idêntico ao anterior.
 */

/** Acima disto não é dessincronia de relógio, é dado estranho (mensagem antiga, data inválida). */
const LIMITE_AMOSTRA_MS = 5 * 60 * 1000;
/** Poucas amostras bastam; a mediana descarta o outlier de uma requisição lenta. */
const MAX_AMOSTRAS = 7;

let amostras = [];

function paraMillis(valor) {
  if (valor == null || valor === "") return NaN;
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor < 1e11 ? valor * 1000 : valor;
  }
  const bruto = String(valor).trim();
  if (/^\d+$/.test(bruto)) {
    const n = Number(bruto);
    if (Number.isFinite(n)) return n < 1e11 ? n * 1000 : n;
  }
  const t = Date.parse(bruto);
  return Number.isFinite(t) ? t : NaN;
}

function mediana(valores) {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

/**
 * Registra um horário canônico do servidor recém-recebido.
 * Só deve ser chamado com mensagens FRESCAS (reconciliação de bolha que acabou de sair),
 * nunca com histórico carregado por GET — senão a "diferença" vira a idade da mensagem.
 * @returns {number} offset estimado (ms) depois de incorporar a amostra
 */
export function observeServerTimestamp(serverTimestamp, clientMs = Date.now()) {
  const ts = paraMillis(serverTimestamp);
  const agora = Number.isFinite(Number(clientMs)) ? Number(clientMs) : Date.now();
  if (!Number.isFinite(ts)) return getServerClockSkewMs();

  const amostra = ts - agora;
  if (!Number.isFinite(amostra) || Math.abs(amostra) > LIMITE_AMOSTRA_MS) {
    return getServerClockSkewMs();
  }

  amostras.push(amostra);
  if (amostras.length > MAX_AMOSTRAS) amostras = amostras.slice(-MAX_AMOSTRAS);
  return getServerClockSkewMs();
}

/** Offset estimado (positivo = servidor adiantado em relação ao navegador). */
export function getServerClockSkewMs() {
  if (!amostras.length) return 0;
  return mediana(amostras);
}

/** `Date.now()` corrigido para o relógio do servidor (base da âncora otimista). */
export function estimatedServerNowMs(nowMs = Date.now()) {
  const base = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return base + getServerClockSkewMs();
}

/** Só para testes. */
export function resetServerClockSkew() {
  amostras = [];
}
