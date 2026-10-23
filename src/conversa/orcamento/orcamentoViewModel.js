/**
 * Modelo de exibição da prévia e do resultado do orçamento WM.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 6.5 — as quatro
 * perguntas que a prévia responde; Sessão 5B).
 * Contrato: `backend/docs/wm/Integracao-ZapERP-API-WM-Atualizacao-2026-10-20` — §8 e §8.1
 * (prévia e preço), §10 e §11.1 (resultado da criação).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA LÓGICA NÃO VIVE DENTRO DO JSX
 * ────────────────────────────────────────────────────────────────────────────
 * As regras daqui são justamente as que quebram em silêncio: um total somado no cliente, um
 * preço derivado de `valor_total / quantidade`, um `cache_cloud` rotulado como "atual". Dentro
 * do JSX elas só se provariam renderizando componente; aqui são funções puras com teste em
 * Node, que é o que a suíte do frontend sabe rodar. O componente fica burro de propósito: ele
 * imprime o que este módulo decidiu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A ARITMÉTICA PROIBIDA
 * ────────────────────────────────────────────────────────────────────────────
 * Não existe uma única operação `+`, `*` ou `/` sobre valor monetário neste arquivo, e isso é
 * invariante, não estilo. §8.1 do guia proíbe recalcular preço; os totais (`valor_produtos`,
 * `valor_total`, `itens[].valor_total`) são o que a WM calculou, e é por eles que o ERP vai
 * gravar. Somar os itens aqui produziria, na melhor hipótese, o mesmo número — e na pior, um
 * total diferente do que será criado, com a tela parecendo mais confiável que a verdade.
 *
 * Campo ausente ou fora do padrão decimal chega como `null` do backend e sai daqui como "—"
 * (`formatMoedaOrcamento`), nunca "R$ 0,00": um zero plausível seria aprovado sem pestanejar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ORIGEM DO DADO: NUNCA CHAMAR CÓPIA DE "ATUAL"
 * ────────────────────────────────────────────────────────────────────────────
 * `meta.fonte` é opcional no contrato (o `openapi.yaml` modela `meta` apenas como `object`):
 *   · `tempo_real` comprovado ⇒ pode dizer "agora";
 *   · qualquer outra fonte conhecida (`cache_cloud`) ⇒ fala em CÓPIA, sem "atual"/"agora";
 *   · fonte ausente ⇒ **não se escreve nada**. Inventar "atual" num dado sem procedência é o
 *     erro que faz o atendente defender um preço que o ERP não vai honrar.
 */

import {
  formatMoedaOrcamento,
  formatQuantidadeExibicao,
  formatQuantidadeOrcamento,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  SEM_VALOR,
} from "./orcamentoFormat.js";

/* ------------------------------------------------------------------ *
 * Origem do dado
 * ------------------------------------------------------------------ */

/** Fonte conhecida que NÃO é tempo real. Explícita para não virar "atual" por descuido. */
export const FONTE_CACHE = "cache_cloud";

/**
 * Frase de procedência dos valores, ou `null` quando não há procedência a afirmar.
 *
 * @param {{fonte?: string|null, tempo_real?: boolean}|null|undefined} meta `previa.meta`
 * @returns {{ texto: string, tempoReal: boolean }|null}
 */
export function rotuloFonte(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (meta.tempo_real === true) {
    return { texto: "Valores consultados agora no sistema da empresa.", tempoReal: true };
  }
  const fonte = typeof meta.fonte === "string" ? meta.fonte.trim() : "";
  if (!fonte) return null;
  // Qualquer fonte que não seja tempo real comprovado é tratada como cópia. "Atual", "agora" e
  // "em tempo real" são palavras proibidas neste ramo.
  return {
    texto: "Valores vindos de uma cópia do sistema da empresa — podem ter mudado desde então.",
    tempoReal: false,
  };
}

/* ------------------------------------------------------------------ *
 * Política de bloqueio, em linguagem de negócio
 * ------------------------------------------------------------------ */

/**
 * Traduz `bloquear_apos_criar` sem usar o nome técnico.
 * Não booleano ⇒ `null`: o backend sempre resolve a política, e se um dia não resolver é melhor
 * calar do que afirmar que o orçamento fica (ou não fica) protegido.
 */
export function textoBloqueio(bloquear) {
  if (bloquear === true) {
    return "Depois de criado, o orçamento fica protegido contra alteração no sistema da empresa.";
  }
  if (bloquear === false) {
    return "Depois de criado, o orçamento continua podendo ser alterado no sistema da empresa.";
  }
  return null;
}

/** Estado de proteção JÁ APLICADO — vem do resultado da criação, não da política da prévia. */
export function textoBloqueado(bloqueado) {
  if (bloqueado === true) return "Está protegido contra alteração no sistema da empresa.";
  if (bloqueado === false) return "Pode ser alterado no sistema da empresa.";
  return null;
}

/* ------------------------------------------------------------------ *
 * Preço com mais de duas casas
 * ------------------------------------------------------------------ */

/**
 * A WM serializa preço como `0.00##` invariant e manda três casas quando precisa (`"33.038"`).
 * `formatMoedaOrcamento` exibe moeda em duas casas — então `33.038` aparece como `R$ 33,04`,
 * que é a forma correta de mostrar dinheiro, mas esconde a terceira casa.
 *
 * Esta função devolve o valor EXATO como a WM mandou (só a vírgula decimal trocada) quando há
 * casa além da segunda, para a área de detalhes mostrar o número sem corte. `null` quando duas
 * casas bastam — nada de repetir o mesmo número na tela.
 */
export function precoExatoTexto(valor) {
  if (typeof valor !== "string") return null;
  const decimais = valor.trim().split(".")[1];
  if (!decimais || decimais.length <= 2) return null;
  const exato = formatQuantidadeOrcamento(valor);
  return exato === SEM_VALOR ? null : exato;
}

/* ------------------------------------------------------------------ *
 * Candidatos de produto — correspondência exata × "outros com essa palavra"
 * ------------------------------------------------------------------ *
 * A WM resolve a busca direto num único produto quando o termo digitado é IGUAL à descrição
 * normalizada de algum item do catálogo — e nesse caso ela NÃO lista os outros que contêm a
 * palavra. Medido ao vivo na empresa 20: `filtro` devolvia 1 (existe um produto chamado
 * literalmente "FILTRO") enquanto `filtr` devolvia 468. Para a atendente, parecia que o
 * sistema não puxava todos os produtos.
 *
 * O backend passou a revelar os escondidos (doc 36, seção 10, pendência 15) e marca na
 * resposta o que é a correspondência exata e o que são os demais. Esta função é a tradução
 * disso para a tela — e é pura de propósito: o agrupamento é regra, não JSX.
 *
 * Quando não há dois grupos (produto resolvido sozinho, ou lista comum), `exato` é `null` e a
 * tela imprime uma lista só, exatamente como antes. Rotular um item como "exato" sem haver
 * outros com que contrastar seria ruído.
 */

/**
 * @param {object|null|undefined} data corpo de `POST /api/orcamentos/produtos/consultar`
 * @returns {{ exato: object|null, outros: object[], lista: object[], paginacao: object|null,
 *            metaDoPrecificado: object|null }}
 */
export function agruparCandidatosProduto(data) {
  const vazio = { exato: null, outros: [], lista: [], paginacao: null, metaDoPrecificado: null };
  if (!data || typeof data !== "object") return vazio;

  const paginacao = data.paginacao && typeof data.paginacao === "object" ? data.paginacao : null;

  // Procedência dos valores do produto que TEM preço. Nos dois ramos ela vem de lugares
  // diferentes, e trocá-las rotularia o preço com a fonte errada.
  const metaDoPrecificado =
    data.status === "produto" ? data.meta ?? null : data.correspondencia_exata_meta ?? null;

  // Produto resolvido sem irmãos revelados: uma linha só, sem rótulo e sem paginação (a WM não
  // manda paginação no ramo resolvido). Ele traz preço e estoque, e o card os mostra.
  if (data.status === "produto" && data.produto) {
    return {
      exato: null,
      outros: [],
      lista: [data.produto],
      paginacao: null,
      metaDoPrecificado,
    };
  }

  const comCodigo = (p) => Boolean(p && typeof p === "object" && p.codigo_produto_erp);
  const produtos = Array.isArray(data.produtos) ? data.produtos.filter(comCodigo) : [];

  const exato = comCodigo(data.correspondencia_exata) ? data.correspondencia_exata : null;
  if (!exato) return { exato: null, outros: [], lista: produtos, paginacao, metaDoPrecificado: null };

  const brutos = Array.isArray(data.outros_com_a_palavra) ? data.outros_com_a_palavra : produtos;
  const outros = brutos.filter(
    (p) => comCodigo(p) && p.codigo_produto_erp !== exato.codigo_produto_erp
  );

  // Marcado como exato mas sem ninguém para contrastar: volta a ser uma lista simples.
  if (!outros.length) return { exato: null, outros: [], lista: [exato], paginacao, metaDoPrecificado };

  return { exato, outros, lista: [exato, ...outros], paginacao, metaDoPrecificado };
}

/**
 * Texto do estado vazio da busca de produto.
 *
 * A busca da WM casa descrição/marca **por ocorrência do trecho** (`docs/wm/04-contratos-api.md`),
 * então a ORDEM das palavras importa: medido na empresa 20, `filtro oleo` acha e `oleo filtro`
 * devolve `PRODUTO_NAO_ENCONTRADO`. Quem digitou duas palavras e não achou nada precisa saber
 * disso — senão conclui que o produto não existe no sistema.
 *
 * Isto é só texto: nenhuma busca alternativa é disparada por conta própria (cada chamada à WM
 * pode custar dinheiro — seção 11 do doc 36).
 *
 * @param {string} termo o que a pessoa digitou
 * @returns {string}
 */
export function mensagemBuscaSemResultado(termo) {
  const limpo = String(termo ?? "").trim().replace(/\s+/g, " ");
  const palavras = limpo.length ? limpo.split(" ") : [];
  if (palavras.length < 2) return "Nenhum produto encontrado com esse nome.";
  return (
    `Nenhum produto encontrado com "${limpo}". A pesquisa procura as palavras juntas, ` +
    `na ordem digitada. Tente só uma palavra — por exemplo, "${palavras[0]}".`
  );
}

/* ------------------------------------------------------------------ *
 * Cliente: a busca é por PREFIXO, e produto é por trecho
 * ------------------------------------------------------------------ *
 * `docs/wm/04-contratos-api.md`: *"O Worker consulta dbo.Clientes, nome por prefixo com
 * `Latin1_General_CI_AI`, CPF/CNPJ/código por igualdade"*. Produto casa por OCORRÊNCIA, cliente
 * casa pelo COMEÇO do nome — regras diferentes no mesmo formulário.
 *
 * Medido no ERP real da empresa 20 (22/10): `DINIZ` e `SILVA` (sobrenomes) não acham nada,
 * `MARIA APARECIDA AMADEI` acha 3. Quem digita o sobrenome conclui que o cliente não existe.
 *
 * A saída existe e é boa: documento e código batem por IGUALDADE, então colar o CPF/CNPJ
 * funciona sempre. É isso que a mensagem oferece — sem disparar consulta nenhuma.
 */

/** Códigos de "não achei" que, no campo de cliente, merecem a explicação do prefixo. */
const CODIGOS_CLIENTE_NAO_ACHADO = Object.freeze([
  "WM_NAO_ENCONTRADO",
  "WM_CLIENTE_NAO_ENCONTRADO",
]);

/**
 * Explicação para quando a preparação não acha o cliente digitado.
 *
 * @param {string|null|undefined} codigo código do envelope de erro
 * @param {string|null|undefined} clienteBusca o que a pessoa digitou no campo de cliente
 * @returns {string} vazio quando não se aplica (e aí a mensagem do envelope fica sozinha)
 */
export function dicaClienteNaoEncontrado(codigo, clienteBusca) {
  if (!CODIGOS_CLIENTE_NAO_ACHADO.includes(String(codigo || ""))) return "";
  const digitado = String(clienteBusca ?? "").trim().replace(/\s+/g, " ");
  if (!digitado) return "";
  return (
    `Nenhum cliente começando com "${digitado}". A busca de cliente é pelo começo do nome — ` +
    "tente o primeiro nome, ou cole o CPF/CNPJ."
  );
}

/* ------------------------------------------------------------------ *
 * Cliente/vendedor canônicos
 * ------------------------------------------------------------------ */

/** `{ nome, codigo }` para exibição: nome em primeiro plano, código ERP só em detalhes. */
function canonicoView(objeto, chaveCodigo) {
  const fonte = objeto && typeof objeto === "object" ? objeto : null;
  return {
    nome: textoOuSemValor(fonte?.nome),
    codigo: textoOuSemValor(fonte?.[chaveCodigo]),
  };
}

/* ------------------------------------------------------------------ *
 * Prévia
 * ------------------------------------------------------------------ */

/**
 * Converte `previa_sanitizada` no que a tela imprime.
 *
 * Nada é somado, dividido ou multiplicado: `valor_produtos`, `valor_total` e o
 * `itens[].valor_total` saem do que a WM mandou. `unidade` ainda não vem no shape do backend
 * (`extrairPayloadCriacaoDaPrevia` não a projeta) — então é lida se existir e simplesmente
 * omitida se não, em vez de virar um "—" permanente em toda linha.
 *
 * @param {object|null|undefined} previa `preparacao.previa`
 */
export function montarPreviaView(previa) {
  if (!previa || typeof previa !== "object") return null;
  const brutos = Array.isArray(previa.itens) ? previa.itens : [];

  const itens = brutos.map((bruto, indice) => {
    const item = bruto && typeof bruto === "object" ? bruto : {};
    const codigoBruto = typeof item.codigo_produto_erp === "string" ? item.codigo_produto_erp : "item";
    const unidade =
      typeof item.unidade === "string" && item.unidade.trim() ? item.unidade.trim() : null;
    return {
      chave: `${codigoBruto}-${indice}`,
      codigo: textoOuSemValor(item.codigo_produto_erp),
      descricao: textoOuSemValor(item.descricao),
      // A unidade crua, para quem precisar dela sozinha; a tela não a imprime separada, porque
      // `quantidade` e `estoque` abaixo já a trazem coladas no número.
      unidade,
      // Quantidade e estoque saem como se LEEM: sem as casas vazias das três decimais da WM e
      // com a unidade colada (`"2.000"` + `UN` → `2 UN`). "2,000 × " seria lido como dois mil.
      quantidade: formatQuantidadeExibicao(item.quantidade, unidade),
      precoUnitario: formatMoedaOrcamento(item.preco_unitario),
      precoExato: precoExatoTexto(item.preco_unitario),
      valorTotal: formatMoedaOrcamento(item.valor_total),
      // Estoque previsto PODE SER NEGATIVO no contrato; é texto de exibição e não entra em conta.
      estoque: formatQuantidadeExibicao(item.estoque_previsto, unidade),
    };
  });

  return {
    cliente: canonicoView(previa.cliente, "codigo_cliente_erp"),
    vendedor: canonicoView(previa.vendedor, "codigo_vendedor_erp"),
    itens,
    quantidadeItens: itens.length,
    valorProdutos: formatMoedaOrcamento(previa.valor_produtos),
    valorTotal: formatMoedaOrcamento(previa.valor_total),
    bloqueio: textoBloqueio(previa.bloquear_apos_criar),
    fonte: rotuloFonte(previa.meta),
  };
}

/* ------------------------------------------------------------------ *
 * Resultado da criação
 * ------------------------------------------------------------------ */

/**
 * Converte `resultado_sanitizado` na tela de sucesso.
 *
 * **O número do orçamento é `codigo_pedido_erp`** (§10 e §13) — é por ele que o orçamento é
 * procurado no Icthus, e sem ele não há resultado para mostrar (`null`).
 *
 * ⚠️ `jaEstavaCriado` vem do NOSSO estado local da operação (ela já estava `CRIADO` antes desta
 * chamada?) e de lugar nenhum mais. §11.1 é explícito: o `200` da WM não distingue "criei
 * agora" de "resultado idempotente", e inferir a diferença por `meta.criado_em` é PROIBIDO.
 * Por isso o parâmetro é externo, e `resultado.meta.criado_em` não é lido em nenhum ponto.
 *
 * @param {object|null|undefined} resultado `operacao.resultado`
 * @param {{jaEstavaCriado?: boolean}} [opcoes] estado LOCAL da operação, nunca da resposta
 */
export function montarResultadoView(resultado, { jaEstavaCriado = false } = {}) {
  if (!resultado || typeof resultado !== "object") return null;
  const numero =
    typeof resultado.codigo_pedido_erp === "string" ? resultado.codigo_pedido_erp.trim() : "";
  if (!numero) return null;

  const idempotente = jaEstavaCriado === true;
  return {
    numero,
    // "Já estava criado" é afirmação sobre a NOSSA operação, nunca leitura da resposta da WM.
    jaEstavaCriado: idempotente,
    titulo: idempotente
      ? "Este orçamento já estava criado"
      : "Orçamento criado no sistema da empresa",
    documento:
      typeof resultado.documento_venda === "string" && resultado.documento_venda.trim()
        ? resultado.documento_venda.trim()
        : null,
    cliente: canonicoView(resultado.cliente, "codigo_cliente_erp"),
    vendedor: canonicoView(resultado.vendedor, "codigo_vendedor_erp"),
    valorTotal: formatMoedaOrcamento(resultado.valor_total),
    protecao: textoBloqueado(resultado.bloqueado),
    fonte: rotuloFonte(resultado.meta),
  };
}

/**
 * Linhas de item do resumo, a partir da PRÉVIA que foi confirmada.
 *
 * Os itens não vêm no `200` da criação (§10 só devolve número, documento, cliente, vendedor,
 * total e proteção) — eles vêm da prévia, que é exatamente o conjunto que virou `payload_hash`
 * e foi despachado byte a byte. Ou seja: continuam sendo dado oficial da WM, não reconstrução.
 *
 * Preço por unidade, como no template da Sessão 6 do doc 36 ("1 × Notebook — R$ 3.500,00"):
 * nada aqui multiplica, soma ou deriva valor.
 */
function linhasDeItem(previa) {
  const itens = previa && typeof previa === "object" && Array.isArray(previa.itens) ? previa.itens : [];
  const linhas = [];
  for (const bruto of itens) {
    const item = bruto && typeof bruto === "object" ? bruto : {};
    const descricao = textoOuSemValor(item.descricao);
    // Mesma leitura da prévia: sem as casas vazias e com a unidade. "2,000 × Mouse" na mensagem
    // do cliente seria lido como dois mil mouses — e o cliente não tem a prévia para conferir.
    const quantidade = formatQuantidadeExibicao(item.quantidade, item.unidade);
    const preco = formatMoedaOrcamento(item.preco_unitario);
    // Linha sem descrição ou sem preço não vira "— × — — —" na mensagem do cliente: some.
    if (descricao === SEM_VALOR || quantidade === SEM_VALOR || preco === SEM_VALOR) continue;
    linhas.push(`${quantidade} × ${descricao} — ${preco}`);
  }
  return linhas;
}

/**
 * Texto do resumo que o atendente revisa e envia ao cliente.
 *
 * Template FIXO com os dados oficiais da WM — **ele formata, não calcula**. Não inclui código
 * ERP de cliente/vendedor (jargão interno) e não inclui carimbo de tempo (`meta.criado_em` não
 * tem fuso no contrato, e uma hora errada no bolso do cliente é pior que nenhuma).
 *
 * Com a prévia em mãos sai o template da Sessão 6 do doc 36:
 *
 *   Olá, Maria Souza! Segue seu orçamento:
 *
 *   1 × Notebook Lenovo IdeaPad — R$ 3.500,00
 *   2 × Mouse sem fio — R$ 120,00
 *
 *   Total: R$ 3.740,00
 *   Orçamento: 12345
 *
 * O nome do cliente vai INTEIRO, como a WM o devolveu. Abreviar para o primeiro nome ficaria
 * simpático com "João da Silva" e esquisito com razão social ("Olá, COMERCIAL!") — e o nome
 * de um cliente não é lugar para adivinhação.
 *
 * Sem prévia (por exemplo depois de um F5, quando só há a operação lida do servidor) o resumo
 * cai para a forma curta, com número, cliente e total. Melhor um resumo curto e verdadeiro do
 * que uma lista de itens reconstruída de algum lugar.
 *
 * @param {object|null|undefined} resultado `operacao.resultado` (resultado sanitizado)
 * @param {{previa?: object|null}} [opcoes] prévia confirmada, para a lista de itens
 * @returns {string} vazio quando não há resultado utilizável
 */
export function montarResumoOrcamento(resultado, { previa = null } = {}) {
  const view = montarResultadoView(resultado);
  if (!view) return "";

  const itens = linhasDeItem(previa);
  if (!itens.length) {
    const linhas = [`Orçamento: ${view.numero}`];
    if (view.cliente.nome !== SEM_VALOR) linhas.push(`Cliente: ${view.cliente.nome}`);
    if (view.valorTotal !== SEM_VALOR) linhas.push(`Total: ${view.valorTotal}`);
    if (view.vendedor.nome !== SEM_VALOR) linhas.push(`Vendedor: ${view.vendedor.nome}`);
    return linhas.join("\n");
  }

  const abertura =
    view.cliente.nome === SEM_VALOR
      ? "Segue seu orçamento:"
      : `Olá, ${view.cliente.nome}! Segue seu orçamento:`;

  const linhas = [abertura, "", ...itens, ""];
  if (view.valorTotal !== SEM_VALOR) linhas.push(`Total: ${view.valorTotal}`);
  linhas.push(`Orçamento: ${view.numero}`);
  return linhas.join("\n");
}

/* ------------------------------------------------------------------ *
 * Assinatura: a prévia vale para UM conjunto de dados
 * ------------------------------------------------------------------ */

/**
 * Identidade do que foi orçado — cliente, vendedor, produtos e quantidades.
 *
 * Serve a uma regra só: **a prévia é de um conjunto de dados, não da tela**. Se cliente,
 * vendedor, produto ou quantidade mudar depois do cálculo, o preço e o total exibidos passam a
 * ser de outro orçamento. Comparar a assinatura de quando a prévia chegou com a do rascunho
 * atual é o que permite desabilitar o "Confirmar" em vez de gravar no ERP algo que o atendente
 * não viu.
 *
 * Página de ambiguidade (`cliente_pagina`, `produto_pagina`…) NÃO entra: é navegação, não
 * conteúdo do orçamento.
 */
function assinaturaDe({ cliente, vendedor, itens }) {
  return JSON.stringify([cliente, vendedor, itens]);
}

/** Referência de item: o código ERP quando já resolvido, senão o texto da busca. */
function refItem(codigo, busca) {
  const cod = typeof codigo === "string" ? codigo.trim() : "";
  if (cod) return `c:${cod}`;
  return `b:${typeof busca === "string" ? busca.trim() : ""}`;
}

/** Quantidade normalizada como SAI para o backend, para o rascunho e o corpo coincidirem. */
function refQuantidade(bruta) {
  const q = normalizarQuantidadeParaEnvio(bruta);
  return q.ok ? q.value : "!";
}

/** Assinatura do rascunho da tela (`useOrcamentoDraft`). */
export function assinaturaDoRascunho(rascunho) {
  if (!rascunho || typeof rascunho !== "object") return "";
  const itens = (Array.isArray(rascunho.itens) ? rascunho.itens : []).map((item) => [
    refItem(item?.codigo_produto_erp, item?.busca),
    refQuantidade(item?.quantidade),
  ]);
  return assinaturaDe({
    cliente: refItem(rascunho.clienteCodigoErp, rascunho.clienteBusca),
    vendedor: refItem(rascunho.vendedorCodigoErp, rascunho.vendedorBusca),
    itens,
  });
}

/** Assinatura do corpo que foi enviado a `POST /api/orcamentos/preparar`. */
export function assinaturaDoBody(body) {
  if (!body || typeof body !== "object") return "";
  const itens = (Array.isArray(body.itens) ? body.itens : []).map((item) => [
    refItem(item?.codigo_produto_erp, item?.busca),
    refQuantidade(item?.quantidade),
  ]);
  return assinaturaDe({
    cliente: refItem(body.cliente_codigo_erp, body.cliente_busca),
    vendedor: refItem(body.vendedor_codigo_erp, body.vendedor_busca),
    itens,
  });
}

export default {
  FONTE_CACHE,
  agruparCandidatosProduto,
  mensagemBuscaSemResultado,
  dicaClienteNaoEncontrado,
  rotuloFonte,
  textoBloqueio,
  textoBloqueado,
  precoExatoTexto,
  montarPreviaView,
  montarResultadoView,
  montarResumoOrcamento,
  assinaturaDoRascunho,
  assinaturaDoBody,
};
