/**
 * Preço e estoque dos itens do carrinho — as regras, sem React.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 11 — custo por chamada;
 * Sessão 5 — UX do drawer).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE CACHE EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * A LISTA de candidatos da WM (`multiplos_produtos`) não traz preço nem estoque — só
 * `codigo_produto_erp`, `descricao`, `marca` e `unidade`, e vem do cache cloud. Buscar o preço
 * dos 30 da página significaria 30 consultas em TEMPO REAL no SQL Server da própria loja a cada
 * busca; está fora de questão (seção 11).
 *
 * Então o preço é buscado no momento em que a atendente ESCOLHE o item: uma consulta, por
 * código, do produto que ela acabou de tocar. É o instante em que o valor importa (ela está
 * decidindo) e o único em que uma chamada se justifica.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NUNCA ACONTECE AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * Nada é derivado, somado, arredondado ou herdado. Um valor só existe nesta estrutura se a WM
 * mandou aquele campo para aquele código; a string decimal dela é copiada byte a byte (quem
 * formata é `orcamentoFormat.js`, e só para exibir). Ausência não vira zero, e preço de um
 * código nunca responde por outro.
 *
 * Também não há repetição automática: falha é definitiva para aquele toque. O "Calcular"
 * resolve preço de novo, no servidor, para o orçamento inteiro — por isso falhar aqui não pode
 * impedir ninguém de montar o orçamento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE CACHE É EFÊMERO, DE PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 * Ele vive em memória e morre ao fechar o drawer. Preço não entra no rascunho de
 * `sessionStorage`: a lista branca de `useOrcamentoDraft` o barra justamente para que um valor
 * velho não volte do storage parecendo atual.
 */

/** Campos de valor que a WM manda no produto RESOLVIDO. Nenhum outro é copiado. */
const CAMPOS_VALOR = Object.freeze(["preco_unitario", "estoque_previsto", "unidade", "ativo"]);

export const ESTADO_PRECO = Object.freeze({
  CARREGANDO: "carregando",
  OK: "ok",
  FALHOU: "falhou",
});

/**
 * O campo veio preenchido?
 *
 * `0` e `"0.000"` SÃO valores (estoque zerado é informação legítima e não bloqueia venda);
 * `null`, `undefined`, `""` e `"   "` são ausência. A diferença é a razão de ser desta função:
 * tratar `0` como ausência esconderia estoque zerado, e tratar ausência como `0` inventaria um
 * estoque que ninguém informou.
 */
export function valorPresente(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim().length > 0;
  if (typeof valor === "number") return Number.isFinite(valor);
  if (typeof valor === "boolean") return true;
  return false;
}

/**
 * Extrai os campos de valor de um produto, copiando só o que existe.
 *
 * @param {object|null|undefined} produto produto da WM (ramo resolvido ou candidato de lista)
 * @returns {object|null} objeto só com os campos presentes, ou `null` quando não há nenhum
 */
export function extrairValoresDoProduto(produto) {
  if (!produto || typeof produto !== "object") return null;
  const valores = {};
  for (const campo of CAMPOS_VALOR) {
    if (valorPresente(produto[campo])) valores[campo] = produto[campo];
  }
  return Object.keys(valores).length ? valores : null;
}

/** O produto já chega com preço? (ramo resolvido da consulta — então não se consulta de novo.) */
export function produtoJaTemPreco(produto) {
  return valorPresente(produto?.preco_unitario);
}

/**
 * Grupo e subgrupo do produto, quando a WM os mandou.
 *
 * Separados de `CAMPOS_VALOR` de propósito: estes são CLASSIFICAÇÃO, não dinheiro. Eles ajudam
 * a atendente a distinguir dois produtos de descrição parecida na tela de busca e não entram
 * no carrinho nem viajam para a criação — ao contrário de preço, estoque e unidade, que têm
 * consequência no orçamento.
 *
 * @returns {{grupo?: string, subgrupo?: string}|null} só com o que existe, ou `null`
 */
export function classificacaoDoProduto(produto) {
  if (!produto || typeof produto !== "object") return null;
  const out = {};
  for (const campo of ["grupo", "subgrupo"]) {
    const v = produto[campo];
    if (typeof v === "string" && v.trim()) out[campo] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Os CARIMBOS DE TEMPO do produto — de quando é o número que a tela vai mostrar.
 *
 * Separados de `CAMPOS_VALOR` pela mesma razão de `classificacaoDoProduto`: eles não são valor.
 * Nada aqui viaja para a criação, nada entra em conta nenhuma; são a procedência no tempo do
 * `estoque_previsto` que vem ao lado.
 *
 * São DOIS, e não são intercambiáveis (o backend os projeta separados de propósito):
 *   · `estoque_sincronizado_em` — quando a WM sincronizou o SALDO. É o que a tela diz, porque é
 *     o saldo que ela mostra, e é por ele que alguém promete entrega.
 *   · `sincronizado_em` — quando sincronizou o CADASTRO (descrição, preço, grupo). Outro
 *     carimbo, outra afirmação. Atravessa para quem precisar, e a tela não o mistura com o
 *     primeiro: dizer a idade do cadastro ao lado do saldo seria datar o número errado.
 *
 * @returns {{estoque_sincronizado_em?: string, sincronizado_em?: string}|null} só o que existe
 */
export function carimbosDoProduto(produto) {
  if (!produto || typeof produto !== "object") return null;
  const out = {};
  for (const campo of ["estoque_sincronizado_em", "sincronizado_em"]) {
    const v = produto[campo];
    if (typeof v === "string" && v.trim()) out[campo] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Lê a resposta de `POST /produtos/consultar` feita POR CÓDIGO.
 *
 * Só o ramo resolvido (`status: "produto"`) serve: é o único que traz preço, e é o que uma
 * consulta por identificador deve devolver. Qualquer outra forma é tratada como "não vieram
 * valores" — nunca como oportunidade de pescar um preço de dentro de uma lista.
 *
 * @returns {{ valores: object, classificacao: object|null, carimbos: object|null,
 *             meta: object|null }|null}
 */
export function valoresDaRespostaPorCodigo(data, codigoEsperado) {
  if (!data || typeof data !== "object") return null;
  if (data.status !== "produto") return null;
  const produto = data.produto;
  if (!produto || typeof produto !== "object") return null;
  // Resposta de outro código não responde por este. Vale para a corrida entre dois toques
  // rápidos e para qualquer confusão de roteamento no meio do caminho.
  if (codigoEsperado && produto.codigo_produto_erp !== codigoEsperado) return null;
  const valores = extrairValoresDoProduto(produto);
  if (!valores) return null;
  return {
    valores,
    classificacao: classificacaoDoProduto(produto),
    carimbos: carimbosDoProduto(produto),
    meta: data.meta && typeof data.meta === "object" ? data.meta : null,
  };
}

/**
 * Vale gastar uma chamada por este produto?
 *
 * Não vale quando: ele já veio com preço, quando já há entrada para o código (inclusive uma que
 * falhou — repetir sozinho queimaria chamada no servidor do cliente) ou quando não há código.
 */
export function precisaConsultarPreco(mapa, produto) {
  const codigo = produto?.codigo_produto_erp;
  if (typeof codigo !== "string" || !codigo) return false;
  if (produtoJaTemPreco(produto)) return false;
  return !(mapa && Object.prototype.hasOwnProperty.call(mapa, codigo));
}

/**
 * Procedência ÚNICA dos valores que estão na tela do carrinho, para `rotuloFonte`.
 *
 * Linhas diferentes podem ter vindo de fontes diferentes (uma resolvida em tempo real, outra
 * de cópia). Uma frase só precisa valer para todas, então vale a MAIS FRACA: basta uma linha
 * de cópia para o conjunto ser apresentado como cópia. Afirmar "consultado agora" sobre um
 * conjunto que tem valor de cópia seria afirmar o que não se sabe.
 *
 * @returns {object|null} meta no formato que `rotuloFonte` entende, ou `null` quando não há
 *   nenhum valor na tela (sem valor, não se fala de procedência)
 */
export function procedenciaDosValores(mapa) {
  if (!mapa || typeof mapa !== "object") return null;
  let temValor = false;
  let todasTempoReal = true;
  for (const entrada of Object.values(mapa)) {
    if (entrada?.estado !== ESTADO_PRECO.OK) continue;
    if (!valorPresente(entrada?.valores?.preco_unitario)) continue;
    temValor = true;
    // MESMA régua de `rotuloFonte`: só o booleano do backend (`tempo_real = fonte ===
    // 'tempo_real'`) prova tempo real. Aceitar a string aqui seria afirmar "consultado agora"
    // com base mais fraca do que a do único lugar que decide essa frase.
    if (entrada.meta?.tempo_real !== true) todasTempoReal = false;
  }
  if (!temValor) return null;
  return todasTempoReal ? { tempo_real: true } : { fonte: "cache_cloud" };
}

export default {
  ESTADO_PRECO,
  valorPresente,
  extrairValoresDoProduto,
  produtoJaTemPreco,
  classificacaoDoProduto,
  carimbosDoProduto,
  valoresDaRespostaPorCodigo,
  precisaConsultarPreco,
  procedenciaDosValores,
};
