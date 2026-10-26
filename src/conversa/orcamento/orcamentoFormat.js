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
 * A mesma coisa, curta, para a coluna de valores do card de busca.
 *
 * Duas strings porque a coluna tem 104px fixos e altura RESERVADA de 24px (ela existe para o
 * card não se mexer quando o preço chega). "Preço não cadastrado" ali quebra em duas linhas e
 * estoura os 24px — o card cresce 3px e a lista sobe sob o dedo de quem já estava mirando o
 * card de baixo, que é exatamente o defeito que a altura reservada evita.
 *
 * Não é "Sem preço" nem "Preço ausente" de propósito: as duas se confundem com os outros dois
 * estados que essa MESMA vaga já tem — "ver preço" (não consultado) e "tentar de novo" (a
 * consulta falhou). "Não cadastrado" fala do cadastro do ERP, que é a diferença toda.
 */
export const ETIQUETA_PRECO_NAO_CADASTRADO = "Não cadastrado";

/**
 * A explicação longa, para `title` e para leitor de tela.
 *
 * Existe porque a etiqueta curta cabe na coluna de valores mas não explica a consequência, e
 * "Preço não cadastrado" sozinho pode ser lido como defeito do ZapERP. O cadastro é no ERP da
 * loja, e é lá que se resolve.
 */
export const TITULO_PRECO_NAO_CADASTRADO =
  "Este produto não tem preço cadastrado no sistema da empresa. O valor que vem de lá não é um preço de venda.";

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

/**
 * Saldo NEGATIVO — que não é a mesma coisa que estoque zerado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO TEM NOME PRÓPRIO
 * ────────────────────────────────────────────────────────────────────────────
 * Medido no catálogo real da Tijolar em 26/10/2026, numa amostra de 36 produtos resolvidos:
 * **8 vinham com saldo negativo** (`-908.000`, `-3943.500`, `-170.000`) e **13 com zero**. Os
 * dois casos são comuns, e eram apresentados pela mesma frase — "Sem estoque", com o número
 * negativo entre parênteses.
 *
 * Mas eles não dizem a mesma coisa. Zero é "acabou": o ERP sabe que não tem. Negativo é o ERP
 * tendo registrado mais saída do que entrada naquele item — ou seja, o INVENTÁRIO da loja está
 * errado, e o número que a atendente está lendo não descreve a prateleira. Chamar `-3943,5` de
 * "sem estoque" esconde justamente a parte que alguém precisa resolver.
 *
 * Não bloqueia nada, como o resto da faixa de estoque: o contrato permite vender nos dois casos
 * e quem decide é o ERP. Isto só muda a PALAVRA e o peso.
 *
 * `false` para ausência, como `estoqueSemSaldo`: "não informado" não é "negativo".
 */
export function estoqueNegativo(valor) {
  const n = numeroOuNull(valor);
  return n !== null && n < 0;
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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZERO E NEGATIVO NÃO DIZEM A MESMA COISA (e antes diziam)
 * ────────────────────────────────────────────────────────────────────────────
 * Até 26/10/2026 negativo saía como `Sem estoque (-908)`: a mesma frase do zero, com o número
 * num aparte. Lido no balcão, "sem estoque" é "acabou" — e `-908` não é acabou, é o inventário
 * da loja errado (ver `estoqueNegativo`). O aparte entre parênteses ainda é o número menos
 * importante da frase que o contém.
 *
 * Agora são duas leituras diferentes: zero continua `Sem estoque`, e negativo vira
 * `Saldo -908 SC` — a palavra muda, o número vem inteiro e sem aparte, e a classe o pinta de
 * âmbar. Nenhuma das duas bloqueia venda; o ERP é que decide isso.
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
  // O sinal já vem no número (`formatQuantidadeExibicao("-908.000")` → `-908`): a palavra "Saldo"
  // existe para o negativo não ser lido como a contagem de uma prateleira.
  if (estoqueNegativo(valor)) return `Saldo ${formatQuantidadeExibicao(valor, unidade)}`;
  return "Sem estoque";
}

/**
 * A explicação do saldo negativo, para `title` e leitor de tela.
 *
 * O card não tem espaço para dizer o que um saldo negativo significa, e "Saldo -908" sozinho
 * pode ser lido como defeito do ZapERP. O defeito é de inventário, e é na loja que se resolve.
 */
export const TITULO_SALDO_NEGATIVO =
  "O sistema da empresa registrou mais saída do que entrada neste produto, então o saldo dele " +
  "ficou negativo. Não é o mesmo que estoque zerado: o número não descreve a prateleira. " +
  "Confira o estoque antes de prometer entrega.";

/**
 * A classe do estoque, num lugar só.
 *
 * Mora aqui, e não em cada componente, porque card de busca, linha do carrinho e card de
 * ambiguidade mostram o MESMO número: três cópias da regra é como um deles acaba com a faixa
 * errada depois de um ajuste. Ausência devolve `""` — quem não tem valor não desenha nada.
 *
 * O negativo entra como MODIFICADOR de `--sem`, não como quarta faixa: `nivelEstoque` (e o
 * `estoqueSemSaldo` que vive dele) responde "este saldo não vende sozinho?", e negativo
 * continua respondendo sim. O que muda é a leitura na tela, então a diferença é de classe.
 */
export function classeEstoque(valor) {
  const nivel = nivelEstoque(valor);
  if (nivel === null) return "";
  const base = `wa-orc-candidato-estoque wa-orc-candidato-estoque--${nivel}`;
  return estoqueNegativo(valor) ? `${base} wa-orc-candidato-estoque--negativo` : base;
}

/* ------------------------------------------------------------------ *
 * A IDADE DO SALDO — "352,5 em estoque" de quando?
 * ------------------------------------------------------------------ *
 * `meta.fonte: "tempo_real"` diz que a CONSULTA foi ao vivo. Não diz que o número é de agora, e
 * a tela vinha deixando as duas coisas parecerem a mesma.
 *
 * Medido no ERP real da Tijolar em 26/10/2026, em 36 produtos resolvidos: a idade de
 * `estoque_sincronizado_em` vinha em dois regimes, **0,2–2,5 h** ou **86,6 h (3,6 dias)**, com
 * mediana de 86,6 h. São situações completamente diferentes para quem vai prometer entrega ao
 * cliente — e apareciam idênticas, porque não apareciam.
 *
 * Duas coisas tornam isto correto em vez de decorativo:
 *
 *   · A IDADE ANDA. O valor foi buscado uma vez, o relógio não para, e o drawer fica aberto
 *     enquanto a atendente conversa. Por isso `agora` é PARÂMETRO: quem exibe passa um instante
 *     que avança (`useRelogioDeIdade`), e "há 50 min" vira "há 1 h" sozinho. Uma idade
 *     congelada no instante da consulta seria uma segunda mentira em cima da primeira.
 *
 *   · SÃO DOIS CARIMBOS. `estoque_sincronizado_em` é do SALDO; `sincronizado_em` é do CADASTRO
 *     (descrição, preço, grupo). Estas funções não sabem de qual deles se trata — recebem o ISO
 *     que o chamador escolheu — e a tela só fala do saldo, porque é o saldo que ela mostra ao
 *     lado. Usar um no lugar do outro afirmaria a idade errada sobre o número certo.
 * ------------------------------------------------------------------ */

/**
 * Daqui em diante a idade do saldo é AVISO, e não só informação.
 *
 * Vinte e quatro horas é o dia inteiro de movimento da loja: um saldo de ontem pode ter sido
 * vendido hoje, e prometer entrega em cima dele é prometer o que ninguém conferiu. Abaixo disso
 * a idade é dita, calada — alarme em tudo é alarme em nada.
 */
export const IDADE_SALDO_AVISO_HORAS = 24;

const MS_MINUTO = 60 * 1000;
const MS_HORA = 60 * MS_MINUTO;
const MS_DIA = 24 * MS_HORA;

/**
 * Abaixo disto a idade é "agora".
 *
 * Noventa segundos, e não zero, por causa do relógio: o do servidor está 2–3 s adiantado em
 * relação ao do navegador (medido na auditoria de 10/10), então um carimbo recém-emitido chega
 * com idade NEGATIVA. Sem esta janela a tela diria "há -1 min" no caso mais favorável que
 * existe, que é o dado fresquíssimo.
 */
const JANELA_AGORA_MS = 90 * 1000;

/**
 * Quanto tempo faz, em linguagem de gente: `"agora"`, `"há 12 min"`, `"há 3 h"`, `"há 3 dias"`.
 *
 * Arredonda para BAIXO, como se fala: 3,6 dias é "há 3 dias", não "há 4". Carimbo no futuro
 * (relógio dessincronizado) cai em "agora" em vez de produzir idade negativa.
 *
 * @param {string|null|undefined} iso instante ISO-8601 vindo do backend
 * @param {number} [agora] instante de referência em ms — PARÂMETRO porque o relógio anda
 * @returns {string} vazio quando o carimbo não é uma data utilizável
 */
export function idadeLegivel(iso, agora = Date.now()) {
  if (typeof iso !== "string") return "";
  const t = Date.parse(iso.trim());
  if (!Number.isFinite(t)) return "";
  const base = typeof agora === "number" && Number.isFinite(agora) ? agora : Date.now();
  const delta = base - t;
  if (delta < JANELA_AGORA_MS) return "agora";
  if (delta < MS_HORA) return `há ${Math.floor(delta / MS_MINUTO)} min`;
  if (delta < MS_DIA) return `há ${Math.floor(delta / MS_HORA)} h`;
  const dias = Math.floor(delta / MS_DIA);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/**
 * A idade do SALDO, pronta para a tela — ou `null` quando não há carimbo.
 *
 * `null` é o caso em que não se escreve nada: a WM não mandou o carimbo (ou mandou algo que não
 * é data), e inventar "atualizado agora" seria exatamente o defeito que esta linha existe para
 * corrigir. Ausência de idade ≠ idade zero.
 *
 * @param {string|null|undefined} iso `estoque_sincronizado_em`
 * @param {number} [agora] instante de referência em ms
 * @returns {{ texto: string, idade: string, aviso: boolean, titulo: string }|null}
 */
export function idadeDoSaldo(iso, agora = Date.now()) {
  const idade = idadeLegivel(iso, agora);
  if (!idade) return null;
  const t = Date.parse(String(iso).trim());
  const base = typeof agora === "number" && Number.isFinite(agora) ? agora : Date.now();
  const aviso = base - t >= IDADE_SALDO_AVISO_HORAS * MS_HORA;
  return {
    texto: `Saldo atualizado ${idade}`,
    idade,
    aviso,
    // A consequência fica no título: o card diz a idade, e quem quiser saber o que fazer com
    // ela tem a frase inteira. Só no caso que pede ação — "atualizado agora" não pede nenhuma.
    titulo: aviso
      ? `O sistema da empresa sincronizou este saldo ${idade}. Confira o estoque antes de ` +
        "prometer entrega ao cliente."
      : "",
  };
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
  estoqueNegativo,
  TITULO_SALDO_NEGATIVO,
  idadeLegivel,
  idadeDoSaldo,
  IDADE_SALDO_AVISO_HORAS,
  precoNaoCadastrado,
  PRECO_NAO_CADASTRADO_ATE,
  TEXTO_PRECO_NAO_CADASTRADO,
  ETIQUETA_PRECO_NAO_CADASTRADO,
  TITULO_PRECO_NAO_CADASTRADO,
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
