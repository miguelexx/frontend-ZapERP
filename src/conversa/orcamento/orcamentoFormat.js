/**
 * Formatação e normalização do orçamento WM.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 3, lacuna 3; seção 5,
 * "três regras que o contrato impõe e que são fáceis de violar").
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO REUSAR O `formatMoeda` DO PAINEL DE PRODUTOS
 * ────────────────────────────────────────────────────────────────────────────
 * `ProdutoConsultaPanel.jsx` devolve `"R$ 0,00"` quando a entrada não é número. Num painel de
 * consulta isso é feio; num orçamento é perigoso: "R$ 0,00" é um preço plausível, e um campo
 * ausente ou fora de formato apareceria como "de graça" em vez de aparecer como ausente. O
 * atendente aprovaria um total que ninguém calculou.
 *
 * Aqui o fallback é `"—"`, sempre. Zero de verdade (`"0"`, `0`) continua virando "R$ 0,00",
 * porque zero é um valor; o que vira "—" é a AUSÊNCIA de valor.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECIMAIS: A STRING DA WM É A VERDADE
 * ────────────────────────────────────────────────────────────────────────────
 * A WM serializa preço como `0.00##` invariant (ex.: `"33.038"`, três decimais) e estoque como
 * `0.000`, que **pode ser negativo** (ex.: `"-2.125"`). Esse texto vai copiado byte a byte
 * para a criação, então NADA aqui reformata o valor de origem: `Number` é usado só para
 * PRODUZIR a string exibida, nunca para substituir o dado. Quem precisar enviar o valor manda
 * a string original, não a formatada.
 */

/** Locale e moeda fixos: o orçamento é do ERP brasileiro. */
const LOCALE = "pt-BR";
const MOEDA = "BRL";

/** O que se mostra quando não há valor. Nunca "R$ 0,00", nunca "0", nunca vazio. */
export const SEM_VALOR = "—";

/**
 * Converte para número só quando o valor é inequivocamente numérico.
 * `null`, `undefined`, `""`, `"  "`, `"abc"`, `NaN`, `Infinity`, booleano e objeto → `null`.
 * Aceita a vírgula decimal digitada por humano, mas só como leitura de exibição.
 */
function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "boolean") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const s = valor.trim();
  if (!s) return null;
  // Só dígitos, sinal e UM separador decimal. "1.2.3" e "R$ 3" não passam.
  if (!/^-?\d+(?:[.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Moeda em reais, ou `"—"` para valor inválido/ausente.
 * @param {string|number|null|undefined} valor string decimal da WM, de preferência
 */
export function formatMoedaOrcamento(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return SEM_VALOR;
  try {
    return n.toLocaleString(LOCALE, { style: "currency", currency: MOEDA });
  } catch {
    // Ambiente sem ICU completo: ainda assim nada de "R$ 0,00" para entrada inválida.
    return `R$ ${n.toFixed(2).replace(".", ",")}`;
  }
}

/**
 * Quantidade/estoque legível, preservando as casas que a WM mandou e sem inventar casas.
 * `"-2.125"` → `"-2,125"`; `"3"` → `"3"`; inválido → `"—"`.
 */
export function formatQuantidadeOrcamento(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return SEM_VALOR;
  const texto = typeof valor === "string" ? valor.trim() : String(valor);
  return texto.replace(".", ",");
}

/** Texto de exibição que pode faltar (descrição, unidade, nome). */
export function textoOuSemValor(valor) {
  if (typeof valor !== "string") return SEM_VALOR;
  const s = valor.trim();
  return s.length ? s : SEM_VALOR;
}

/* ------------------------------------------------------------------ *
 * Quantidade que SAI para o backend
 * ------------------------------------------------------------------ */

/** Padrão aceito pelo backend e pela WM — sem sinal, sem espaço, sem vírgula. */
export const PADRAO_QUANTIDADE = /^\d+(?:\.\d+)?$/;

/**
 * Normaliza a quantidade digitada para a string que o backend aceita.
 *
 * ⚠️ O `trim()` NÃO é cosmético: o validador do backend recusa `" 2 "` por formato, de
 * propósito (ele não "conserta" entrada, para que o valor que chega à WM seja exatamente o
 * que foi validado). Um campo de texto com espaço colado de outra planilha queimaria uma
 * chamada e devolveria erro de formato ao atendente.
 *
 * Também troca a vírgula do teclado brasileiro por ponto — a WM só entende ponto — e recusa
 * zero textualmente (`"0"`, `"0.0"`, `"0.000"`): o padrão da criação na WM ACEITA zero, então
 * barrar quantidade zero é trabalho nosso.
 *
 * @returns {{ ok: true, value: string }|{ ok: false, motivo: string }}
 */
export function normalizarQuantidadeParaEnvio(bruta) {
  const texto = String(bruta ?? "").trim().replace(",", ".");
  if (!texto) return { ok: false, motivo: "Informe a quantidade." };
  if (texto.length > 20) return { ok: false, motivo: "Quantidade longa demais." };
  if (!PADRAO_QUANTIDADE.test(texto)) {
    return { ok: false, motivo: "Quantidade inválida. Use apenas números (ex.: 1 ou 1,5)." };
  }
  // Checagem textual: `Number("0.000")` seria uma conversão desnecessária num valor que
  // precisa sair daqui idêntico ao que entrou.
  if (!/[1-9]/.test(texto)) return { ok: false, motivo: "A quantidade precisa ser maior que zero." };
  return { ok: true, value: texto };
}

/** Soma 1 / subtrai 1 preservando casas decimais inteiras simples; piso em 1. */
export function passoQuantidade(atual, delta) {
  const n = numeroOuNull(String(atual ?? "").replace(",", "."));
  if (n === null) return delta > 0 ? "1" : "1";
  const proximo = n + delta;
  if (!(proximo >= 1)) return "1";
  // Mantém a precisão de quem digitou (ex.: 1,5 + 1 = 2,5), sem erro de float visível.
  const casas = String(atual ?? "").replace(",", ".").split(".")[1]?.length || 0;
  return casas > 0 ? proximo.toFixed(Math.min(casas, 6)) : String(Math.round(proximo));
}

/* ------------------------------------------------------------------ *
 * Sugestões de preenchimento
 * ------------------------------------------------------------------ */

/**
 * Pontuação que humanos põem em telefone e que não muda a natureza do texto.
 * Fora `+`, `(`, `)`, espaço, `-` e `.`, qualquer outro caractere já indica nome.
 */
const PONTUACAO_TELEFONE = /[\s()+.-]/g;

/**
 * O título da conversa serve como sugestão de busca de cliente **só quando é nome de verdade**.
 *
 * Conversa sem contato cadastrado nasce com o telefone no título (`"5511999999999"`,
 * `"(11) 99999-9999"`). Jogar isso no campo de cliente não é neutro: a busca da WM é por NOME,
 * então a sugestão viraria uma consulta condenada a não achar nada — e o atendente leria o
 * "nenhum cliente encontrado" como "este cliente não existe no ERP", quando o que não existe é
 * um cliente chamado "5511999999999".
 *
 * Então: se o texto, tirada a pontuação de telefone, for só dígitos, não há sugestão. Nome de
 * verdade (inclusive com número no meio, como "Posto 3 Irmãos") continua passando.
 *
 * @param {string|null|undefined} titulo nome exibido da conversa
 * @returns {string} sugestão aparada, ou `""` quando não se deve sugerir nada
 */
export function sugestaoDeBuscaCliente(titulo) {
  if (typeof titulo !== "string") return "";
  const texto = titulo.trim();
  if (!texto) return "";
  const semPontuacao = texto.replace(PONTUACAO_TELEFONE, "");
  if (semPontuacao.length > 0 && /^\d+$/.test(semPontuacao)) return "";
  return texto.slice(0, 100);
}

export default {
  SEM_VALOR,
  formatMoedaOrcamento,
  formatQuantidadeOrcamento,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  sugestaoDeBuscaCliente,
  PADRAO_QUANTIDADE,
};
