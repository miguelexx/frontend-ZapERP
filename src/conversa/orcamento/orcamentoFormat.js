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
 *
 * Daí haver DOIS formatadores de quantidade, e eles não são intercambiáveis:
 *   · `formatQuantidadeOrcamento` — o número com as casas que a WM mandou (`"2.000"` → `2,000`),
 *     para onde o dado é conferido contra o ERP;
 *   · `formatQuantidadeExibicao` — o número como se LÊ, sem as casas vazias e com a unidade
 *     (`"2.000"` + `UN` → `2 UN`), para toda tela que a atendente e o cliente leem.
 * Nenhum dos dois toca no valor ENVIADO: isso é de `normalizarQuantidadeParaEnvio`.
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

/**
 * Casas decimais que não significam nada, tiradas do fim do número JÁ FORMATADO.
 * `"2,000"` → `"2"`, `"1,500"` → `"1,5"`, `"1,05"` → `"1,05"` (o 5 é significativo).
 */
function semCasasVazias(texto) {
  if (!texto.includes(",")) return texto;
  return texto.replace(/,?0+$/, "") || texto;
}

/**
 * Quantidade como se LÊ em português: sem as casas vazias, com a unidade do produto.
 *
 * A WM serializa quantidade e estoque com três casas fixas — `"1.000"` é UMA peça e `"13.000"`
 * são TREZE. A tela imprimia isso trocando só o ponto pela vírgula, e `1,000` no balcão se lê
 * como mil: a atendente passava ao cliente uma quantidade mil vezes maior. Num orçamento isso
 * não é estética, é o número errado.
 *
 * Então: as casas que não significam nada saem, e a unidade vem colada, porque "1" sozinho num
 * item vendido em M2 não é "uma peça" — é um metro quadrado. Fração de verdade permanece
 * (`"1.500"` + `M2` → `1,5 M2`); meia unidade é informação e não se apaga.
 *
 * ⚠️ **Isto é exibição, e só exibição.** O valor que vai para a WM é a string decimal dela,
 * byte a byte (§8.1), e quem o envia usa `normalizarQuantidadeParaEnvio` sobre o texto cru —
 * nunca este formatador. Quem precisar do número com as casas da WM usa
 * `formatQuantidadeOrcamento`, que continua existindo para isso.
 *
 * @param {string|number|null|undefined} valor string decimal da WM, de preferência
 * @param {string} [unidade] unidade do ERP (UN, PC, M2, CX); ausente, sai só o número
 */
export function formatQuantidadeExibicao(valor, unidade) {
  const exato = formatQuantidadeOrcamento(valor);
  if (exato === SEM_VALOR) return SEM_VALOR;
  const numero = semCasasVazias(exato);
  const un = typeof unidade === "string" ? unidade.trim() : "";
  return un ? `${numero} ${un}` : numero;
}

/* ------------------------------------------------------------------ *
 * Preço que não é preço
 * ------------------------------------------------------------------ */

/**
 * Teto do "preço não cadastrado": um centavo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE ONDE SAI ESTE NÚMERO (e o que quem vier depois precisa saber para mexer)
 * ────────────────────────────────────────────────────────────────────────────
 * Medido no catálogo real da Tijolar em 25/10/2026: de 24 produtos amostrados, **5 vieram com
 * `preco_unitario: "0.010"`**. Conferido contra a prévia oficial da WM — o valor é o que a WM
 * devolve, não defeito nosso: são produtos sem preço cadastrado no Icthus da loja. A tela os
 * mostrava como "R$ 0,01", que é um preço plausível, e um orçamento assim sair é acidente
 * comercial.
 *
 * O limiar é `<= 0.01` e não `=== 0.010` porque o sentinela do ERP não é um contrato: hoje são
 * três casas (`"0.010"`), amanhã pode ser `"0.001"` ou `"0.000"`, e um limiar de igualdade
 * exata deixaria passar o mesmo acidente com outra serialização. Ele também não é mais alto
 * (`0.10`, `1.00`) porque aí deixaria de descrever "valor irrisório" e passaria a marcar
 * produto BARATO como sem preço — numa loja de material de construção existe parafuso a R$ 0,50
 * e marcá-lo como "não cadastrado" seria mentir na direção oposta.
 *
 * Um centavo é o limite defensável: é a menor unidade que a moeda representa, e nada abaixo ou
 * igual a ela pode ser um preço de venda real. Zero e negativo entram pelo mesmo teto — os dois
 * são "não há preço", não "custa nada".
 *
 * Quem for mexer: subir isto marca produto baratinho como sem preço; descer para abaixo de 0,01
 * deixa de pegar o `"0.010"` que foi MEDIDO em produção. Qualquer mudança precisa de uma nova
 * amostragem do catálogo, não de intuição.
 */
export const PRECO_NAO_CADASTRADO_ATE = 0.01;

/** Como a tela chama esse estado. Nunca "R$ 0,01", nunca "grátis", nunca "R$ 0,00". */
export const TEXTO_PRECO_NAO_CADASTRADO = "Preço não cadastrado";

/**
 * Este valor é "preço não cadastrado no ERP" em vez de preço?
 *
 * AUSÊNCIA NÃO ENTRA AQUI, e a diferença importa: `null`, `""` e texto fora do padrão são
 * "não sabemos o preço" — a tela já os mostra como "—" ou como "ver preço", e chamá-los de
 * "não cadastrado" afirmaria sobre o cadastro do ERP algo que ninguém consultou. Esta função
 * só fala de valor que a WM MANDOU e que é irrisório ou nulo.
 *
 * @param {string|number|null|undefined} valor `preco_unitario`, como a WM o mandou
 * @returns {boolean}
 */
export function precoNaoCadastrado(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return false;
  return n <= PRECO_NAO_CADASTRADO_ATE;
}

/**
 * Estoque sem saldo — zero ou negativo.
 *
 * Serve só para DESTACAR o número (o contrato permite estoque zerado e negativo, e nenhum dos
 * dois impede a venda: o ERP decide isso, não a tela). Devolve `false` quando não há valor,
 * para que ausência nunca seja apresentada como "sem estoque": ausência é "—".
 */
export function estoqueSemSaldo(valor) {
  return nivelEstoque(valor) === NIVEL_ESTOQUE.SEM;
}

/** Até quantas unidades o estoque ainda é "pouco". Acima disso, é folga. */
export const ESTOQUE_POUCO_ATE = 5;

export const NIVEL_ESTOQUE = Object.freeze({
  /** Zero ou negativo. Permitido pelo contrato: **não** impede a venda. */
  SEM: "sem",
  /** Positivo, mas pouco — vale a atendente saber antes de prometer prazo. */
  POUCO: "pouco",
  /** Positivo com folga. */
  FOLGA: "folga",
});

/**
 * Em que faixa está este estoque — ou `null` quando não há valor.
 *
 * As três faixas existem para DESTACAR, nunca para decidir: o contrato permite vender com
 * estoque zerado e negativo, e quem decide isso é o ERP. Ausência devolve `null` (e não "sem"),
 * porque "não informado" e "acabou" são coisas diferentes e confundi-las faria a tela afirmar
 * o que ninguém disse.
 */
export function nivelEstoque(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return null;
  if (n <= 0) return NIVEL_ESTOQUE.SEM;
  return n <= ESTOQUE_POUCO_ATE ? NIVEL_ESTOQUE.POUCO : NIVEL_ESTOQUE.FOLGA;
}

/**
 * O estoque em palavras, para a cor nunca ser o único sinal.
 *
 * Quem não distingue verde de âmbar — e quem está com o celular no sol do balcão — continua
 * lendo a mesma informação, porque ela está no texto: "Sem estoque", "Estoque 3", "Estoque 120".
 * Estoque negativo mantém o número à vista entre parênteses: `-2,125` é informação do ERP sobre
 * uma venda já feita, e esconder isso atrás de "sem estoque" apagaria o que o número diz.
 *
 * O número passa por `formatQuantidadeExibicao`: estoque é quantidade, e `Estoque 13,000` num
 * saldo de treze unidades seria lido como treze mil (medido no catálogo real da empresa 20, que
 * tem saldos de `"13.000"` e `"100.000"`).
 *
 * @param {string|number|null|undefined} valor `estoque_previsto`, como a WM o mandou
 * @param {string} [unidade] unidade do ERP, quando a tela a conhece
 * @returns {string} vazio quando não há valor — e vazio significa "não desenhe nada"
 */
export function textoEstoque(valor, unidade) {
  const nivel = nivelEstoque(valor);
  if (nivel === null) return "";
  if (nivel !== NIVEL_ESTOQUE.SEM) return `Estoque ${formatQuantidadeExibicao(valor, unidade)}`;
  const n = numeroOuNull(valor);
  return n < 0 ? `Sem estoque (${formatQuantidadeExibicao(valor, unidade)})` : "Sem estoque";
}

/**
 * A classe do estoque, num lugar só.
 *
 * Mora aqui, e não em cada componente, porque card de busca, linha do carrinho e card de
 * ambiguidade mostram o MESMO número: três cópias da regra é como um deles acaba com a faixa
 * errada depois de um ajuste. Ausência devolve `""` — quem não tem valor não desenha nada.
 */
export function classeEstoque(valor) {
  const nivel = nivelEstoque(valor);
  if (nivel === null) return "";
  return `wa-orc-candidato-estoque wa-orc-candidato-estoque--${nivel}`;
}

/**
 * Grupo e subgrupo do produto numa etiqueta só: `"PECAS · FILTROS"`.
 *
 * Numa loja de peças, duas descrições parecidas se distinguem pelo grupo — e ele **não vem na
 * lista** de candidatos (medido no ERP real: a lista traz só código, descrição, marca e
 * unidade). Só a resposta resolvida o traz. Por isso a etiqueta aparece quando o dado existe e
 * simplesmente não existe quando não: inventar "sem grupo" encheria trinta cards de ruído.
 *
 * @returns {string} vazio quando a WM não mandou nem grupo nem subgrupo
 */
export function rotuloGrupoProduto(produto) {
  if (!produto || typeof produto !== "object") return "";
  const grupo = typeof produto.grupo === "string" ? produto.grupo.trim() : "";
  const subgrupo = typeof produto.subgrupo === "string" ? produto.subgrupo.trim() : "";
  const partes = [grupo, subgrupo].filter(Boolean);
  if (!partes.length) return "";
  // Subgrupo que repete o grupo ("FILTROS · FILTROS") não acrescenta nada e ocupa linha.
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i);
  return unicas.join(" · ").slice(0, 60);
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
  formatQuantidadeExibicao,
  estoqueSemSaldo,
  precoNaoCadastrado,
  PRECO_NAO_CADASTRADO_ATE,
  TEXTO_PRECO_NAO_CADASTRADO,
  nivelEstoque,
  textoEstoque,
  classeEstoque,
  rotuloGrupoProduto,
  NIVEL_ESTOQUE,
  ESTOQUE_POUCO_ATE,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  sugestaoDeBuscaCliente,
  PADRAO_QUANTIDADE,
};
