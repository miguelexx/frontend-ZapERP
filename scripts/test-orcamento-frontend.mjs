/**
 * Guardas do frontend do orçamento WM (doc 36, Sessões 5 e 5B).
 *
 * Cobre o que quebraria em silêncio e com consequência real:
 *   1. o formatador de moeda PRÓPRIO — "—" para valor inválido, nunca "R$ 0,00" (lacuna 3);
 *   2. a quantidade que sai para o backend — `trim()` obrigatório e zero recusado;
 *   3. o timeout por URL — `confirmar` acima do teto do backend (lacuna 2);
 *   4. o rascunho em `sessionStorage` — escopo por empresa+usuário, prazo, varredura e a
 *      lista branca que impede preço/id de operação de voltar do storage;
 *   5. a prévia — valores exibidos COMO VIERAM, nada recalculado, `cache_cloud` nunca rotulado
 *      como "atual" e a assinatura que invalida a prévia quando os dados mudam;
 *   6. o resultado — o número é `codigo_pedido_erp`, e "já estava criado" nunca é inferido da
 *      resposta da WM (§11.1 proíbe);
 *   7. o vendedor lembrado — pré-preenche mas NÃO seleciona sozinho, é por empresa+usuário e
 *      some no logout;
 *   8. a sugestão de cliente — título de conversa que é só telefone não pré-preenche nada;
 *   9. o HTML de verdade das duas telas, renderizado com React (ver "render real" no fim).
 *
 * Nenhuma asserção faz rede: o render roda `renderToStaticMarkup` em memória e os componentes
 * não chamam serviço nenhum na montagem.
 *
 * Executar: node scripts/test-orcamento-frontend.mjs
 */

import {
  formatMoedaOrcamento,
  formatQuantidadeOrcamento,
  formatQuantidadeExibicao,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  sugestaoDeBuscaCliente,
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
  SEM_VALOR,
} from "../src/conversa/orcamento/orcamentoFormat.js";

import {
  agruparCandidatosProduto,
  mensagemBuscaSemResultado,
  candidatoRelevante,
  separarCandidatosPorRelevancia,
  fatiarDestaque,
  termoCasaNoTexto,
  tituloCandidatosRuido,
  termoDeResgate,
  mensagemResgateBusca,
  dicaClienteNaoEncontrado,
  mensagemBuscaClienteSemResultado,
  documentoDoCliente,
  agruparCandidatosCliente,
  tituloClientesEncontrados,
  traduzirErroBuscaCliente,
  dicaClienteEscolhidoRecusado,
  patchClienteDigitado,
  patchClienteEscolhido,
  AVISO_CLIENTE_NAO_DEFINITIVO,
  RECUPERACAO_CLIENTE_INDISPONIVEL,
  rotuloFonte,
  textoBloqueio,
  textoBloqueado,
  precoExatoTexto,
  descontoDoItemPrevia,
  itensSemPrecoCadastrado,
  avisoItensSemPreco,
  montarPreviaView,
  montarResultadoView,
  montarResumoOrcamento,
  assinaturaDoRascunho,
  assinaturaDoBody,
} from "../src/conversa/orcamento/orcamentoViewModel.js";

import {
  chaveProdutosFrequentes,
  lerProdutosFrequentes,
  registrarProdutoUsado,
  esquecerProdutoFrequente,
  limparProdutosFrequentes,
  pontuacaoFrequencia,
  FREQUENTES_TTL_MS,
  MAX_GUARDADOS,
  MAX_SUGERIDOS,
  MEIA_VIDA_DIAS,
} from "../src/conversa/orcamento/produtosFrequentes.js";

import {
  ESTADO_PRECO,
  valorPresente,
  extrairValoresDoProduto,
  produtoJaTemPreco,
  valoresDaRespostaPorCodigo,
  precisaConsultarPreco,
  procedenciaDosValores,
  classificacaoDoProduto,
  carimbosDoProduto,
} from "../src/conversa/orcamento/precoItemCache.js";

import {
  MOTIVO_ERP,
  lerStatusErp,
  avisoErpIndisponivel,
  erroSugereErpFora,
} from "../src/conversa/orcamento/erpDisponibilidade.js";

import {
  normalizarPrecoNegociado,
  baseOficialDoItem,
  podeDistribuirDesconto,
  distribuirDescontoFinal,
} from "../src/conversa/orcamento/precoNegociado.js";

import {
  resolveOrcamentoTimeoutMs,
  HTTP_TIMEOUT_ORCAMENTO_STATUS_MS,
  HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS,
  HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS,
  HTTP_TIMEOUT_ORCAMENTO_BUSCA_MS,
  resolveRequestTimeoutMs,
  HTTP_TIMEOUT_DEFAULT_MS,
} from "../src/api/httpTimeouts.js";

let passed = 0;
const falhas = [];
function assert(cond, msg) {
  if (cond) passed += 1;
  else falhas.push(msg);
}

/* ------------------------------------------------------------------ *
 * 1. Moeda — o fallback proibido é "R$ 0,00"
 * ------------------------------------------------------------------ */
for (const invalido of [null, undefined, "", "   ", "abc", "R$ 10", NaN, Infinity, {}, [], true, "1.2.3"]) {
  assert(
    formatMoedaOrcamento(invalido) === SEM_VALOR,
    `moeda: ${JSON.stringify(invalido)} deveria virar "${SEM_VALOR}" (um "R$ 0,00" aqui seria lido como preço real)`
  );
}
// Zero DE VERDADE é um valor, e continua sendo exibido como zero.
assert(/0,00/.test(formatMoedaOrcamento("0")), 'moeda: "0" é valor e deve virar R$ 0,00');
assert(/0,00/.test(formatMoedaOrcamento(0)), "moeda: 0 numérico deve virar R$ 0,00");
// Preço da WM vem como string `0.00##` invariant, com até 3+ decimais.
assert(/33,04|33,038/.test(formatMoedaOrcamento("33.038")), 'moeda: "33.038" deve formatar sem quebrar');
assert(formatMoedaOrcamento("3500") !== SEM_VALOR, 'moeda: "3500" é válido');

/* quantidade/estoque: estoque pode ser NEGATIVO no contrato (ex.: "-2.125") */
assert(formatQuantidadeOrcamento("-2.125") === "-2,125", "estoque negativo deve ser exibido, não escondido");
assert(formatQuantidadeOrcamento("3") === "3", "quantidade inteira não ganha casas inventadas");
assert(formatQuantidadeOrcamento("xx") === SEM_VALOR, "quantidade inválida vira —");
assert(textoOuSemValor("  ") === SEM_VALOR, "texto só com espaço vira —");
assert(textoOuSemValor("Notebook") === "Notebook", "texto válido passa inteiro");

/* ------------------------------------------------------------------ *
 * 2. Quantidade que sai para o backend
 * ------------------------------------------------------------------ */
{
  // O validador do backend recusa " 2 " por formato, de propósito — o trim é nosso.
  const r = normalizarQuantidadeParaEnvio("  2  ");
  assert(r.ok && r.value === "2", 'quantidade: " 2 " precisa sair como "2" (trim obrigatório)');
}
{
  const r = normalizarQuantidadeParaEnvio("1,5");
  assert(r.ok && r.value === "1.5", 'quantidade: vírgula do teclado BR precisa virar ponto');
}
for (const zero of ["0", "0.0", "0.000", " 0 "]) {
  assert(!normalizarQuantidadeParaEnvio(zero).ok, `quantidade: ${JSON.stringify(zero)} tem de ser recusado (o padrão da WM aceita zero)`);
}
for (const ruim of ["", "   ", "abc", "-1", "1.2.3", "1e3", "٣"]) {
  assert(!normalizarQuantidadeParaEnvio(ruim).ok, `quantidade: ${JSON.stringify(ruim)} tem de ser recusado`);
}
assert(normalizarQuantidadeParaEnvio("1".repeat(21)).ok === false, "quantidade longa demais é recusada");
assert(passoQuantidade("1", -1) === "1", "passo: piso é 1, não 0 nem negativo");
assert(passoQuantidade("1", 1) === "2", "passo: 1 + 1 = 2");
assert(passoQuantidade("1.5", 1) === "2.5", "passo: preserva a casa decimal digitada");
assert(passoQuantidade("abc", 1) === "1", "passo: texto inválido volta para 1");

/* ------------------------------------------------------------------ *
 * 2B. Quantidade EXIBIDA — "1,000" não é mil (doc 36, achado de 23/10)
 * ------------------------------------------------------------------ *
 * A WM serializa quantidade e estoque com três casas fixas: `"1.000"` é UMA peça. Exibido como
 * `1,000`, o olho lê mil — e um orçamento com a quantidade mil vezes maior sai pelo WhatsApp.
 * Aqui prova-se a régua de exibição E, logo abaixo, que ela NÃO vazou para o que é enviado.
 */
assert(formatQuantidadeExibicao("1.000") === "1", 'exibição: "1.000" da WM é UMA unidade, não mil');
assert(formatQuantidadeExibicao("13.000") === "13", 'exibição: "13.000" são treze, não treze mil');
assert(formatQuantidadeExibicao("100.000") === "100", 'exibição: "100.000" são cem, não cem mil');
assert(formatQuantidadeExibicao("2.000", "UN") === "2 UN", "exibição: a unidade do ERP vem colada");
assert(formatQuantidadeExibicao("100.000", "PC") === "100 PC", "exibição: saldo real com unidade");
// Fração DE VERDADE não é casa vazia: apagá-la mudaria a quantidade.
assert(formatQuantidadeExibicao("1.500", "M2") === "1,5 M2", 'exibição: meia unidade continua "1,5"');
assert(formatQuantidadeExibicao("1.050") === "1,05", "exibição: só os zeros do fim saem");
assert(formatQuantidadeExibicao("-2.125") === "-2,125", "exibição: negativo do ERP continua inteiro");
assert(formatQuantidadeExibicao("3", "CX") === "3 CX", "exibição: inteiro sem casas não ganha nada");
assert(formatQuantidadeExibicao("2.000", "  ") === "2", "exibição: unidade em branco não vira espaço solto");
assert(formatQuantidadeExibicao("xx", "UN") === SEM_VALOR, 'exibição: inválido continua "—", nunca "0 UN"');
assert(formatQuantidadeExibicao(null) === SEM_VALOR, 'exibição: ausência continua "—"');
// O formatador exato continua existindo e continua exato: os dois não são intercambiáveis.
assert(formatQuantidadeOrcamento("1.000") === "1,000", "exibição: o formatador exato não mudou de ideia");

/* O QUE É ENVIADO NÃO MUDA — a régua de ouro do módulo (§8.1, `payload_hash`).
   Mesmo valor, dois destinos: a tela lê "2 UN" e a WM recebe "2.000", byte a byte. */
for (const bruta of ["1.000", "2.000", "1.500", "100.000"]) {
  const enviado = normalizarQuantidadeParaEnvio(bruta);
  assert(
    enviado.ok && enviado.value === bruta,
    `envio: ${JSON.stringify(bruta)} tem de sair INTACTO para a WM — veio ${JSON.stringify(enviado.value)}`
  );
  assert(
    formatQuantidadeExibicao(bruta, "UN") !== enviado.value,
    `envio: o texto da tela (${formatQuantidadeExibicao(bruta, "UN")}) não pode ser o que viaja`
  );
}
// E a assinatura, que casa rascunho com corpo enviado, continua cega para a exibição.
assert(
  assinaturaDoRascunho({ itens: [{ codigo_produto_erp: "A1", quantidade: "2.000" }] }) ===
    assinaturaDoBody({ itens: [{ codigo_produto_erp: "A1", quantidade: "2.000" }] }),
  "envio: a assinatura continua sobre o valor cru, não sobre o texto exibido"
);

/* ------------------------------------------------------------------ *
 * 3. Timeout por URL (lacuna 2)
 * ------------------------------------------------------------------ */
assert(
  resolveOrcamentoTimeoutMs("/api/orcamentos/produtos/consultar") === HTTP_TIMEOUT_ORCAMENTO_BUSCA_MS,
  "timeout: busca de produto tem perfil próprio"
);
assert(
  resolveOrcamentoTimeoutMs("/api/orcamentos/preparar") === HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS,
  "timeout: preparar tem perfil próprio"
);
for (const url of [
  "/api/orcamentos/8a1f0e2c-0000-4000-8000-000000000000/confirmar",
  "/api/orcamentos/8a1f0e2c-0000-4000-8000-000000000000/verificar",
]) {
  assert(
    resolveOrcamentoTimeoutMs(url) === HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS,
    `timeout: ${url} usa o perfil de confirmação`
  );
}
// A REGRA: o navegador precisa esperar MAIS que o backend, senão aborta antes de receber o
// estado normalizado — e em criação de orçamento "não sei se gravou" é o pior resultado.
const TETO_ESCRITA_BACKEND_MS = 120_000; // wmApiClient: TIMEOUT_MAX_MS
assert(
  HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS > TETO_ESCRITA_BACKEND_MS,
  "timeout: confirmar precisa ser MAIOR que o teto de escrita do backend (120s)"
);
assert(
  HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS > HTTP_TIMEOUT_DEFAULT_MS,
  "timeout: confirmar precisa ser maior que o default global de 55s"
);
assert(resolveOrcamentoTimeoutMs("/api/produtos/consulta") === 0, "timeout: URL que não é de orçamento não é afetada");
assert(
  resolveRequestTimeoutMs({ url: "/api/orcamentos/preparar" }) === HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS,
  "timeout: o resolvedor global também conhece /api/orcamentos/*"
);
assert(
  resolveRequestTimeoutMs({ url: "/chats" }) === HTTP_TIMEOUT_DEFAULT_MS,
  "timeout: rota vizinha segue com o default (nada de regressão)"
);

/* ------------------------------------------------------------------ *
 * 4. Rascunho em sessionStorage
 * ------------------------------------------------------------------ */
class StorageFake {
  constructor({ lancar = false } = {}) {
    this.mapa = new Map();
    this.lancar = lancar;
  }
  get length() {
    if (this.lancar) throw new Error("storage bloqueado");
    return this.mapa.size;
  }
  key(i) {
    if (this.lancar) throw new Error("storage bloqueado");
    return Array.from(this.mapa.keys())[i] ?? null;
  }
  getItem(k) {
    if (this.lancar) throw new Error("storage bloqueado");
    return this.mapa.has(k) ? this.mapa.get(k) : null;
  }
  setItem(k, v) {
    if (this.lancar) throw new Error("storage bloqueado");
    this.mapa.set(k, String(v));
  }
  removeItem(k) {
    if (this.lancar) throw new Error("storage bloqueado");
    this.mapa.delete(k);
  }
}

globalThis.sessionStorage = new StorageFake();

const draft = await import("../src/conversa/orcamento/useOrcamentoDraft.js");
const {
  chaveRascunho,
  lerRascunho,
  gravarRascunho,
  apagarRascunho,
  limparRascunhosForaDeEscopo,
  RASCUNHO_TTL_MS,
} = draft;

const ESCOPO_A = { companyId: 1, userId: 10, conversaId: 77 };
const ESCOPO_B = { companyId: 2, userId: 20, conversaId: 77 };
const chaveA = chaveRascunho(ESCOPO_A);
const chaveB = chaveRascunho(ESCOPO_B);

assert(chaveA !== chaveB, "rascunho: empresas/usuários diferentes NÃO podem compartilhar chave");
assert(
  chaveRascunho({ companyId: 1, userId: 10, conversaId: 78 }) !== chaveA,
  "rascunho: conversas diferentes não compartilham chave"
);
// Chave resistente a separador injetado (`1:10` não pode colidir com `1` + `10`).
assert(
  chaveRascunho({ companyId: "1:10", userId: "", conversaId: 77 }) !==
    chaveRascunho({ companyId: "1", userId: "10", conversaId: 77 }),
  "rascunho: escopo não pode ser forjado por separador na chave"
);

const RASCUNHO = {
  clienteBusca: "Maria",
  clienteCodigoErp: "C123",
  clienteNome: "Maria Souza",
  vendedorBusca: "",
  vendedorCodigoErp: "V9",
  vendedorNome: "Carlos",
  itens: [{ codigo_produto_erp: "ABC1234", descricao: "Notebook", unidade: "UN", quantidade: "2" }],
};

assert(gravarRascunho(chaveA, RASCUNHO), "rascunho: gravação simples funciona");
{
  const lido = lerRascunho(chaveA);
  assert(lido?.clienteCodigoErp === "C123", "rascunho: volta a escolha de cliente");
  assert(lido?.itens?.[0]?.quantidade === "2", "rascunho: volta a quantidade");
  assert(lerRascunho(chaveB) === null, "rascunho: escopo B não lê o rascunho do escopo A");
}

// Lista branca: preço, total e id de operação NUNCA voltam do storage, mesmo escritos na chave.
{
  globalThis.sessionStorage.setItem(
    chaveA,
    JSON.stringify({
      v: 1,
      expiraEm: Date.now() + RASCUNHO_TTL_MS,
      rascunho: {
        ...RASCUNHO,
        preparacao_id: "8a1f0e2c-0000-4000-8000-000000000000",
        comando_id: "8a1f0e2c-0000-4000-8000-000000000001",
        total: "3500.00",
        telefone: "5511999999999",
        itens: [{ ...RASCUNHO.itens[0], preco_unitario: "3500.00", preco_confirmado: "3500.00" }],
      },
    })
  );
  const lido = lerRascunho(chaveA);
  const texto = JSON.stringify(lido);
  for (const proibido of ["preparacao_id", "comando_id", "total", "telefone", "preco_unitario", "preco_confirmado"]) {
    assert(!texto.includes(proibido), `rascunho: "${proibido}" não pode voltar do storage`);
  }
  assert(lido?.itens?.[0]?.codigo_produto_erp === "ABC1234", "rascunho: o que é legítimo continua voltando");
}

// Prazo curto: rascunho vencido não ressuscita (preço/estoque de ontem na cabeça de quem abandonou).
{
  gravarRascunho(chaveA, RASCUNHO, { agora: Date.now() - RASCUNHO_TTL_MS - 1000 });
  assert(lerRascunho(chaveA) === null, "rascunho: vencido não é lido");
  assert(globalThis.sessionStorage.getItem(chaveA) === null, "rascunho: vencido é removido na leitura");
}

// Varredura: troca de usuário no mesmo navegador apaga o que não é do escopo atual.
{
  gravarRascunho(chaveA, RASCUNHO);
  gravarRascunho(chaveB, RASCUNHO);
  globalThis.sessionStorage.setItem("outra_coisa_qualquer", "preservar");
  const removidas = limparRascunhosForaDeEscopo({ companyId: 1, userId: 10 });
  assert(removidas >= 1, "varredura: deveria remover ao menos a chave de outro escopo");
  assert(lerRascunho(chaveA) !== null, "varredura: o rascunho do escopo atual sobrevive");
  assert(globalThis.sessionStorage.getItem(chaveB) === null, "varredura: rascunho de outro usuário é apagado");
  assert(
    globalThis.sessionStorage.getItem("outra_coisa_qualquer") === "preservar",
    "varredura: não pode tocar em chaves de outros módulos"
  );
}

// Rascunho em branco não deixa chave para trás.
{
  gravarRascunho(chaveA, { clienteBusca: "", clienteCodigoErp: "", vendedorBusca: "", vendedorCodigoErp: "", itens: [] });
  assert(globalThis.sessionStorage.getItem(chaveA) === null, "rascunho: vazio não cria chave");
}

// Janela privada / storage bloqueado: nada pode lançar para fora.
{
  globalThis.sessionStorage = new StorageFake({ lancar: true });
  let explodiu = false;
  try {
    gravarRascunho(chaveA, RASCUNHO);
    lerRascunho(chaveA);
    apagarRascunho(chaveA);
    limparRascunhosForaDeEscopo({ companyId: 1, userId: 10 });
  } catch {
    explodiu = true;
  }
  assert(!explodiu, "rascunho: storage bloqueado não pode derrubar o orçamento");
  assert(lerRascunho(chaveA) === null, "rascunho: storage bloqueado lê como ausente");
}

// Sem sessionStorage nenhum (SSR / ambiente exótico).
{
  delete globalThis.sessionStorage;
  let explodiu = false;
  try {
    gravarRascunho(chaveA, RASCUNHO);
    lerRascunho(chaveA);
  } catch {
    explodiu = true;
  }
  assert(!explodiu, "rascunho: ausência de sessionStorage não pode lançar");
}

/* ------------------------------------------------------------------ *
 * 5. Prévia — valores COMO VIERAM, nada recalculado
 * ------------------------------------------------------------------ */

/**
 * Fixture com uma armadilha de propósito: `valor_total` do orçamento (`"1.00"`) é
 * DELIBERADAMENTE incoerente com os itens. Se a tela somasse itens em vez de usar o número da
 * WM, o total exibido não seria R$ 1,00 — e é esse o erro que o teste caça.
 */
const PREVIA_WM = {
  cliente: { codigo_cliente_erp: "C123", nome: "Maria Souza" },
  vendedor: { codigo_vendedor_erp: "V9", nome: "Carlos Lima" },
  itens: [
    {
      codigo_produto_erp: "ABC1234",
      descricao: "Notebook",
      quantidade: "2.000",
      preco_unitario: "33.038",
      estoque_previsto: "-2.125",
      valor_total: "66.076",
    },
    {
      codigo_produto_erp: "ZZZ9",
      descricao: "Mouse",
      unidade: "UN",
      quantidade: "1.000",
      // Preço ausente E valor do item ausente: tem de virar "—" nos dois, nunca "R$ 0,00".
      preco_unitario: null,
      estoque_previsto: null,
      valor_total: null,
    },
  ],
  valor_produtos: "91.076",
  valor_total: "1.00",
  bloquear_apos_criar: true,
  meta: { fonte: "cache_cloud", tempo_real: false },
};

/*
  Prévia com um item SEM PREÇO CADASTRADO: `"0.010"` é o que a WM devolve para produto sem
  preço no Icthus (5 de 24 amostrados na Tijolar em 25/10/2026). Fica aqui, com as outras
  fixtures, porque o render real a usa antes da seção que prova as regras.
*/
const PREVIA_SEM_PRECO = {
  cliente: { codigo_cliente_erp: "C1", nome: "Construtora Diniz" },
  vendedor: { codigo_vendedor_erp: "V1", nome: "Carlos Lima" },
  itens: [
    {
      codigo_produto_erp: "4325",
      descricao: "CIMENTO CAMPEAO AZUL CP 2 E 32 50KG",
      unidade: "UN",
      quantidade: "10.000",
      preco_unitario: "33.038",
      valor_total: "330.380",
    },
    {
      codigo_produto_erp: "9001",
      descricao: "AREIA MEDIA LAVADA M3",
      unidade: "M3",
      quantidade: "2.000",
      // O sentinela medido: produto sem preço no Icthus da loja.
      preco_unitario: "0.010",
      valor_total: "0.020",
    },
  ],
  valor_produtos: "330.400",
  valor_total: "330.400",
  bloquear_apos_criar: true,
  meta: { fonte: "tempo_real", tempo_real: true },
};

{
  const view = montarPreviaView(PREVIA_WM);
  assert(view !== null, "prévia: fixture do contrato tem de produzir view");
  assert(view.quantidadeItens === 2, "prévia: conta os itens que a WM mandou");

  // O total é o da WM, não uma soma da tela.
  assert(
    view.valorTotal === formatMoedaOrcamento("1.00"),
    "prévia: o total é o `valor_total` da WM — somar itens no cliente é proibido (§8.1)"
  );
  assert(
    view.valorProdutos === formatMoedaOrcamento("91.076"),
    "prévia: `valor_produtos` sai como veio"
  );

  const [item1, item2] = view.itens;
  // A WM manda três casas fixas. Exibi-las ("2,000") faz a atendente ler DOIS MIL.
  assert(item1.quantidade === "2", 'prévia: "2.000" da WM é exibido como "2" — "2,000" se lê como dois mil');
  assert(
    item2.quantidade === "1 UN",
    'prévia: a unidade anda colada na quantidade — "1" sozinho não diz se é peça, metro ou caixa'
  );
  assert(item1.precoUnitario === formatMoedaOrcamento("33.038"), "prévia: preço unitário é o da WM");
  assert(item1.precoExato === "33,038", "prévia: a 3ª casa do preço aparece exata nos detalhes");
  assert(item1.valorTotal === formatMoedaOrcamento("66.076"), "prévia: valor do item é o da WM");
  // Casa decimal que SIGNIFICA alguma coisa continua inteira — aqui não há nada a enxugar.
  assert(item1.estoque === "-2,125", "prévia: estoque negativo é exibido, não escondido");

  // A regra mais importante: preço AUSENTE não é derivado de `valor_total / quantidade`.
  assert(item2.precoUnitario === SEM_VALOR, 'prévia: preço ausente vira "—"');
  assert(item2.valorTotal === SEM_VALOR, 'prévia: valor do item ausente vira "—"');
  assert(item2.precoExato === null, "prévia: sem preço não há valor exato a mostrar");
  assert(item2.estoque === SEM_VALOR, 'prévia: estoque ausente vira "—"');
  assert(item2.unidade === "UN", "prévia: unidade é exibida quando a WM a manda");
  assert(item1.unidade === null, "prévia: unidade ausente é omitida, não vira — em toda linha");
}

// Preço derivável: se alguém algum dia dividir, este caso acusa.
{
  const view = montarPreviaView({
    ...PREVIA_WM,
    itens: [{ codigo_produto_erp: "A1", descricao: "X", quantidade: "2.000", preco_unitario: null, valor_total: "100.00" }],
  });
  assert(
    view.itens[0].precoUnitario === SEM_VALOR,
    "prévia: com `valor_total` 100 e quantidade 2, o preço NÃO pode aparecer como R$ 50,00"
  );
  assert(
    view.itens[0].valorTotal === formatMoedaOrcamento("100.00"),
    "prévia: o valor do item continua sendo o da WM"
  );
}

// Cliente/vendedor sem nome canônico: "—", nunca o código no lugar do nome.
{
  const view = montarPreviaView({
    ...PREVIA_WM,
    cliente: { codigo_cliente_erp: "C9", nome: null },
    vendedor: null,
  });
  assert(view.cliente.nome === SEM_VALOR, 'prévia: cliente sem nome vira "—"');
  assert(view.cliente.codigo === "C9", "prévia: o código continua disponível para os detalhes");
  assert(view.vendedor.nome === SEM_VALOR, 'prévia: vendedor ausente vira "—"');
  assert(view.vendedor.codigo === SEM_VALOR, 'prévia: código de vendedor ausente vira "—"');
}

assert(montarPreviaView(null) === null, "prévia: sem prévia não se inventa tela");
assert(montarPreviaView("x") === null, "prévia: prévia que não é objeto não produz view");
assert(montarPreviaView({ cliente: {}, vendedor: {} }).quantidadeItens === 0, "prévia: sem itens, zero itens");

/* ---- Origem do dado: cache NUNCA é "atual" ---- */
const PROIBIDO_EM_CACHE = /\batual|\bagora\b|tempo\s*real/i;
{
  const cache = rotuloFonte({ fonte: "cache_cloud", tempo_real: false });
  assert(cache !== null, "fonte: `cache_cloud` tem frase própria");
  assert(cache.tempoReal === false, "fonte: `cache_cloud` não é tempo real");
  assert(
    !PROIBIDO_EM_CACHE.test(cache.texto),
    `fonte: cópia não pode ser chamada de atual/agora/tempo real — veio "${cache.texto}"`
  );
  assert(/cópia/i.test(cache.texto), "fonte: a frase de cache precisa dizer que é cópia");
}
{
  const real = rotuloFonte({ fonte: "tempo_real", tempo_real: true });
  assert(real?.tempoReal === true, "fonte: tempo real comprovado é tempo real");
  assert(/agora/i.test(real.texto), 'fonte: com prova de tempo real pode dizer "agora"');
}
// Fonte desconhecida vira cópia, não "atual": o enum não é fechado no contrato.
{
  const outra = rotuloFonte({ fonte: "fonte_nova_qualquer" });
  assert(outra !== null && outra.tempoReal === false, "fonte: valor desconhecido é tratado como cópia");
  assert(!PROIBIDO_EM_CACHE.test(outra.texto), "fonte: valor desconhecido também não pode virar atual");
}
for (const semFonte of [null, undefined, {}, { fonte: "" }, { fonte: 42 }, "x"]) {
  assert(
    rotuloFonte(semFonte) === null,
    `fonte: ${JSON.stringify(semFonte)} não tem procedência — a tela não escreve nada`
  );
}
// `tempo_real` só conta como `true` literal (o backend o deriva de prova explícita).
assert(rotuloFonte({ fonte: "cache_cloud", tempo_real: "true" })?.tempoReal === false, "fonte: string 'true' não vale como prova");

/* ---- Bloqueio em linguagem de negócio ---- */
{
  const sim = textoBloqueio(true);
  const nao = textoBloqueio(false);
  assert(typeof sim === "string" && sim.length > 0, "bloqueio: política `true` tem frase");
  assert(typeof nao === "string" && nao.length > 0, "bloqueio: política `false` tem frase");
  assert(sim !== nao, "bloqueio: as duas políticas não podem dizer a mesma coisa");
  for (const frase of [sim, nao, textoBloqueado(true), textoBloqueado(false)]) {
    assert(!/bloquear_apos_criar|bloqueado|flag/i.test(frase), `bloqueio: nome técnico vazou em "${frase}"`);
  }
}
for (const naoBooleano of [null, undefined, "true", 1, {}]) {
  assert(
    textoBloqueio(naoBooleano) === null,
    `bloqueio: ${JSON.stringify(naoBooleano)} não autoriza afirmar nada sobre proteção`
  );
  assert(textoBloqueado(naoBooleano) === null, "bloqueio: estado não booleano também cala");
}

/* ---- Preço exato só quando há casa além da segunda ---- */
assert(precoExatoTexto("33.038") === "33,038", "preço exato: 3 casas aparecem");
assert(precoExatoTexto("25.00") === null, "preço exato: 2 casas não precisam de repetição");
assert(precoExatoTexto("25") === null, "preço exato: inteiro não precisa de repetição");
assert(precoExatoTexto(null) === null, "preço exato: ausente não produz texto");
assert(precoExatoTexto(33.038) === null, "preço exato: número (não string) não é tratado como decimal da WM");

/* ------------------------------------------------------------------ *
 * 6. Resultado da criação — o número é `codigo_pedido_erp`
 * ------------------------------------------------------------------ */

const RESULTADO_WM = {
  codigo_pedido_erp: "123456",
  documento_venda: "2 - Orçamento",
  cliente: { codigo_cliente_erp: "C123", nome: "Maria Souza" },
  vendedor: { codigo_vendedor_erp: "V9", nome: "Carlos Lima" },
  valor_total: "3500.00",
  bloqueado: true,
  meta: { fonte: "tempo_real", tempo_real: true, criado_em: "2026-10-20T15:40:00" },
};

{
  const view = montarResultadoView(RESULTADO_WM);
  assert(view?.numero === "123456", "resultado: o número do orçamento é `codigo_pedido_erp`");
  assert(view.valorTotal === formatMoedaOrcamento("3500.00"), "resultado: total sai como veio");
  assert(view.documento === "2 - Orçamento", "resultado: `documento_venda` é rótulo de exibição");
  assert(view.cliente.nome === "Maria Souza", "resultado: cliente por nome");
  assert(typeof view.protecao === "string" && view.protecao.length > 0, "resultado: proteção tem frase");
}

// Sem `codigo_pedido_erp` não há resultado: nada de id interno parecendo número de orçamento.
for (const semNumero of [
  { ...RESULTADO_WM, codigo_pedido_erp: undefined },
  { ...RESULTADO_WM, codigo_pedido_erp: "" },
  { ...RESULTADO_WM, codigo_pedido_erp: "   " },
  { ...RESULTADO_WM, codigo_pedido_erp: 123456 },
  null,
]) {
  assert(
    montarResultadoView(semNumero) === null,
    "resultado: sem `codigo_pedido_erp` string não se monta tela de sucesso"
  );
}

/* ---- "Já estava criado" vem do NOSSO estado, nunca da resposta (§11.1) ---- */
{
  const agora = montarResultadoView(RESULTADO_WM, { jaEstavaCriado: false });
  const antes = montarResultadoView(RESULTADO_WM, { jaEstavaCriado: true });
  assert(agora.jaEstavaCriado === false, "resultado: default é 'criado agora'");
  assert(antes.jaEstavaCriado === true, "resultado: estado local pode dizer 'já estava criado'");
  assert(agora.titulo !== antes.titulo, "resultado: os dois casos têm títulos diferentes");
  assert(/já estava/i.test(antes.titulo), "resultado: o título idempotente é explícito");

  // Trocar SÓ `meta.criado_em` não pode mudar nada: inferir por ele é proibido.
  const outroCarimbo = montarResultadoView(
    { ...RESULTADO_WM, meta: { ...RESULTADO_WM.meta, criado_em: "2001-01-01T00:00:00" } },
    { jaEstavaCriado: false }
  );
  assert(
    outroCarimbo.titulo === agora.titulo,
    "resultado: `meta.criado_em` NÃO pode influenciar 'criado agora' × 'já estava criado' (§11.1)"
  );
  const semCarimbo = montarResultadoView({ ...RESULTADO_WM, meta: { fonte: "tempo_real", tempo_real: true } });
  assert(semCarimbo.titulo === agora.titulo, "resultado: ausência de carimbo também não muda o título");
  assert(
    !JSON.stringify(agora).includes("criado_em"),
    "resultado: `criado_em` não atravessa para a view (nada o lê para decidir)"
  );
  assert(
    !/criado_agora|reaproveitado|idempotente/.test(JSON.stringify(Object.keys(agora))),
    "resultado: nenhum campo de saída nomeia o que a WM não distingue"
  );
}

/* ---- Resumo para o cliente ---- */
{
  const resumo = montarResumoOrcamento(RESULTADO_WM);
  assert(resumo.includes("123456"), "resumo: tem de carregar o número do orçamento");
  assert(resumo.includes("Maria Souza"), "resumo: tem o nome do cliente");
  assert(resumo.includes(formatMoedaOrcamento("3500.00")), "resumo: tem o total da WM");
  assert(!resumo.includes("C123") && !resumo.includes("V9"), "resumo: código ERP é jargão interno, não vai ao cliente");
  assert(!/criado_em|2026-10-20/.test(resumo), "resumo: carimbo sem fuso não vai ao cliente");
  assert(montarResumoOrcamento(null) === "", "resumo: sem resultado, texto vazio");
  assert(montarResumoOrcamento({ codigo_pedido_erp: "" }) === "", "resumo: sem número, texto vazio");
}
{
  // Campos ausentes somem do resumo em vez de virar linha "Cliente: —".
  const resumo = montarResumoOrcamento({ codigo_pedido_erp: "77", cliente: null, valor_total: null });
  assert(resumo === "Orçamento: 77", `resumo: linha sem dado é omitida — veio "${resumo}"`);
}

/* ---- Resumo COM a prévia: o template da Sessão 6 (formata, não calcula) ---- */
{
  const previa = {
    itens: [
      { descricao: "Notebook Lenovo IdeaPad", quantidade: "1.000", preco_unitario: "3500.00" },
      { descricao: "Mouse sem fio", quantidade: "2.000", preco_unitario: "120.00" },
    ],
  };
  const resumo = montarResumoOrcamento(RESULTADO_WM, { previa });

  assert(resumo.startsWith("Olá, Maria Souza! Segue seu orçamento:"), `resumo: abertura do template — veio "${resumo.split("\n")[0]}"`);
  assert(
    resumo.includes(`1 × Notebook Lenovo IdeaPad — ${formatMoedaOrcamento("3500.00")}`),
    "resumo: item com quantidade e preço unitário, no formato do doc 36"
  );
  assert(
    resumo.includes(`2 × Mouse sem fio — ${formatMoedaOrcamento("120.00")}`),
    "resumo: quantidade sem casas vazias — '2,000 ×' confundiria o cliente"
  );
  assert(resumo.includes(`Total: ${formatMoedaOrcamento("3500.00")}`), "resumo: o total é o do RESULTADO da WM");
  assert(resumo.trim().endsWith("Orçamento: 123456"), "resumo: o número fecha a mensagem");

  // A regra que não pode cair: nada é somado nem multiplicado. O total do resultado (3500,00)
  // é incoerente com os itens de propósito — 3500 + 2×120 daria 3740.
  assert(!resumo.includes("3.740"), "resumo: o total NÃO pode ser a soma dos itens feita na tela");
  assert(!resumo.includes("C123") && !resumo.includes("V9"), "resumo: código ERP continua fora da mensagem do cliente");
  assert(!/criado_em|2026-10-20/.test(resumo), "resumo: carimbo sem fuso continua fora");
}
{
  // Quantidade fracionária real continua legível, e item sem preço não vira linha quebrada.
  const previa = {
    itens: [
      { descricao: "Cabo", quantidade: "1.500", preco_unitario: "10.00" },
      { descricao: "Sem preço", quantidade: "1", preco_unitario: null },
      { descricao: null, quantidade: "1", preco_unitario: "5.00" },
    ],
  };
  const resumo = montarResumoOrcamento(RESULTADO_WM, { previa });
  assert(resumo.includes("1,5 × Cabo"), `resumo: 1.500 vira "1,5" — veio "${resumo}"`);
  assert(!resumo.includes("1,500"), "resumo: as casas vazias da WM não chegam ao cliente");
}
{
  // A unidade vai junto também na mensagem do cliente: "2 × Piso" num item vendido em M2
  // deixaria o cliente somando peças onde o ERP conta metros quadrados.
  const resumo = montarResumoOrcamento(RESULTADO_WM, {
    previa: { itens: [{ descricao: "Piso", unidade: "M2", quantidade: "2.500", preco_unitario: "10.00" }] },
  });
  assert(resumo.includes("2,5 M2 × Piso"), `resumo: unidade acompanha a quantidade — veio "${resumo}"`);
  assert(!resumo.includes("Sem preço"), "resumo: item sem preço some em vez de virar '— '");
  assert(!resumo.includes("— × "), "resumo: item sem descrição some em vez de virar linha vazia");
}
{
  // Sem prévia (F5, leitura da operação) o resumo cai para a forma curta — e continua honesto.
  const curto = montarResumoOrcamento(RESULTADO_WM, { previa: null });
  assert(curto.startsWith("Orçamento: 123456"), "resumo: sem prévia, forma curta");
  assert(!curto.includes("×"), "resumo: sem prévia não se inventa lista de itens");
  const semItens = montarResumoOrcamento(RESULTADO_WM, { previa: { itens: [] } });
  assert(semItens === curto, "resumo: prévia sem itens cai para a mesma forma curta");
}

/* ------------------------------------------------------------------ *
 * 7. Assinatura — a prévia é de UM conjunto de dados
 * ------------------------------------------------------------------ */
{
  const rascunhoBase = {
    clienteBusca: "Maria",
    clienteCodigoErp: "",
    vendedorCodigoErp: "V9",
    vendedorBusca: "",
    itens: [{ codigo_produto_erp: "ABC1234", busca: "", quantidade: "  2  " }],
  };
  const bodyBase = {
    conversa_id: 77,
    cliente_busca: "Maria",
    vendedor_codigo_erp: "V9",
    itens: [{ codigo_produto_erp: "ABC1234", quantidade: "2" }],
  };
  assert(
    assinaturaDoRascunho(rascunhoBase) === assinaturaDoBody(bodyBase),
    "assinatura: rascunho e corpo enviado têm de coincidir (inclusive com o trim da quantidade)"
  );

  const mudaQuantidade = { ...rascunhoBase, itens: [{ ...rascunhoBase.itens[0], quantidade: "3" }] };
  assert(
    assinaturaDoRascunho(mudaQuantidade) !== assinaturaDoBody(bodyBase),
    "assinatura: mudar quantidade invalida a prévia"
  );
  assert(
    assinaturaDoRascunho({ ...rascunhoBase, clienteBusca: "Maria S" }) !== assinaturaDoBody(bodyBase),
    "assinatura: mudar cliente invalida a prévia"
  );
  assert(
    assinaturaDoRascunho({ ...rascunhoBase, vendedorCodigoErp: "V10" }) !== assinaturaDoBody(bodyBase),
    "assinatura: mudar vendedor invalida a prévia"
  );
  assert(
    assinaturaDoRascunho({ ...rascunhoBase, itens: [] }) !== assinaturaDoBody(bodyBase),
    "assinatura: remover item invalida a prévia"
  );
  assert(
    assinaturaDoRascunho({
      ...rascunhoBase,
      itens: [...rascunhoBase.itens, { codigo_produto_erp: "ZZZ9", quantidade: "1" }],
    }) !== assinaturaDoBody(bodyBase),
    "assinatura: adicionar item invalida a prévia"
  );

  // Página de ambiguidade é navegação: não pode invalidar a prévia.
  assert(
    assinaturaDoBody({ ...bodyBase, cliente_pagina: 2 }) === assinaturaDoBody(bodyBase),
    "assinatura: página de ambiguidade não faz parte do conteúdo do orçamento"
  );
  assert(
    assinaturaDoBody({ ...bodyBase, conversa_id: 999 }) === assinaturaDoBody(bodyBase),
    "assinatura: a conversa não entra (o drawer já reinicia ao trocar de conversa)"
  );
  // Quantidade inválida não pode colidir com uma válida.
  assert(
    assinaturaDoRascunho({ ...rascunhoBase, itens: [{ codigo_produto_erp: "ABC1234", quantidade: "x" }] }) !==
      assinaturaDoBody(bodyBase),
    "assinatura: quantidade inválida não pode assinar igual a uma válida"
  );
  assert(assinaturaDoRascunho(null) === "", "assinatura: sem rascunho, assinatura vazia");
  assert(assinaturaDoBody(null) === "", "assinatura: sem corpo, assinatura vazia");
}

/* ------------------------------------------------------------------ *
 * 8. Sugestão de cliente — título que é telefone não pré-preenche
 * ------------------------------------------------------------------ */
for (const telefone of [
  "5511999999999",
  "11999999999",
  "(11) 99999-9999",
  "+55 11 99999-9999",
  "  11 99999 9999  ",
  "11.99999.9999",
  "+5511999999999",
]) {
  assert(
    sugestaoDeBuscaCliente(telefone) === "",
    `sugestão: título "${telefone}" é telefone — pré-preencher faria a busca por NOME falhar`
  );
}
assert(sugestaoDeBuscaCliente("Maria Souza") === "Maria Souza", "sugestão: nome de verdade passa");
assert(sugestaoDeBuscaCliente("  Maria Souza  ") === "Maria Souza", "sugestão: nome é aparado");
assert(sugestaoDeBuscaCliente("Posto 3 Irmãos") === "Posto 3 Irmãos", "sugestão: número no meio do nome não é telefone");
assert(sugestaoDeBuscaCliente("Loja 2") === "Loja 2", "sugestão: nome curto com número continua nome");
for (const vazio of ["", "   ", null, undefined, 42, {}]) {
  assert(sugestaoDeBuscaCliente(vazio) === "", `sugestão: ${JSON.stringify(vazio)} não sugere nada`);
}
assert(sugestaoDeBuscaCliente("N".repeat(300)).length === 100, "sugestão: nome gigante é cortado em 100");

/* ------------------------------------------------------------------ *
 * 9. Vendedor lembrado — sugestão, nunca mapeamento automático
 * ------------------------------------------------------------------ */

globalThis.localStorage = new StorageFake();
globalThis.sessionStorage = new StorageFake();

const vend = await import("../src/conversa/orcamento/vendedorLembrado.js");
const {
  chaveVendedorLembrado,
  lerVendedorLembrado,
  gravarVendedorLembrado,
  esquecerVendedorLembrado,
  limparVendedoresLembrados,
  VENDEDOR_TTL_MS,
} = vend;

const { prefillRascunho } = draft;

/* ---- Pré-preenche, mas a origem fica marcada ---- */
{
  const comMemoria = prefillRascunho({
    clienteNomeSugerido: "Maria Souza",
    vendedorLembrado: { codigo: "V9", nome: "Carlos Lima" },
  });
  assert(comMemoria.vendedorCodigoErp === "V9", "vendedor lembrado: o código é pré-preenchido");
  assert(comMemoria.vendedorNome === "Carlos Lima", "vendedor lembrado: o nome aparece ao atendente");
  assert(
    comMemoria.vendedorDeMemoria === true,
    "vendedor lembrado: a origem é MARCADA — lembrança não tem a mesma cara de confirmação da WM"
  );
  assert(comMemoria.vendedorBusca === "", "vendedor lembrado: a memória entra como código, não como texto de busca");
  assert(comMemoria.clienteBusca === "Maria Souza", "vendedor lembrado: a sugestão de cliente é independente");
}

/* ----------------------------------------------------------------------- *
 * Sem memória o campo nasce VAZIO — o `user.nome` não é mais palpite
 * ----------------------------------------------------------------------- *
 * Medido contra o Icthus da empresa piloto: os vendedores cadastrados são FINANCEIRO,
 * MARKONY, RAFAEL LUIZ SILVA, ROBSON DO NASCIMENTO LOURES e SAMUEL (total: 5, sem outras
 * páginas). Nome de atendente não está lá — então pré-preencher com ele garantia um
 * `VENDEDOR_NAO_ENCONTRADO` na primeira tentativa de todo atendente novo.
 */
{
  const semMemoria = prefillRascunho({ vendedorLembrado: null });
  assert(semMemoria.vendedorBusca === "", "vendedor: sem memória o campo nasce VAZIO (nada de `user.nome`)");
  assert(semMemoria.vendedorCodigoErp === "", "vendedor: nunca há código sem a WM ter resolvido");
  assert(semMemoria.vendedorDeMemoria === false, "vendedor: campo vazio não é memória");
  assert(semMemoria.vendedorNome === "", "vendedor: sem confirmação da WM não há nome canônico");

  // Mesmo que alguém volte a passar um nome de usuário, ele é ignorado: a assinatura não o
  // aceita mais, e um prefill com chave extra não pode reintroduzir o palpite por acidente.
  const comChaveExtra = prefillRascunho({ vendedorNomeSugerido: "Ana Atendente", vendedorLembrado: null });
  assert(
    comChaveExtra.vendedorBusca === "",
    "vendedor: `vendedorNomeSugerido` não é mais lido — o prefill por nome de usuário saiu de vez"
  );
}

/* ---- Memória só vale com código: nome sem código não pré-seleciona nada ---- */
{
  const soNome = prefillRascunho({ vendedorLembrado: { codigo: "", nome: "Carlos" } });
  assert(soNome.vendedorCodigoErp === "", "vendedor lembrado: sem código não há pré-seleção");
  assert(soNome.vendedorBusca === "", "vendedor lembrado: sem código o campo fica vazio");
  assert(soNome.vendedorDeMemoria === false, "vendedor lembrado: sem código não é memória");
}
{
  const nada = prefillRascunho();
  assert(nada.vendedorCodigoErp === "" && nada.vendedorBusca === "", "vendedor: sem nada, campo nasce vazio (como antes)");
  assert(nada.clienteBusca === "", "cliente: sem nada, campo nasce vazio");
}

/* ---- Escopo: empresa + usuário ---- */
{
  const A = { companyId: 1, userId: 10 };
  const B = { companyId: 2, userId: 20 };
  const C = { companyId: 1, userId: 11 };
  assert(chaveVendedorLembrado(A) !== chaveVendedorLembrado(B), "memória: empresas diferentes não compartilham chave");
  assert(chaveVendedorLembrado(A) !== chaveVendedorLembrado(C), "memória: usuários diferentes não compartilham chave");
  assert(
    chaveVendedorLembrado({ companyId: "1:10", userId: "" }) !== chaveVendedorLembrado({ companyId: "1", userId: "10" }),
    "memória: escopo não pode ser forjado por separador na chave"
  );

  assert(gravarVendedorLembrado({ ...A, codigo: "V9", nome: "Carlos Lima" }), "memória: gravação funciona");
  assert(lerVendedorLembrado(A)?.codigo === "V9", "memória: volta no mesmo escopo");
  assert(lerVendedorLembrado(A)?.nome === "Carlos Lima", "memória: o nome volta junto");
  assert(lerVendedorLembrado(B) === null, "memória: outra empresa NÃO lê o vendedor do escopo A");
  assert(lerVendedorLembrado(C) === null, "memória: outro usuário da mesma empresa NÃO lê o vendedor do escopo A");

  // Nada de guardar o que a WM não confirmou.
  assert(!gravarVendedorLembrado({ ...A, codigo: "", nome: "Alguém" }), "memória: sem código não grava");
  assert(!gravarVendedorLembrado({ ...A, codigo: null, nome: "Alguém" }), "memória: código nulo não grava");

  // Prazo: memória velha não ressuscita.
  gravarVendedorLembrado({ ...A, codigo: "V9", nome: "Carlos", agora: Date.now() - VENDEDOR_TTL_MS - 1000 });
  assert(lerVendedorLembrado(A) === null, "memória: vencida não é lida");
  assert(globalThis.localStorage.getItem(chaveVendedorLembrado(A)) === null, "memória: vencida é removida na leitura");

  // "Trocar" esquece só o escopo atual.
  gravarVendedorLembrado({ ...A, codigo: "V9", nome: "Carlos" });
  gravarVendedorLembrado({ ...B, codigo: "V1", nome: "Outro" });
  esquecerVendedorLembrado(A);
  assert(lerVendedorLembrado(A) === null, "memória: esquecer apaga o escopo pedido");
  assert(lerVendedorLembrado(B)?.codigo === "V1", "memória: esquecer não toca em outro escopo");
}

/* ---- Logout: a memória some, e só ela ---- */
{
  gravarVendedorLembrado({ companyId: 1, userId: 10, codigo: "V9", nome: "Carlos" });
  gravarVendedorLembrado({ companyId: 2, userId: 20, codigo: "V1", nome: "Outro" });
  globalThis.localStorage.setItem("zap_erp_auth", "preservar");
  globalThis.localStorage.setItem("zap_erp_last_email", "preservar");

  const removidas = limparVendedoresLembrados();
  assert(removidas === 2, `logout: as duas memórias têm de sair — saíram ${removidas}`);
  assert(lerVendedorLembrado({ companyId: 1, userId: 10 }) === null, "logout: memória do escopo logado some");
  assert(
    lerVendedorLembrado({ companyId: 2, userId: 20 }) === null,
    "logout: memória de OUTRO escopo também some (navegador de balcão)"
  );
  assert(
    globalThis.localStorage.getItem("zap_erp_auth") === "preservar",
    "logout: a limpeza não pode tocar em chaves de outros módulos"
  );
}

/* ---- A marca de memória sobrevive ao F5 pelo rascunho, e só `true` literal passa ---- */
{
  const chaveF5 = chaveRascunho({ companyId: 1, userId: 10, conversaId: 77 });
  gravarRascunho(chaveF5, {
    vendedorCodigoErp: "V9",
    vendedorNome: "Carlos Lima",
    vendedorDeMemoria: true,
    itens: [],
  });
  assert(lerRascunho(chaveF5)?.vendedorDeMemoria === true, "rascunho: a marca de memória sobrevive ao F5");

  gravarRascunho(chaveF5, { vendedorCodigoErp: "V9", vendedorDeMemoria: "sim", itens: [] });
  assert(
    lerRascunho(chaveF5)?.vendedorDeMemoria === false,
    "rascunho: só `true` literal conta como memória (valor estranho no storage não vale)"
  );
}

/* ---- Storage bloqueado (janela privada) não pode derrubar o orçamento ---- */
{
  globalThis.localStorage = new StorageFake({ lancar: true });
  let explodiu = false;
  try {
    gravarVendedorLembrado({ companyId: 1, userId: 10, codigo: "V9", nome: "Carlos" });
    lerVendedorLembrado({ companyId: 1, userId: 10 });
    esquecerVendedorLembrado({ companyId: 1, userId: 10 });
    limparVendedoresLembrados();
  } catch {
    explodiu = true;
  }
  assert(!explodiu, "memória: storage bloqueado não pode lançar");
  assert(lerVendedorLembrado({ companyId: 1, userId: 10 }) === null, "memória: storage bloqueado lê como ausente");
}
{
  delete globalThis.localStorage;
  let explodiu = false;
  try {
    gravarVendedorLembrado({ companyId: 1, userId: 10, codigo: "V9" });
    lerVendedorLembrado({ companyId: 1, userId: 10 });
    limparVendedoresLembrados();
  } catch {
    explodiu = true;
  }
  assert(!explodiu, "memória: ausência de localStorage não pode lançar");
}

/* ------------------------------------------------------------------ *
 * 10. Render real das duas telas (React → HTML, em memória)
 * ------------------------------------------------------------------ *
 * Os testes acima provam as REGRAS; este prova que os componentes de fato imprimem o que o
 * modelo decidiu, em vez de montar número por conta própria. `esbuild` (já presente por causa
 * do Vite) empacota os dois componentes com o React num módulo autocontido, carregado de um
 * `data:` URL — sem arquivo temporário, sem servidor, sem rede.
 */
{
  let bundle = null;
  try {
    const { Buffer } = await import("node:buffer");
    const esbuild = await import("esbuild");
    const dirOrcamento = new URL("../src/conversa/orcamento/", import.meta.url);
    const saida = await esbuild.build({
      stdin: {
        contents: [
          'import { createElement } from "react";',
          'import { renderToStaticMarkup } from "react-dom/server.browser";',
          'import Preview from "./OrcamentoPreview.jsx";',
          'import Resultado from "./OrcamentoResultado.jsx";',
          'import Form from "./OrcamentoForm.jsx";',
          'import Picker from "./ProdutoPicker.jsx";',
          'import Cliente from "./ClientePicker.jsx";',
          'import Ambiguidade from "./AmbiguidadePicker.jsx";',
          "export const Componentes = { Preview, Resultado, Form, Picker, Cliente, Ambiguidade };",
          "export const render = (C, p) => renderToStaticMarkup(createElement(C, p));",
        ].join("\n"),
        resolveDir: new URL(".", dirOrcamento).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
        loader: "js",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      write: false,
      logLevel: "silent",
      define: {
        "process.env.NODE_ENV": '"production"',
        // `OrcamentoForm` arrasta o `ProdutoPicker` e, com ele, o cliente HTTP, que lê
        // `import.meta.env` ao ser carregado. O valor não é usado: nenhum render faz rede.
        "import.meta.env": '{"VITE_API_URL":"http://localhost","MODE":"test"}',
      },
    });
    const codigo = saida.outputFiles[0].text;
    bundle = await import(`data:text/javascript;base64,${Buffer.from(codigo, "utf8").toString("base64")}`);
  } catch (err) {
    // `esbuild` é dependência transitiva do Vite: se um dia sair, as regras continuam provadas
    // pelas seções anteriores e a suíte não fica vermelha por um motivo que não é do produto.
    console.warn(`AVISO: render real pulado (${err?.message || err}).`);
  }

  if (bundle) {
    const { render, Componentes } = bundle;

    /* ---- Prévia ---- */
    const htmlPrevia = render(Componentes.Preview, { preparacao: { previa: PREVIA_WM } });

    assert(htmlPrevia.includes("Maria Souza"), "render prévia: mostra o cliente por nome");
    assert(htmlPrevia.includes("Carlos Lima"), "render prévia: mostra o vendedor por nome");
    assert(htmlPrevia.includes("Notebook") && htmlPrevia.includes("Mouse"), "render prévia: lista os itens");
    assert(
      htmlPrevia.includes("2 ×"),
      "render prévia: a quantidade chega à tela como '2', não como '2,000'"
    );
    assert(htmlPrevia.includes("1 UN"), "render prévia: a unidade chega colada na quantidade");
    assert(
      !htmlPrevia.includes("2,000") && !htmlPrevia.includes("1,000"),
      'render prévia: as três casas da WM NÃO podem chegar à tela — "1,000" se lê como mil'
    );
    assert(htmlPrevia.includes(formatMoedaOrcamento("33.038")), "render prévia: imprime o preço unitário da WM");
    assert(htmlPrevia.includes("33,038"), "render prévia: a 3ª casa aparece exata nos detalhes");
    assert(htmlPrevia.includes("-2,125"), "render prévia: estoque negativo chega à tela");
    assert(htmlPrevia.includes(formatMoedaOrcamento("1.00")), "render prévia: o total impresso é o da WM, não uma soma");
    assert(htmlPrevia.includes(SEM_VALOR), 'render prévia: campo ausente chega à tela como "—"');
    assert(!/R\$&nbsp;0,00|R\$ 0,00/.test(htmlPrevia), 'render prévia: "R$ 0,00" não pode aparecer para campo ausente');

    // O bloco de totais só pode conter os números da WM. A soma dos itens desta fixture daria
    // R$ 66,08 (66.076 + item sem valor) — e é justamente o que não pode estar ali.
    {
      const totais = htmlPrevia.match(/<div class="wa-orc-totais">([\s\S]*?)<\/div>\s*<\/div>/);
      assert(totais !== null, "render prévia: o bloco de totais é renderizado");
      assert(
        totais[1].includes(formatMoedaOrcamento("1.00")),
        "render prévia: o total do bloco é o `valor_total` da WM"
      );
      assert(
        !totais[1].includes(formatMoedaOrcamento("66.076")),
        "render prévia: o bloco de totais NÃO pode trazer a soma dos itens feita na tela"
      );
    }

    // Procedência: cópia nunca rotulada como atual.
    assert(/cópia/i.test(htmlPrevia), "render prévia: a procedência de cache aparece");
    {
      const origem = htmlPrevia.match(/<p class="wa-orc-origem">([^<]*)<\/p>/);
      assert(origem !== null, "render prévia: a linha de procedência é renderizada");
      assert(
        !PROIBIDO_EM_CACHE.test(origem[1]),
        `render prévia: cache rotulado como atual — "${origem?.[1]}"`
      );
    }

    // Botão principal: existe, é o rótulo certo, e desabilitado sem o despacho da Sessão 6.
    assert(htmlPrevia.includes("Confirmar e criar no ERP"), "render prévia: o botão principal tem o rótulo do plano");
    assert(htmlPrevia.includes("Voltar e editar"), "render prévia: 'Voltar e editar' fica ao lado");
    assert(
      /wa-orc-btnConfirmar"[^>]*disabled/.test(htmlPrevia),
      "render prévia: sem `onConfirmar` (Sessão 6) o botão principal fica desabilitado"
    );
    assert(!/bloquear_apos_criar/.test(htmlPrevia), "render prévia: nome técnico da política não vaza para a tela");
    assert(
      !/comando_id|preparacao_id|requestId|RESULTADO_INCERTO|cache_cloud|tempo_real/.test(htmlPrevia),
      "render prévia: nenhum identificador interno nem rótulo bruto de fonte na tela"
    );

    // Sem prévia utilizável: não se inventa tela.
    const htmlSemPrevia = render(Componentes.Preview, { preparacao: null });
    assert(
      !htmlSemPrevia.includes("Confirmar e criar no ERP"),
      "render prévia: sem prévia não se oferece criar no ERP"
    );

    // Fonte ausente: nenhuma linha de procedência inventada.
    const htmlSemFonte = render(Componentes.Preview, {
      preparacao: { previa: { ...PREVIA_WM, meta: null } },
    });
    assert(
      !htmlSemFonte.includes("wa-orc-origem"),
      "render prévia: sem `meta.fonte` a tela não escreve nada sobre procedência"
    );

    // Prévia desatualizada: o botão trava.
    const htmlDesatualizada = render(Componentes.Preview, {
      preparacao: { previa: PREVIA_WM },
      previaDesatualizada: true,
      onConfirmar: () => {},
    });
    assert(
      /wa-orc-btnConfirmar"[^>]*disabled/.test(htmlDesatualizada),
      "render prévia: dados mudados depois do cálculo desabilitam o confirmar"
    );
    assert(/calcule de novo/i.test(htmlDesatualizada), "render prévia: a tela pede novo cálculo");

    // Com despacho ligado (futuro) o botão habilita; durante o envio, desabilita e não vira outro botão.
    const htmlPronta = render(Componentes.Preview, { preparacao: { previa: PREVIA_WM }, onConfirmar: () => {} });
    assert(
      !/wa-orc-btnConfirmar"[^>]*disabled/.test(htmlPronta),
      "render prévia: com `onConfirmar` o botão principal habilita"
    );
    const htmlEnviando = render(Componentes.Preview, {
      preparacao: { previa: PREVIA_WM },
      onConfirmar: () => {},
      confirmando: true,
    });
    assert(
      /wa-orc-btnConfirmar"[^>]*disabled/.test(htmlEnviando),
      "render prévia: durante o envio o botão fica desabilitado (anti-duplo-clique)"
    );
    assert(
      /wa-orc-btnConfirmar/.test(htmlEnviando) && !htmlEnviando.includes("Confirmar e criar no ERP"),
      "render prévia: o botão em envio é o MESMO botão, com rótulo de progresso"
    );

    /* ---- Resultado ---- */
    const htmlResultado = render(Componentes.Resultado, { resultado: RESULTADO_WM });
    assert(htmlResultado.includes("123456"), "render resultado: o número do orçamento aparece");
    assert(
      htmlResultado.includes(formatMoedaOrcamento("3500.00")),
      "render resultado: o total é o da WM"
    );
    assert(htmlResultado.includes("Enviar ao cliente"), "render resultado: a ação principal é enviar ao cliente");
    assert(htmlResultado.includes("Copiar resumo"), "render resultado: dá para copiar o resumo");
    assert(htmlResultado.includes("Fechar"), "render resultado: dá para fechar");
    assert(/Orçamento: 123456/.test(htmlResultado), "render resultado: o resumo mostra o número ao atendente");
    assert(
      !/criado_em|2026-10-20T15:40/.test(htmlResultado),
      "render resultado: carimbo sem fuso não vai para a tela"
    );
    assert(
      !/comando_id|operacao_id|preparacao_id|requestId|RESULTADO_INCERTO/.test(htmlResultado),
      "render resultado: nenhum identificador interno na tela"
    );
    // Sem `onEnviarAoCliente` o envio não é oferecido como disponível — e nunca é automático.
    assert(
      /Enviar ao cliente<\/button>/.test(htmlResultado) && /disabled/.test(htmlResultado),
      "render resultado: sem o envio da Sessão 6, o botão fica desabilitado"
    );

    const htmlIdempotente = render(Componentes.Resultado, { resultado: RESULTADO_WM, jaEstavaCriado: true });
    assert(/já estava criado/i.test(htmlIdempotente), "render resultado: estado local pode dizer 'já estava criado'");
    assert(
      !/já estava criado/i.test(htmlResultado),
      "render resultado: sem o estado local, a tela NÃO afirma que já estava criado (§11.1)"
    );

    const htmlSemNumero = render(Componentes.Resultado, { resultado: { ...RESULTADO_WM, codigo_pedido_erp: "" } });
    assert(
      !htmlSemNumero.includes("Enviar ao cliente"),
      "render resultado: sem número não se oferece enviar ao cliente"
    );
    assert(/não crie outro/i.test(htmlSemNumero), "render resultado: sem número, a instrução é não duplicar");

    /* ---- Sessão 6: o envio ao cliente ligado ---- */
    const htmlComEnvio = render(Componentes.Resultado, {
      resultado: RESULTADO_WM,
      previa: { itens: [{ descricao: "Notebook", quantidade: "1.000", preco_unitario: "3500.00" }] },
      onEnviarAoCliente: () => {},
    });
    assert(
      /Enviar ao cliente<\/button>/.test(htmlComEnvio) &&
        !/wa-orc-btnPrincipal"[^>]*disabled[^>]*>\s*Enviar ao cliente/.test(htmlComEnvio),
      "render resultado: com `onEnviarAoCliente` o botão habilita"
    );
    assert(
      /1 × Notebook/.test(htmlComEnvio),
      "render resultado: com a prévia, o resumo exibido já é o template com itens"
    );
    assert(
      /revisa o texto no campo de mensagem/i.test(htmlComEnvio),
      "render resultado: a tela diz que o atendente ainda revisa antes de enviar"
    );
    // Durante um envio em curso o botão não some nem muda de lugar.
    const htmlEnviandoCliente = render(Componentes.Resultado, {
      resultado: RESULTADO_WM,
      onEnviarAoCliente: () => {},
      enviando: true,
    });
    assert(
      /wa-orc-btnPrincipal"[^>]*disabled/.test(htmlEnviandoCliente),
      "render resultado: durante o envio o botão principal fica desabilitado"
    );

    /* ---- Orçamento AVULSO (balcão): sem conversa, sem "Enviar ao cliente" ---- *
     * No avulso não há conversa para onde enviar. O botão "Enviar ao cliente" não pode aparecer
     * (nem desabilitado — seria botão morto com promessa de "próxima atualização" que não se
     * aplica): "Copiar resumo" vira a ação principal. */
    const htmlAvulso = render(Componentes.Resultado, {
      resultado: RESULTADO_WM,
      previa: { itens: [{ descricao: "Notebook", quantidade: "1.000", preco_unitario: "3500.00" }] },
      avulso: true,
    });
    assert(
      !htmlAvulso.includes("Enviar ao cliente"),
      "render resultado avulso: não há botão 'Enviar ao cliente' (sem conversa, seria botão morto)"
    );
    assert(
      !/próxima atualização/i.test(htmlAvulso),
      "render resultado avulso: a frase de 'próxima atualização' não se aplica ao balcão"
    );
    assert(
      /wa-orc-btnPrincipal"[^>]*>\s*Copiar resumo/.test(htmlAvulso) &&
        !/wa-orc-btnPrincipal"[^>]*disabled/.test(htmlAvulso),
      "render resultado avulso: 'Copiar resumo' é a ação principal, habilitada"
    );
    assert(htmlAvulso.includes("Fechar"), "render resultado avulso: dá para fechar");
    assert(/123456/.test(htmlAvulso), "render resultado avulso: o número do orçamento aparece igual");

    /* ---- Sessão 6: erro de falha segura na prévia ---- */
    const htmlErro = render(Componentes.Preview, {
      preparacao: { previa: PREVIA_WM },
      onConfirmar: () => {},
      erro: "O ERP está indisponível no momento.",
    });
    assert(
      htmlErro.includes("O ERP está indisponível no momento."),
      "render prévia: erro de falha segura aparece com a frase do backend"
    );
    assert(
      htmlErro.includes("Confirmar e criar no ERP"),
      "render prévia: depois de uma falha segura o atendente ainda vê o que ia criar"
    );
    assert(
      /nada foi criado/i.test(htmlErro),
      "render prévia: a falha segura diz, em letras, que o ERP não gravou nada"
    );
    assert(
      /wa-orc-btnConfirmar"[^>]*disabled/.test(htmlErro),
      "render prévia: depois da falha segura o confirmar trava — a preparação morreu no servidor"
    );
    assert(
      htmlErro.includes("Voltar e editar"),
      "render prévia: a saída de uma falha segura é voltar e calcular de novo"
    );
    assert(
      !/RESULTADO_INCERTO|FALHA_SEGURA|409|502|504/.test(htmlErro),
      "render prévia: o erro na tela não carrega código nem status"
    );
  }

  /* ---- Formulário: unidade junto da quantidade, preço da linha, estado de carga ---- */
  if (bundle) {
    const { render, Componentes } = bundle;
    const ITEM_M2 = {
      codigo_produto_erp: "7001",
      descricao: "PISO PORCELANATO ACETINADO 60X60",
      unidade: "M2",
      marca: "PORTOBELLO",
      quantidade: "2",
    };
    const formular = (props) =>
      render(Componentes.Form, {
        rascunho: { clienteBusca: "Maria", vendedorBusca: "Carlos", itens: [ITEM_M2] },
        ...props,
      });

    /* ---- a unidade anda com a quantidade (item 4 do refino) ---- */
    {
      const html = formular({});
      assert(
        /wa-orc-qtdUnidade[^>]*>M2</.test(html),
        "render form: a unidade do ERP aparece colada na quantidade"
      );
      assert(
        /aria-label="Quantidade de PISO PORCELANATO ACETINADO 60X60 em M2"/.test(html),
        "render form: o nome acessível do campo de quantidade também diz a unidade"
      );
      assert(
        html.includes('value="2"'),
        "render form: a quantidade continua sendo o texto cru do rascunho"
      );
    }

    /* ---- preço e estoque da linha vêm do cache, impressos como vieram ---- */
    {
      const html = formular({
        precos: {
          7001: {
            estado: "ok",
            valores: { preco_unitario: "33.038", estoque_previsto: "-2.125", unidade: "M2" },
            // O backend deriva `tempo_real` de `fonte` e manda os dois (wmOrcamentoService).
            meta: { fonte: "tempo_real", tempo_real: true },
          },
        },
      });
      assert(
        html.includes(formatMoedaOrcamento("33.038")),
        "render form: o preço consultado aparece na linha do carrinho"
      );
      assert(
        html.includes("-2,125"),
        "render form: estoque negativo chega à linha (o contrato permite, e não bloqueia venda)"
      );
      assert(
        /wa-orc-candidato-estoque--sem/.test(html),
        "render form: estoque sem saldo é destacado, e o número continua sendo a informação"
      );
      assert(
        !/R\$&nbsp;0,00|R\$ 0,00/.test(html),
        'render form: nunca "R$ 0,00" numa linha do carrinho'
      );
      assert(
        /Valores consultados agora/.test(html),
        "render form: valor de tempo real pode ser apresentado como atual"
      );
    }

    /* ---- cache_cloud NUNCA é "atual", nem misturado com tempo real ---- */
    {
      const html = formular({
        precos: {
          7001: {
            estado: "ok",
            valores: { preco_unitario: "33.038" },
            meta: { fonte: "cache_cloud" },
          },
        },
      });
      assert(
        /cópia do sistema da empresa/.test(html),
        "render form: valor de cópia é apresentado como cópia"
      );
      assert(
        !/consultados agora|atual|tempo real/i.test(html),
        'render form: cópia nunca ganha a palavra "agora", "atual" ou "tempo real"'
      );
    }

    /* ---- consulta em voo: a linha diz, e não inventa valor ---- */
    {
      const html = formular({
        precos: { 7001: { estado: "carregando", valores: null, meta: null } },
      });
      assert(
        html.includes("Consultando preço…"),
        "render form: enquanto a consulta corre, a linha diz que o preço está vindo"
      );
      assert(
        !/R\$/.test(html),
        "render form: carregando não imprime nenhum valor monetário"
      );
      assert(
        /wa-orc-btnPrincipal"[^>]*disabled/.test(html) === false,
        "render form: consulta de preço em voo NÃO bloqueia o Calcular"
      );
    }

    /* ---- consulta que FALHOU: linha sem preço, nenhum alarme, Calcular livre ---- */
    {
      const html = formular({
        precos: { 7001: { estado: "falhou", valores: null, meta: null } },
      });
      assert(
        !/R\$/.test(html) && !/Consultando/.test(html),
        "render form: falha na consulta deixa a linha sem preço, sem inventar nada"
      );
      assert(
        !/wa-orc-alert--erro/.test(html),
        "render form: falha ao buscar preço não vira alerta vermelho (ninguém pediu a consulta)"
      );
      assert(
        /Calcular</.test(html) && !/wa-orc-btnPrincipal"[^>]*disabled/.test(html),
        "render form: falhar no preço nunca impede montar o orçamento — o Calcular resolve"
      );
      assert(
        !/procedência|cópia do sistema|consultados agora/i.test(html),
        "render form: sem nenhum valor na tela, não se fala de procedência"
      );
    }

    /* ---- o rodapé é IRMÃO do corpo rolável, em todas as etapas ---- */
    {
      const html = formular({});
      assert(
        /<\/div><footer class="wa-orc-foot"/.test(html),
        "render form: o rodapé fecha FORA do corpo rolável (senão o Calcular rola para fora)"
      );
      const previa = render(Componentes.Preview, { preparacao: { previa: PREVIA_WM } });
      assert(
        /<\/div><footer class="wa-orc-foot"/.test(previa),
        "render prévia: o rodapé do Confirmar também fica fora do corpo rolável"
      );
      const resultado = render(Componentes.Resultado, { resultado: RESULTADO_WM });
      assert(
        /<\/div><footer class="wa-orc-foot"/.test(resultado),
        "render resultado: mesmo rodapé fora do scroll — a régua é a mesma nas três etapas"
      );
    }

    /* ---- as três seções do formulário têm título de mesmo nível ---- */
    {
      const html = formular({});
      const titulos = html.match(/class="wa-orc-sectionTitle"/g) || [];
      assert(
        titulos.length >= 3,
        `form: os três blocos (cliente/vendedor, busca, itens) têm título — achei ${titulos.length}`
      );
      assert(
        /<label for="wa-orc-produtoBusca">Pesquisar produto<\/label>/.test(html),
        "form: o título da busca continua sendo o rótulo do campo (um só para olho e leitor)"
      );
    }

    /* ---- o campo de cliente: busca quando não há escolha, escolha visível e trocável ---- */
    {
      const semEscolha = formular({});
      assert(
        /id="wa-orc-cliente"/.test(semEscolha),
        "render cliente: sem escolha, o campo de texto é o que está na tela"
      );
      assert(
        /Pelo começo do nome, ou pelo CPF\/CNPJ\./.test(semEscolha),
        "render cliente: a dica do prefixo continua no campo — é por isso que ela existe"
      );
      assert(
        !/wa-orc-clienteResultados/.test(semEscolha),
        "render cliente: a região de resultados não existe antes de alguém pedir uma busca"
      );

      const escolhido = formular({
        rascunho: {
          clienteBusca: "MARIA APARECIDA",
          clienteCodigoErp: "0000108",
          clienteNome: "MARIA APARECIDA AMADEI",
          vendedorBusca: "Carlos",
          itens: [ITEM_M2],
        },
      });
      assert(
        escolhido.includes("MARIA APARECIDA AMADEI") && escolhido.includes("Cód. ERP 0000108"),
        "render cliente: o cliente escolhido fica visível, com nome e código do ERP"
      );
      assert(
        !/id="wa-orc-cliente"/.test(escolhido),
        "render cliente: com cliente escolhido o campo de texto sai — não há texto para editar por cima da escolha"
      );
      assert(escolhido.includes("Trocar"), "render cliente: a escolha é trocável");
      assert(
        escolhido.includes(AVISO_CLIENTE_NAO_DEFINITIVO),
        "render cliente: o aviso de que a confirmação é no Calcular acompanha a escolha (D11)"
      );
      assert(
        !/✓|✔/.test(escolhido),
        'render cliente: nenhum selo de "pronto" na escolha — a palavra final é do Calcular'
      );
    }

    /* ---- os candidatos de cliente: o documento é o que separa duas homônimas ---- */
    {
      const html = render(Componentes.Cliente, {
        busca: "MARIA SILVA",
        codigoErp: "",
        nome: "",
        onPatch: () => {},
      });
      assert(
        /id="wa-orc-cliente"/.test(html) && /value="MARIA SILVA"/.test(html),
        "render cliente: o componente imprime o texto do rascunho no campo"
      );
      // O render estático não roda efeitos: nenhuma busca sai daqui, e é isso que se quer.
      assert(
        !/wa-orc-clienteResultados/.test(html),
        "render cliente: montar o componente não traz lista nenhuma — a busca é do gesto humano"
      );

      const comEscolha = render(Componentes.Cliente, {
        busca: "MARIA SILVA",
        codigoErp: "0000210",
        nome: "MARIA SILVA",
        onPatch: () => {},
        disabled: true,
      });
      assert(
        /wa-orc-escolhido/.test(comEscolha) && /Trocar/.test(comEscolha),
        "render cliente: a escolha usa a mesma casca de cliente/vendedor resolvidos"
      );
      assert(
        /wa-orc-btnSm"[^>]*disabled/.test(comEscolha),
        "render cliente: calculando, nem o Trocar aceita toque"
      );
    }

    /* ---- carrinho vazio: nada de total inventado ---- */
    {
      const vazio = render(Componentes.Form, { rascunho: { itens: [] } });
      assert(
        !/R\$/.test(vazio),
        'render form: carrinho vazio não mostra "R$ 0,00" em lugar nenhum'
      );
      assert(
        /wa-orc-btnPrincipal"[^>]*disabled/.test(vazio),
        "render form: sem item, o Calcular está desabilitado"
      );
    }

    /* ---- As três faixas de estoque, renderizadas de verdade ---- */
    {
      const comEstoque = (valor) =>
        render(Componentes.Ambiguidade, {
          ambiguidade: {
            status: "produto_ambiguo",
            candidatos: [
              {
                codigo_produto_erp: "4325",
                descricao: "CIMENTO CAMPEAO AZUL CP 2 E 32 50KG",
                unidade: "UN",
                preco_unitario: "33.038",
                estoque_previsto: valor,
              },
            ],
            paginacao: null,
          },
        });

      const folga = comEstoque("120.000");
      assert(/wa-orc-candidato-estoque--folga/.test(folga), "render estoque: saldo com folga tem a faixa de folga");
      assert(folga.includes("Estoque 120 UN"), "render estoque: o número sai sem as casas vazias e com a unidade");

      const pouco = comEstoque("3.000");
      assert(/wa-orc-candidato-estoque--pouco/.test(pouco), "render estoque: pouco saldo tem a faixa de pouco");
      assert(pouco.includes("Estoque 3 UN"), "render estoque: pouco mostra o número, não um aviso vago");

      const zero = comEstoque("0.000");
      assert(/wa-orc-candidato-estoque--sem/.test(zero), "render estoque: zero cai na faixa sem saldo");
      assert(zero.includes("Sem estoque"), "render estoque: zero é dito por extenso, não só pela cor");
      assert(
        !/wa-orc-candidato-estoque--folga|wa-orc-candidato-estoque--pouco/.test(zero),
        "render estoque: uma faixa por vez — zero não herda a cor de saldo"
      );

      const semDado = comEstoque(null);
      assert(
        !/wa-orc-candidato-estoque/.test(semDado),
        "render estoque: ausência não vira 'sem estoque' — ela simplesmente não desenha nada"
      );
      assert(
        !/Sem estoque/.test(semDado),
        "render estoque: campo que a WM não mandou NÃO pode ser apresentado como estoque zerado"
      );
    }

  }

  /* ---- Preço não cadastrado: o HTML das três telas que o atendente lê ---- *
   *
   * O card de busca não entra aqui porque candidato só aparece depois de uma busca, e o atalho
   * dos frequentes nunca guarda preço (`produtosFrequentes.js`) — ele usa a MESMA
   * `precoNaoCadastrado` e a mesma classe, provadas acima e nas duas telas abaixo.
   */
  if (bundle) {
    const { render, Componentes } = bundle;
    const ZERO_UM = formatMoedaOrcamento("0.010");

    /* ---- Prévia: a vaga do preço diz o estado, e o total do item continua lá ---- */
    {
      const html = render(Componentes.Preview, { preparacao: { previa: PREVIA_SEM_PRECO } });
      assert(
        html.includes(TEXTO_PRECO_NAO_CADASTRADO),
        "render prévia: o item de 0.010 é marcado como preço não cadastrado"
      );
      assert(
        !html.includes(ZERO_UM),
        `render prévia: "${ZERO_UM}" NÃO pode aparecer como preço unitário — é o acidente inteiro`
      );
      // O item com preço de verdade não é tocado.
      assert(
        html.includes(formatMoedaOrcamento("33.038")),
        "render prévia: o item com preço real continua mostrando o preço"
      );
      // O valor exato continua acessível nos detalhes: é o que o ERP vai gravar.
      assert(
        html.includes("0,010"),
        "render prévia: o valor exato continua nos detalhes do item, sem vestir-se de preço"
      );
      // O aviso do conjunto está na tela, e vem ANTES da lista de itens.
      assert(
        /AREIA MEDIA LAVADA M3[\s\S]*wa-orc-previaItem/.test(html),
        "render prévia: o aviso do conjunto aparece antes da lista — depois dela já passou"
      );
      assert(
        /wa-orc-alert--aviso[^>]*>[\s\S]{0,400}sem preço cadastrado/.test(html),
        "render prévia: o aviso do conjunto usa a faixa de aviso da tela"
      );
      // Continua sendo possível criar: o aviso informa, não bloqueia (há motivo legítimo para
      // orçar um item assim, e cada adição não pode virar pedágio).
      assert(
        !/wa-orc-btnConfirmar"[^>]*disabled[^>]*>/.test(
          render(Componentes.Preview, {
            preparacao: { previa: PREVIA_SEM_PRECO },
            onConfirmar: () => {},
          })
        ),
        "render prévia: item sem preço avisa, mas não bloqueia a criação"
      );
    }

    /* ---- Resultado: o ÚLTIMO portão, antes de o resumo ir para o cliente ---- */
    {
      const html = render(Componentes.Resultado, {
        resultado: RESULTADO_WM,
        previa: PREVIA_SEM_PRECO,
        onEnviarAoCliente: () => {},
      });
      assert(
        /sem preço cadastrado/.test(html),
        "render resultado: antes do envio, o aviso de preço não cadastrado está na tela"
      );
      assert(
        /resumo/i.test(html.match(/wa-orc-alert--aviso[\s\S]{0,500}?<\/div>/)?.[0] || ""),
        "render resultado: o aviso fala do RESUMO que vai para o cliente, não de criar no ERP"
      );
      // Antes do texto: aviso que aparece depois do bloco que ele qualifica chega tarde.
      assert(
        /wa-orc-alert--aviso[\s\S]*wa-orc-resumoTexto/.test(html),
        "render resultado: o aviso vem ACIMA do resumo, para ser lido antes dele"
      );
      // Avisar não é impedir: o botão de envio continua disponível.
      assert(
        !/wa-orc-btnPrincipal"[^>]*disabled/.test(html),
        "render resultado: o aviso não bloqueia o envio — quem decide é o atendente"
      );
      // Sem item marcado, nenhum aviso: alarme em orçamento normal treina a ignorar o alarme.
      const limpo = render(Componentes.Resultado, {
        resultado: RESULTADO_WM,
        previa: PREVIA_WM,
        onEnviarAoCliente: () => {},
      });
      assert(
        !/sem preço cadastrado/.test(limpo),
        "render resultado: orçamento com preço de verdade não ganha aviso nenhum"
      );
      // Sem prévia não há item para examinar — e calar é melhor que afirmar sobre o que não se tem.
      const semPrevia = render(Componentes.Resultado, {
        resultado: RESULTADO_WM,
        onEnviarAoCliente: () => {},
      });
      assert(
        !/sem preço cadastrado/.test(semPrevia),
        "render resultado: sem prévia em mãos, nada se afirma sobre preço de item"
      );
    }

    /* ---- Linha do carrinho: a marcação chega antes de calcular ---- */
    {
      const html = render(Componentes.Form, {
        rascunho: {
          clienteBusca: "Diniz",
          vendedorBusca: "Carlos",
          itens: [
            {
              codigo_produto_erp: "9001",
              descricao: "AREIA MEDIA LAVADA M3",
              unidade: "M3",
              quantidade: "2",
            },
          ],
        },
        precos: {
          9001: {
            estado: "ok",
            valores: { preco_unitario: "0.010", estoque_previsto: "40.000", unidade: "M3" },
            meta: { fonte: "tempo_real", tempo_real: true },
          },
        },
      });
      assert(
        html.includes(TEXTO_PRECO_NAO_CADASTRADO),
        "render form: a linha do carrinho marca o item sem preço cadastrado"
      );
      assert(
        !html.includes(ZERO_UM),
        `render form: "${ZERO_UM}" não pode aparecer na linha do carrinho`
      );
      // A linha continua mostrando o resto: marcar o preço não apaga estoque nem unidade.
      assert(
        /Estoque 40/.test(html),
        "render form: o estoque da linha continua visível ao lado da marcação"
      );
      assert(
        /wa-orc-qtdUnidade[^>]*>M3</.test(html),
        "render form: a unidade continua colada na quantidade"
      );
      // E o item pode ser removido/alterado como qualquer outro: nada foi bloqueado.
      assert(
        /aria-label="Remover AREIA MEDIA LAVADA M3 do orçamento"/.test(html),
        "render form: o item marcado segue sendo um item normal do carrinho"
      );
    }

    /* ---- A idade do saldo, o saldo negativo e o inativo chegam à linha do carrinho ---- *
     * Dados reais da Tijolar medidos em 26/10/2026: `0000209` com saldo `352.500` carimbado em
     * `2026-10-23T00:09:24.272Z` (86,6 h na hora da medição) e `0000749` com saldo `-908.000`.
     * O carimbo aqui é fabricado a partir do relógio do teste para a idade ser determinística.
     */
    {
      const agoraTeste = Date.now();
      const carimbo = (ms) => new Date(agoraTeste - ms).toISOString();
      const html = render(Componentes.Form, {
        rascunho: {
          itens: [
            { codigo_produto_erp: "0000209", descricao: "PISO PROMOCAO", unidade: "M2", quantidade: "2" },
            { codigo_produto_erp: "0000749", descricao: "CIMENTO MEIO SACO", unidade: "SC", quantidade: "1" },
            { codigo_produto_erp: "0005038", descricao: "CABO FLEX PRETO", unidade: "MT", quantidade: "1" },
          ],
        },
        precos: {
          "0000209": {
            estado: "ok",
            valores: { preco_unitario: "18.420", estoque_previsto: "352.500", unidade: "M2" },
            carimbos: { estoque_sincronizado_em: carimbo(86.6 * 60 * 60 * 1000) },
            meta: { fonte: "tempo_real", tempo_real: true },
          },
          "0000749": {
            estado: "ok",
            valores: { preco_unitario: "29.130", estoque_previsto: "-908.000", unidade: "SC" },
            carimbos: { estoque_sincronizado_em: carimbo(2.5 * 60 * 60 * 1000) },
            meta: { fonte: "tempo_real", tempo_real: true },
          },
          // Item inativo e SEM carimbo nenhum: a idade simplesmente não existe nesta linha.
          "0005038": {
            estado: "ok",
            valores: { preco_unitario: "81.020", estoque_previsto: "4.000", unidade: "MT", ativo: false },
            carimbos: null,
            meta: { fonte: "tempo_real", tempo_real: true },
          },
        },
      });

      assert(
        html.includes("Saldo atualizado há 3 dias"),
        "render form: a idade do saldo de 86,6 h chega à tela em linguagem de gente"
      );
      assert(
        /wa-orc-saldoIdade wa-orc-saldoIdade--aviso/.test(html),
        "render form: e passadas 24 h ela vem marcada como aviso"
      );
      assert(
        /title="[^"]*prometer entrega[^"]*"/.test(html),
        "render form: o aviso carrega a consequência, não só a data"
      );
      assert(
        html.includes("Saldo atualizado há 2 h"),
        "render form: o saldo de 2,5 h também diz a idade — a verdade não é só para o caso ruim"
      );
      assert(
        (html.match(/wa-orc-saldoIdade--aviso/g) || []).length === 1,
        "render form: saldo fresco NÃO é marcado como aviso (alarme em tudo é alarme em nada)"
      );
      // Três itens no carrinho, DUAS frases de idade: a linha sem carimbo não ganha nenhuma.
      assert(
        (html.match(/Saldo atualizado/g) || []).length === 2,
        "render form: a linha sem carimbo não ganha idade — ausência não vira 'atualizado agora'"
      );
      assert(
        !/atualizado agora/.test(html),
        "render form: nenhuma linha afirma 'agora' sem carimbo que o sustente"
      );

      /* ---- Saldo negativo é distinguível de zero, na tela ---- */
      assert(
        html.includes("Saldo -908 SC"),
        "render form: o saldo negativo aparece com o número inteiro e a palavra 'Saldo'"
      );
      assert(
        !/Sem estoque \(/.test(html),
        "render form: negativo não é mais apresentado como 'Sem estoque (…)'"
      );
      assert(
        /wa-orc-candidato-estoque--negativo/.test(html),
        "render form: e ganha a classe própria, distinta da do zero"
      );
      assert(
        /title="[^"]*saldo dele ficou negativo[^"]*"/.test(html),
        "render form: a explicação do inventário negativo está ao alcance"
      );

      /* ---- Inativo diz a consequência (o `preparar` recusa com PRODUTO_INATIVO) ---- */
      assert(
        /Inativo — o cálculo vai recusar/.test(html),
        "render form: item inativo avisa que o Calcular vai recusar, antes de a pessoa tentar"
      );

      // Zero continua sendo zero: a frase antiga não foi perdida junto com a mudança.
      const htmlZero = render(Componentes.Form, {
        rascunho: { itens: [{ codigo_produto_erp: "1", descricao: "TINTA", unidade: "LT", quantidade: "1" }] },
        precos: {
          1: {
            estado: "ok",
            valores: { preco_unitario: "247.080", estoque_previsto: "0.000", unidade: "LT" },
            carimbos: null,
            meta: { fonte: "tempo_real", tempo_real: true },
          },
        },
      });
      assert(
        htmlZero.includes("Sem estoque"),
        "render form: estoque zerado continua dito por extenso"
      );
      assert(
        !/Saldo -/.test(htmlZero) && !/--negativo/.test(htmlZero),
        "render form: zero não é tratado como negativo"
      );
    }

    /* ---- O desconto do ERP na prévia: invisível hoje, visível quando existir ---- */
    {
      const semDesconto = render(Componentes.Preview, { preparacao: { previa: PREVIA_WM } });
      assert(
        !/Desconto do sistema/.test(semDesconto),
        "render prévia: sem desconto (o caso medido hoje) a linha não existe"
      );
      assert(
        !/R\$ 0,00 por/.test(semDesconto),
        'render prévia: "Desconto R$ 0,00" nunca ocupa espaço em linha nenhuma'
      );

      const comDesconto = render(Componentes.Preview, {
        preparacao: {
          previa: {
            ...PREVIA_WM,
            itens: [
              {
                codigo_produto_erp: "0000209",
                descricao: "PISO PROMOCAO",
                unidade: "M2",
                quantidade: "2.000",
                preco_unitario: "18.42",
                valor_total: "33.84",
                valor_total_bruto: "36.84",
                valor_desconto_unit: "1.50",
              },
            ],
          },
        },
      });
      assert(
        /Desconto do sistema/.test(comDesconto),
        "render prévia: o desconto do ERP aparece quando existe"
      );
      assert(
        comDesconto.includes(formatMoedaOrcamento("1.50")),
        "render prévia: com o valor que a WM mandou"
      );
      assert(
        /<s class="wa-orc-item-descontoDe">/.test(comDesconto),
        "render prévia: e com o valor cheio riscado ao lado, para o desconto ser conferível"
      );
      assert(
        comDesconto.includes("por M2"),
        "render prévia: o desconto é POR UNIDADE (`valor_desconto_unit`) e a frase diz a unidade"
      );
      assert(
        comDesconto.includes(formatMoedaOrcamento("33.84")),
        "render prévia: o total da linha continua sendo o da WM, não o bruto"
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 11. Sessão 6 — o que o CÓDIGO não pode fazer
 * ------------------------------------------------------------------ *
 * Estas asserções olham o fonte porque o que elas proíbem não é um valor de saída, é um
 * caminho de execução: uma chamada de criação dentro de um `useEffect`, de um retry ou do
 * envio ao cliente. Nenhuma delas apareceria num `renderToStaticMarkup`, e todas custariam um
 * orçamento duplicado no ERP de um cliente real.
 */
{
  const { readFileSync } = await import("node:fs");
  const ler = (rel) => readFileSync(new URL(`../src/conversa/orcamento/${rel}`, import.meta.url), "utf8");
  const drawer = ler("OrcamentoDrawer.jsx");
  const resultadoSrc = ler("OrcamentoResultado.jsx");
  const previewSrc = ler("OrcamentoPreview.jsx");

  const chamadasConfirmar = drawer.split("\n").filter((l) => /\bconfirmarOrcamento\(/.test(l));
  assert(
    chamadasConfirmar.length === 1,
    `drawer: a criação é chamada de UM lugar só — achei ${chamadasConfirmar.length}`
  );
  assert(
    !/useEffect\([^)]*confirmarOrcamento/s.test(drawer),
    "drawer: nenhuma criação dentro de `useEffect` — criar é sempre um clique"
  );
  assert(
    !/\bverificarOrcamento\(/.test(drawer),
    "drawer: `verificarOrcamento` não é CHAMADO pela tela do atendente (reconciliação é do suporte, D10)"
  );
  assert(
    !/\bverificarOrcamento\b/.test(drawer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\*.*$/gm, "")),
    "drawer: fora de comentário, `verificarOrcamento` não é sequer importado"
  );
  assert(
    !/setTimeout[\s\S]{0,200}confirmarOrcamento/.test(drawer),
    "drawer: nenhum retry agendado sobre a criação"
  );
  // O envio ao cliente não pode tocar na criação: a função que envia só repassa texto.
  const envio = drawer.match(/const enviarAoCliente = useCallback\([\s\S]*?\n  \);/);
  assert(envio !== null, "drawer: `enviarAoCliente` existe");
  assert(
    !/confirmarOrcamento|prepararOrcamento/.test(envio[0]),
    "drawer: falha no envio ao cliente não pode recriar orçamento — o envio não conhece a criação"
  );
  for (const [nome, src] of [["resultado", resultadoSrc], ["prévia", previewSrc]]) {
    assert(
      !/confirmarOrcamento|verificarOrcamento|prepararOrcamento/.test(src),
      `${nome}: componente de tela não chama a API de orçamento — quem orquestra é o drawer`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 12. Busca de produto: os dois grupos e os dois estados vazios
 * ------------------------------------------------------------------ *
 * Medido no ERP real da empresa 20 em 22/10:
 *   `filtro` → 1 produto  ·  `filtr` → 468      (existe um produto chamado "FILTRO")
 *   `parafuso` → 1        ·  `parafus` → 285
 *   `piso` → 1            ·  `pis` → 42         (aqui o único é único de verdade)
 *   `filtro oleo` acha    ·  `oleo filtro` NÃO  (a WM procura o trecho literal)
 *
 * O backend revela os escondidos e marca qual é a correspondência exata; estas asserções
 * provam a tradução disso para a tela, e que o estado vazio ensina a ordem das palavras.
 */
{
  const EXATO = { codigo_produto_erp: "EXATO", descricao: "FILTRO", preco_unitario: "0.010", estoque_previsto: "0.000", ativo: true };
  const OUTRO_A = { codigo_produto_erp: "A1", descricao: "FILTRO DE OLEO" };
  const OUTRO_B = { codigo_produto_erp: "A2", descricao: "FILTRO DE AR" };

  /* ---- dois grupos ---- */
  {
    const g = agruparCandidatosProduto({
      status: "multiplos_produtos",
      produtos: [EXATO, OUTRO_A, OUTRO_B],
      correspondencia_exata: EXATO,
      correspondencia_exata_meta: { fonte: "tempo_real" },
      outros_com_a_palavra: [OUTRO_A, OUTRO_B],
      paginacao: { pagina: 1, tamanho_pagina: 30, total: 468, tem_mais: true, tem_anterior: false },
    });
    assert(g.exato?.codigo_produto_erp === "EXATO", "agrupar: a correspondência exata é identificada");
    assert(g.lista[0].codigo_produto_erp === "EXATO", "agrupar: o exato vem em PRIMEIRO na lista única");
    assert(
      g.outros.map((p) => p.codigo_produto_erp).join(",") === "A1,A2",
      "agrupar: os irmãos revelados ficam no segundo grupo"
    );
    assert(
      !g.outros.some((p) => p.codigo_produto_erp === "EXATO"),
      "agrupar: o exato não se repete dentro de 'outros' (apareceria duas vezes na tela)"
    );
    assert(g.paginacao?.total === 468, "agrupar: a paginação dos escondidos atravessa");
    assert(g.metaDoPrecificado?.fonte === "tempo_real", "agrupar: a procedência do preço é a do exato");
  }

  /* ---- produto resolvido sozinho: uma lista só, sem rótulo ---- */
  {
    const g = agruparCandidatosProduto({ status: "produto", produto: EXATO, meta: { fonte: "cache_cloud" } });
    assert(g.exato === null, "agrupar: produto único não é rotulado como 'exato' (não há com quem contrastar)");
    assert(g.lista.length === 1 && g.lista[0].codigo_produto_erp === "EXATO", "agrupar: produto único vira lista de um");
    assert(g.paginacao === null, "agrupar: ramo resolvido não tem paginação");
    assert(g.metaDoPrecificado?.fonte === "cache_cloud", "agrupar: a procedência do resolvido vem do meta dele");
  }

  /* ---- lista comum, sem exato: segue como antes ---- */
  {
    const g = agruparCandidatosProduto({ status: "multiplos_produtos", produtos: [OUTRO_A, OUTRO_B] });
    assert(g.exato === null && g.lista.length === 2, "agrupar: lista sem correspondência exata não ganha grupo");
    assert(g.metaDoPrecificado === null, "agrupar: lista sem preço não afirma procedência de valor");
  }

  /* ---- exato marcado mas sem irmãos: volta a ser lista simples ---- */
  {
    const g = agruparCandidatosProduto({
      status: "multiplos_produtos",
      produtos: [EXATO],
      correspondencia_exata: EXATO,
      outros_com_a_palavra: [EXATO],
    });
    assert(g.exato === null && g.lista.length === 1, "agrupar: exato sem irmãos não vira dois grupos vazios");
  }

  /* ---- entradas degeneradas não quebram ---- */
  for (const ruim of [null, undefined, "", 42, [], {}, { status: "produto" }, { produtos: "x" }]) {
    const g = agruparCandidatosProduto(ruim);
    assert(Array.isArray(g.lista), `agrupar: entrada ${JSON.stringify(ruim)} devolve lista utilizável`);
  }
  assert(
    agruparCandidatosProduto({ status: "multiplos_produtos", produtos: [{ descricao: "sem codigo" }] }).lista.length === 0,
    "agrupar: candidato sem código não entra na lista (não dá para selecionar)"
  );

  /* ---- estado vazio: uma palavra × duas palavras ---- */
  assert(
    mensagemBuscaSemResultado("filtro") === "Nenhum produto encontrado com esse nome.",
    "vazio: com UMA palavra a mensagem antiga é mantida"
  );
  assert(
    mensagemBuscaSemResultado("  filtro  ") === "Nenhum produto encontrado com esse nome.",
    "vazio: espaço em volta não transforma uma palavra em duas"
  );
  {
    const msg = mensagemBuscaSemResultado("oleo filtro");
    assert(/oleo filtro/.test(msg), "vazio: a mensagem cita o que a pessoa digitou");
    assert(/ordem/i.test(msg), "vazio: a mensagem explica que a ordem das palavras importa");
    assert(/"oleo"/.test(msg), "vazio: a mensagem sugere a PRIMEIRA palavra do que foi digitado");
    assert(!/trecho literal|substring|LIKE|ocorrência/i.test(msg), "vazio: nada de jargão técnico na tela");
  }
  assert(
    /"oleo"/.test(mensagemBuscaSemResultado("oleo   filtro   motor")),
    "vazio: três palavras também sugerem a primeira"
  );

  /* ---- cliente: busca por PREFIXO ---- */
  {
    const dica = dicaClienteNaoEncontrado("WM_NAO_ENCONTRADO", "Diniz");
    assert(/Diniz/.test(dica), "cliente: a dica cita o nome digitado");
    assert(/começo do nome/i.test(dica), "cliente: a dica diz que a busca é pelo começo do nome");
    assert(/CPF\/CNPJ/.test(dica), "cliente: a dica oferece a saída que funciona por igualdade");
    assert(
      dicaClienteNaoEncontrado("WM_PRODUTO_NAO_ENCONTRADO", "Diniz") === "",
      "cliente: erro de PRODUTO não vira conselho sobre cliente"
    );
    assert(dicaClienteNaoEncontrado("WM_NAO_ENCONTRADO", "   ") === "", "cliente: sem nome digitado, nada a dizer");
    assert(dicaClienteNaoEncontrado(null, "Diniz") === "", "cliente: sem código de erro, nada a dizer");
  }
}

/* ------------------------------------------------------------------ *
 * 12.1 Relevante × ruído, o destaque e o resgate de duas palavras
 * ------------------------------------------------------------------ *
 * Medido ao vivo no ERP da empresa 20 em 25/10:
 *
 *   `cimento` → 6 produtos, 5 deles "ARREFECIMENTO"/"ARREFICIMENTO"  (83% de ruído)
 *   `cimen`   → 7, mesmos 5 de ruído
 *   `tinta`   → 17, zero ruído   ·   `oleo` → 181, zero   ·   `cabo` → 144, zero
 *   `filtro oleo` acha           ·   `oleo filtro` devolve ZERO
 *
 * A loja é revenda de peças agrícolas e automotivas: "só um cimento" é o dado certo, o problema
 * é o radiador que vinha junto. Estas asserções provam a régua (início de palavra × meio de
 * palavra), o destaque que explica cada linha e os limites do resgate.
 */
{
  const RADIADOR = {
    codigo_produto_erp: "AL221117",
    descricao: "AL221117 - RADIADOR DO SISTEMA DE ARREFECIMENTO - MAHLE",
    marca: "MAHLE",
  };
  const ADITIVO = {
    codigo_produto_erp: "9002",
    descricao: "ADITIVO ARREFICIMENTO ROSA 1L",
    marca: "PARAFLU",
  };
  const CIMENTO = {
    codigo_produto_erp: "0004325",
    descricao: "CIMENTO CAMPEAO AZUL CP 2 E 32 50KG",
    marca: "CAMPEAO",
  };

  /* ---- a régua: o termo INICIA uma palavra? ---- */
  assert(candidatoRelevante(CIMENTO, "cimento") === true, "régua: 'cimento' inicia a descrição do cimento");
  assert(
    candidatoRelevante(RADIADOR, "cimento") === false,
    "régua: 'cimento' dentro de ARREFECIMENTO é ruído — é o radiador que atrapalhava a busca"
  );
  assert(
    candidatoRelevante(ADITIVO, "cimento") === false,
    "régua: ARREFICIMENTO (com I) também é ruído — a grafia do catálogo não muda a regra"
  );
  assert(candidatoRelevante(CIMENTO, "CIMENTO") === true, "régua: caixa não conta");
  assert(candidatoRelevante(CIMENTO, "  cimento  ") === true, "régua: espaço em volta não conta");

  /* ---- a marca também encontra (é o que a dica do campo promete) ---- */
  assert(candidatoRelevante(RADIADOR, "mahle") === true, "marca: 'mahle' casa pela marca do produto");
  assert(
    candidatoRelevante(CIMENTO, "mahle") === false,
    "marca: quem não é da marca não vira relevante por acaso"
  );
  assert(
    candidatoRelevante({ descricao: "FILTRO", marca: "JOHN DEERE" }, "deere") === true,
    "marca: a segunda palavra da marca também é palavra"
  );

  /* ---- separadores do catálogo: hífen, barra e o código colado ---- */
  assert(
    candidatoRelevante({ descricao: "CORREIA R-1892 DENTADA" }, "1892") === true,
    "separador: o hífen de 'R-1892' começa palavra nova"
  );
  assert(
    candidatoRelevante({ descricao: "CORREIA R-1892 DENTADA" }, "892") === false,
    "separador: '892' é miolo de 1892 — ruído, não resultado"
  );
  assert(
    candidatoRelevante({ descricao: "FILTRO AR EXT/INT MOTOR" }, "int") === true,
    "separador: a barra de 'EXT/INT' começa palavra nova"
  );
  assert(
    candidatoRelevante(RADIADOR, "radiador") === true,
    "separador: 'AL221117 - RADIADOR' tem várias palavras"
  );
  assert(
    candidatoRelevante(RADIADOR, "221117") === false,
    "separador: '221117' colado em AL é miolo de código, não palavra"
  );

  /* ---- acento não atrapalha ---- */
  assert(
    candidatoRelevante({ descricao: "ÓLEO LUBRIFICANTE 15W40" }, "oleo") === true,
    "acento: 'oleo' acha 'ÓLEO' — ninguém digita acento com o cliente esperando"
  );
  assert(
    candidatoRelevante({ descricao: "SOLUCAO" }, "solução") === true,
    "acento: digitar COM acento também casa o que está sem"
  );

  /* ---- a separação em dois grupos, com a ordem da WM preservada ---- */
  {
    const pagina = [RADIADOR, CIMENTO, ADITIVO];
    const { relevantes, ruido } = separarCandidatosPorRelevancia(pagina, "cimento");
    assert(relevantes.length === 1 && relevantes[0] === CIMENTO, "separar: o cimento sobe sozinho");
    assert(ruido.length === 2, "separar: os dois arrefecimentos descem");
    assert(
      ruido[0] === RADIADOR && ruido[1] === ADITIVO,
      "separar: dentro do ruído a ordem da WM é preservada — não se reordena duas vezes"
    );
    assert(
      relevantes.length + ruido.length === pagina.length,
      "separar: NADA é filtrado — ruído continua escolhível, só vai para baixo"
    );
  }
  {
    // `tinta` e `oleo` medidos: 17 e 181 resultados, zero ruído. O caso comum não muda nada.
    const pagina = [{ descricao: "TINTA ACRILICA" }, { descricao: "TINTA SPRAY PRETA" }];
    const { relevantes, ruido } = separarCandidatosPorRelevancia(pagina, "tinta");
    assert(ruido.length === 0, "separar: sem ruído na página, nada desce");
    assert(relevantes[0] === pagina[0] && relevantes[1] === pagina[1], "separar: e a ordem é a da WM");
  }
  for (const semTermo of ["", "   ", null, undefined]) {
    const { relevantes, ruido } = separarCandidatosPorRelevancia([RADIADOR], semTermo);
    assert(
      ruido.length === 0 && relevantes.length === 1,
      `separar: sem termo (${JSON.stringify(semTermo)}) nada é rebaixado`
    );
  }
  assert(
    separarCandidatosPorRelevancia(null, "cimento").relevantes.length === 0,
    "separar: entrada degenerada devolve listas utilizáveis"
  );

  /* ---- o agrupamento inteiro: exato primeiro, relevantes, ruído ---- */
  {
    const g = agruparCandidatosProduto(
      { status: "multiplos_produtos", produtos: [RADIADOR, CIMENTO, ADITIVO], paginacao: { total: 6, tem_mais: false, tem_anterior: false } },
      "cimento"
    );
    assert(
      g.lista.map((p) => p.codigo_produto_erp).join(",") === "0004325,AL221117,9002",
      "agrupar: a lista sai na ordem em que a tela imprime — relevante primeiro"
    );
    assert(g.ruido.length === 2 && g.relevantes.length === 1, "agrupar: os dois grupos atravessam para a tela");
    assert(g.termo === "cimento", "agrupar: o termo consultado viaja (destaque e título saem dele)");
    assert(g.paginacao?.total === 6, "agrupar: a contagem da WM não é tocada — não inventamos que filtramos");
  }
  {
    // A correspondência exata fica ACIMA DE TUDO, inclusive do relevante.
    const EXATO = { codigo_produto_erp: "E1", descricao: "CIMENTO" };
    const g = agruparCandidatosProduto(
      {
        status: "multiplos_produtos",
        produtos: [EXATO, RADIADOR, CIMENTO],
        correspondencia_exata: EXATO,
        outros_com_a_palavra: [RADIADOR, CIMENTO],
      },
      "cimento"
    );
    assert(g.exato?.codigo_produto_erp === "E1", "agrupar: o exato do backend continua sendo o exato");
    assert(
      g.lista.map((p) => p.codigo_produto_erp).join(",") === "E1,0004325,AL221117",
      "agrupar: exato → relevante → ruído, nesta ordem"
    );
    assert(g.relevantes[0] === CIMENTO && g.ruido[0] === RADIADOR, "agrupar: a régua vale para os 'outros'");
  }
  {
    /*
      O termo dos "outros" é o ENCURTADO, quando o backend encurtou (pendência 15).

      Para revelar os irmãos escondidos pela correspondência exata, o backend reconsulta com o
      termo menos um caractere e diz qual usou. "FILTRANTE" entra na lista por casar `filtr` e
      NÃO contém `filtro`: classificá-lo contra o termo digitado o mandaria para um bloco
      afirmando que ele contém uma palavra que ele não contém.
    */
    const EXATO = { codigo_produto_erp: "E1", descricao: "FILTRO" };
    const FILTRANTE = { codigo_produto_erp: "F1", descricao: "ELEMENTO FILTRANTE SEPARADOR" };
    const g = agruparCandidatosProduto(
      {
        status: "multiplos_produtos",
        produtos: [EXATO, FILTRANTE],
        correspondencia_exata: EXATO,
        outros_com_a_palavra: [FILTRANTE],
        termo_dos_outros: "filtr",
      },
      "filtro"
    );
    assert(g.termo === "filtr", "agrupar: o termo que vale para os outros é o que o backend usou");
    assert(
      g.relevantes[0] === FILTRANTE && g.ruido.length === 0,
      "agrupar: 'FILTRANTE' é relevante contra 'filtr' — e seria ruído contra 'filtro'"
    );
    assert(
      tituloCandidatosRuido(g.termo) === 'Também contêm "filtr"',
      "agrupar: o rótulo do ruído cita o termo que de fato casou, não um que não casa"
    );
  }
  assert(
    agruparCandidatosProduto({ status: "multiplos_produtos", produtos: [RADIADOR] }).ruido.length === 0,
    "agrupar: chamada SEM termo (compatível com antes) não rebaixa ninguém"
  );

  /* ---- o destaque: por que esta linha apareceu ---- */
  {
    const pedacos = fatiarDestaque("ARREFECIMENTO", "cimento");
    assert(pedacos.length === 2, "destaque: 'ARREFECIMENTO' se parte em 'ARREFE' + 'CIMENTO'");
    assert(pedacos[0].destaque === false && pedacos[1].destaque === true, "destaque: só o trecho casado acende");
    assert(pedacos[1].texto === "CIMENTO", "destaque: o trecho sai com a caixa ORIGINAL do catálogo");
  }
  {
    // A invariante que impede a descrição de virar outra coisa: colar tudo devolve o original.
    const textos = [
      "AL221117 - RADIADOR DO SISTEMA DE ARREFECIMENTO - MAHLE",
      "FILTRO AR EXT/INT MOTOR YUNNEI BRT15/20/23",
      "ÓLEO ÓLEO ÓLEO",
      "CIMENTO",
      "—",
    ];
    for (const texto of textos) {
      for (const termo of ["cimento", "oleo", "ext", "zzz", ""]) {
        assert(
          fatiarDestaque(texto, termo).map((p) => p.texto).join("") === texto,
          `destaque: "${texto}" + "${termo}" devolve a descrição inteira, sem perder caractere`
        );
      }
    }
  }
  assert(
    fatiarDestaque("ÓLEO LUBRIFICANTE", "oleo")[0].texto === "ÓLEO",
    "destaque: o acento do catálogo é preservado no trecho aceso"
  );
  {
    const pedacos = fatiarDestaque("A A A A A A", "a");
    const acesos = pedacos.filter((p) => p.destaque).length;
    assert(acesos === 3, "destaque: no máximo três trechos acendem — mais que isso vira listra ilegível");
    assert(pedacos.map((p) => p.texto).join("") === "A A A A A A", "destaque: e o resto do texto continua lá");
  }
  assert(
    fatiarDestaque("CIMENTO", "zzz").length === 1 &&
      fatiarDestaque("CIMENTO", "zzz")[0].destaque === false,
    "destaque: sem casamento sai um pedaço só — a tela fica idêntica à de antes"
  );
  assert(fatiarDestaque("", "cimento").length === 0, "destaque: texto vazio não vira pedaço nenhum");
  assert(fatiarDestaque("CIMENTO", "").length === 1, "destaque: sem termo não acende nada");

  /* ---- o título do bloco de ruído ---- */
  assert(
    tituloCandidatosRuido("cimento") === 'Também contêm "cimento"',
    "ruído: o título diz o que aquilo é, com o termo pesquisado"
  );
  assert(
    !/relevante|irrelevante|ruído|lixo/i.test(tituloCandidatosRuido("cimento")),
    "ruído: nada de jargão nosso na tela — o item continua sendo um resultado"
  );
  assert(tituloCandidatosRuido("  ") === "Também contêm o termo pesquisado", "ruído: sem termo, o título ainda se lê");

  /* ---- o resgate de duas palavras: qual palavra, e quando nenhuma ---- */
  assert(termoDeResgate("oleo filtro") === "filtro", "resgate: escolhe a palavra MAIS LONGA (mais específica)");
  assert(termoDeResgate("oleo filtro motor") === "filtro", "resgate: com três palavras, a mais longa também");
  assert(termoDeResgate("filtro") === null, "resgate: uma palavra só não tem o que resgatar");
  assert(termoDeResgate("  filtro  ") === null, "resgate: espaço em volta não inventa segunda palavra");
  assert(termoDeResgate("oleo  filtro") === "filtro", "resgate: espaço repetido não atrapalha");
  assert(termoDeResgate("ab cd") === null, "resgate: nenhuma palavra com 3 caracteres — não vale a chamada");
  assert(termoDeResgate("ab filtro") === "filtro", "resgate: a palavra curta é ignorada, a longa serve");
  assert(termoDeResgate("juta soja") === "juta", "resgate: empate fica com a primeira — a ordem em que ela pensou");
  for (const ruim of [null, undefined, "", "   ", 42]) {
    assert(termoDeResgate(ruim) === null, `resgate: entrada ${JSON.stringify(ruim)} não dispara nada`);
  }
  {
    const msg = mensagemResgateBusca("oleo filtro", "filtro");
    assert(/oleo filtro/.test(msg), "resgate: a frase cita o que a pessoa digitou");
    assert(/"filtro"/.test(msg), "resgate: e cita o termo que de fato trouxe os resultados");
    assert(/Nada com/.test(msg), "resgate: diz primeiro que o termo dela não achou nada");
  }
  assert(mensagemResgateBusca("", "filtro") === "", "resgate: sem os dois termos não há frase a escrever");
}

/* ------------------------------------------------------------------ *
 * 13. O que o PICKER não pode fazer
 * ------------------------------------------------------------------ *
 * Olha o fonte porque o que se proíbe aqui é caminho de execução e aritmética sobre dinheiro,
 * não valor de saída: uma busca alternativa disparada sozinha custa chamada à WM num termo que
 * o atendente não pediu, e um preço derivado na tela é um preço inventado.
 */
{
  const { readFileSync } = await import("node:fs");
  const picker = readFileSync(new URL("../src/conversa/orcamento/ProdutoPicker.jsx", import.meta.url), "utf8");

  const chamadas = picker.split("\n").filter((l) => /consultarProdutosOrcamento\(/.test(l));
  // DUAS chamadas, e exatamente duas: a busca (dentro de `pedirPagina`) e o "ver preço" por
  // código. Uma terceira seria caminho novo para o servidor da loja — é isso que esta conta
  // protege. O resgate de duas palavras NÃO abre caminho novo: ele reusa `pedirPagina`.
  assert(chamadas.length === 2, `picker: a WM é consultada de DOIS lugares só — achei ${chamadas.length}`);
  assert(/const DEBOUNCE_MS = 800;/.test(picker), "picker: o debounce de 800 ms continua de pé");
  assert(/const MIN_CARACTERES = 3;/.test(picker), "picker: o mínimo de 3 caracteres continua de pé");
  assert(
    !/setTimeout[\s\S]{0,200}buscar\(termo\.trim\(\)\.split/.test(picker),
    "picker: o estado vazio NÃO dispara busca alternativa por conta própria"
  );

  /*
    O RESGATE: no máximo UMA segunda consulta, e só no vazio.

    Estas contas são o que impede a correção de virar cascata — duas palavras que não acham
    nada dispararem três, quatro consultas ao servidor da loja atrás de alguma que ache.
  */
  {
    const pedidos = picker.split("\n").filter((l) => /await pedirPagina\(/.test(l));
    assert(
      pedidos.length === 2,
      `resgate: a busca pede no máximo DUAS páginas (a do termo e a do resgate) — achei ${pedidos.length}`
    );
    const iniBuscar = picker.indexOf("const buscar = useCallback");
    const corpoBuscar = picker.slice(iniBuscar, picker.indexOf("[cancelarEmVoo, limparDetalhes]", iniBuscar));
    assert(corpoBuscar.length > 0, "resgate: o corpo da busca é isolável");
    assert(
      /grupos\.lista\.length === 0/.test(corpoBuscar),
      "resgate: a segunda tentativa é condicionada ao resultado VAZIO — nunca para melhorar o que veio"
    );
    assert(
      /resgateRecusadoRef\.current !== termoLimpo/.test(corpoBuscar),
      "resgate: quem pediu para ver só o que digitou não é resgatada de novo"
    );
    assert(
      !/\bbuscar\(/.test(corpoBuscar),
      "resgate: a busca não chama a si mesma — recursão aqui é cascata de chamadas à WM"
    );
    assert(
      !/termoDeResgate\([\s\S]{0,400}termoDeResgate\(/.test(corpoBuscar),
      "resgate: o termo alternativo é escolhido UMA vez; não há segunda rodada de encurtamento"
    );
    assert(
      /termoDeResgate\(termoLimpo\)/.test(corpoBuscar),
      "resgate: o alternativo sai do que a pessoa digitou, não do termo já resgatado"
    );
  }

  // O resgate precisa estar DITO na tela: lista de outro termo sem aviso é mentira silenciosa.
  assert(
    /mensagemResgateBusca\(resgate\.digitado, resgate\.usado\)/.test(picker),
    "resgate: a tela nomeia os dois termos — o digitado e o que trouxe os resultados"
  );
  assert(
    /voltarAoTermoDigitado/.test(picker),
    "resgate: há volta para o termo original, e ela não custa chamada nenhuma"
  );
  {
    const iniVolta = picker.indexOf("const voltarAoTermoDigitado");
    const corpoVolta = picker.slice(iniVolta, picker.indexOf("[resgate, limparDetalhes]", iniVolta));
    assert(
      !/pedirPagina|consultarProdutosOrcamento|buscar\(/.test(corpoVolta),
      "resgate: desfazer o resgate é local — o vazio do termo dela já é conhecido"
    );
  }

  // O ruído é rebaixado, NUNCA escondido, e a contagem da WM não é reescrita.
  assert(
    /grupos\.ruido\.map\(/.test(picker),
    "ruído: os itens de ruído continuam sendo impressos — às vezes é o que ela quer"
  );
  assert(
    /tituloCandidatosRuido\(grupos\.termo\)/.test(picker),
    "ruído: o bloco é rotulado com o termo pesquisado, não largado sem explicação"
  );
  const semComentario = picker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert(
    !/(preco|valor)[A-Za-z_]*\s*[*/+]\s*/.test(semComentario),
    "picker: nenhuma aritmética sobre preço na tela — o número é o da WM"
  );
  assert(
    !/R\$ 0,00|"0,00"/.test(semComentario),
    "picker: nenhum zero monetário literal — ausência é '—', nunca 'de graça'"
  );
  // Paginação sem clamp: página além da última é erro do contrato, não algo a corrigir.
  assert(
    /tem_mais/.test(picker) && /tem_anterior/.test(picker),
    "picker: os botões de página continuam presos ao que a WM autoriza"
  );
}

/* ------------------------------------------------------------------ *
 * 14. Preço do item escolhido — o cache por código
 * ------------------------------------------------------------------ *
 * A LISTA de candidatos da WM não traz preço, e buscá-lo para os 30 da página seriam 30
 * consultas em tempo real no SQL Server da própria loja a cada busca (seção 11). Então o preço
 * é consultado no TOQUE: uma chamada, por código, do item que a atendente acabou de escolher.
 *
 * Estas asserções guardam as três coisas que, se cederem, custam dinheiro de verdade: nenhum
 * valor inventado, nenhuma chamada repetida sozinha e nenhuma cópia chamada de "atual".
 */
{
  /* ---- presença: `0` é valor, ausência não é ---- */
  assert(valorPresente("0.000") === true, "presença: estoque zerado é VALOR (e não bloqueia venda)");
  assert(valorPresente(0) === true, "presença: zero numérico é valor, não ausência");
  assert(valorPresente("-2.125") === true, "presença: estoque negativo é valor");
  assert(valorPresente(false) === true, "presença: `ativo: false` é informação, não ausência");
  for (const ausente of [null, undefined, "", "   ", NaN, {}, []]) {
    assert(
      valorPresente(ausente) === false,
      `presença: ${JSON.stringify(ausente)} é ausência — e ausência vira "${SEM_VALOR}", nunca 0`
    );
  }

  /* ---- extração: copia só o que existe, e nada mais ---- */
  {
    const valores = extrairValoresDoProduto({
      codigo_produto_erp: "7001",
      descricao: "PISO",
      preco_unitario: "33.038",
      estoque_previsto: "0.000",
      unidade: "M2",
      ativo: false,
      // Campos que NÃO são valor não têm por que viajar no cache de preço.
      grupo: "PISOS",
      codigo_barras: "789",
    });
    assert(valores.preco_unitario === "33.038", "extração: o decimal da WM é copiado byte a byte");
    assert(valores.estoque_previsto === "0.000", "extração: estoque zerado é copiado como veio");
    assert(valores.unidade === "M2" && valores.ativo === false, "extração: unidade e `ativo` viajam");
    assert(
      !("grupo" in valores) && !("codigo_barras" in valores) && !("descricao" in valores),
      "extração: só os quatro campos de valor entram — o resto fica fora"
    );
  }
  assert(
    extrairValoresDoProduto({ codigo_produto_erp: "1", descricao: "X" }) === null,
    "extração: candidato de lista (sem preço) não gera entrada de valor nenhuma"
  );
  for (const ruim of [null, undefined, "", 42, []]) {
    assert(
      extrairValoresDoProduto(ruim) === null,
      `extração: entrada ${JSON.stringify(ruim)} não vira valor`
    );
  }
  assert(
    extrairValoresDoProduto({ preco_unitario: "0" }).preco_unitario === "0",
    'extração: preço "0" é um preço — quem some é a ausência'
  );

  /* ---- já tem preço? então não se gasta chamada ---- */
  assert(produtoJaTemPreco({ preco_unitario: "10.00" }) === true, "resolvido já traz preço");
  assert(produtoJaTemPreco({ descricao: "X" }) === false, "candidato de lista não traz preço");
  assert(produtoJaTemPreco(null) === false, "produto inexistente não traz preço");

  /* ---- leitura da resposta por código ---- */
  {
    const ok = valoresDaRespostaPorCodigo(
      {
        status: "produto",
        produto: { codigo_produto_erp: "7001", preco_unitario: "33.038", unidade: "M2" },
        meta: { fonte: "tempo_real" },
      },
      "7001"
    );
    assert(ok.valores.preco_unitario === "33.038", "resposta: o preço do código pedido é lido");
    assert(ok.meta.fonte === "tempo_real", "resposta: a procedência vem junto com o valor");
  }
  assert(
    valoresDaRespostaPorCodigo(
      { status: "produto", produto: { codigo_produto_erp: "OUTRO", preco_unitario: "9.99" } },
      "7001"
    ) === null,
    "resposta: preço de OUTRO código nunca responde pelo código pedido"
  );
  assert(
    valoresDaRespostaPorCodigo(
      {
        status: "multiplos_produtos",
        produtos: [{ codigo_produto_erp: "7001", preco_unitario: "1.00" }],
      },
      "7001"
    ) === null,
    "resposta: preço NÃO é pescado de dentro de uma lista — só o ramo resolvido vale"
  );
  for (const ruim of [null, undefined, {}, { status: "produto" }, 42]) {
    assert(
      valoresDaRespostaPorCodigo(ruim, "7001") === null,
      `resposta: forma ${JSON.stringify(ruim)} não produz valor`
    );
  }

  /* ---- quando vale gastar uma chamada ---- */
  assert(
    precisaConsultarPreco({}, { codigo_produto_erp: "7001" }) === true,
    "chamada: candidato de lista sem entrada no cache merece UMA consulta"
  );
  assert(
    precisaConsultarPreco({}, { codigo_produto_erp: "7001", preco_unitario: "1.00" }) === false,
    "chamada: produto que já veio com preço não gasta chamada nenhuma"
  );
  assert(
    precisaConsultarPreco({ 7001: { estado: ESTADO_PRECO.OK } }, { codigo_produto_erp: "7001" }) ===
      false,
    "chamada: código já consultado não é consultado de novo (adicionar 2x = quantidade)"
  );
  assert(
    precisaConsultarPreco(
      { 7001: { estado: ESTADO_PRECO.FALHOU } },
      { codigo_produto_erp: "7001" }
    ) === false,
    "chamada: consulta que FALHOU não se repete sozinha — seria chamada no servidor do cliente"
  );
  assert(
    precisaConsultarPreco(
      { 7001: { estado: ESTADO_PRECO.CARREGANDO } },
      { codigo_produto_erp: "7001" }
    ) === false,
    "chamada: com uma consulta em voo, o toque repetido não abre a segunda"
  );
  for (const semCodigo of [null, undefined, {}, { codigo_produto_erp: "" }]) {
    assert(
      precisaConsultarPreco({}, semCodigo) === false,
      `chamada: sem código não há o que consultar (${JSON.stringify(semCodigo)})`
    );
  }

  /* ---- procedência do conjunto: vale a linha MAIS FRACA ---- */
  assert(procedenciaDosValores(null) === null, "procedência: sem mapa, nada a dizer");
  assert(procedenciaDosValores({}) === null, "procedência: carrinho sem valor não fala de fonte");
  assert(
    procedenciaDosValores({ a: { estado: ESTADO_PRECO.CARREGANDO } }) === null,
    "procedência: consulta em voo ainda não é valor na tela"
  );
  assert(
    procedenciaDosValores({ a: { estado: ESTADO_PRECO.FALHOU } }) === null,
    "procedência: falha não produz afirmação sobre fonte"
  );
  {
    const tudoAgora = procedenciaDosValores({
      a: {
        estado: ESTADO_PRECO.OK,
        valores: { preco_unitario: "1.00" },
        // O backend manda os dois campos: `tempo_real` é derivado lá de `fonte`.
        meta: { fonte: "tempo_real", tempo_real: true },
      },
      b: {
        estado: ESTADO_PRECO.OK,
        valores: { preco_unitario: "2.00" },
        meta: { tempo_real: true },
      },
    });
    assert(
      rotuloFonte(tudoAgora)?.tempoReal === true,
      "procedência: tudo em tempo real pode ser apresentado como 'agora'"
    );
    assert(
      rotuloFonte(
        procedenciaDosValores({
          a: {
            estado: ESTADO_PRECO.OK,
            valores: { preco_unitario: "1.00" },
            meta: { fonte: "tempo_real" },
          },
        })
      )?.tempoReal === false,
      "procedência: a string 'tempo_real' sem o booleano não basta — mesma régua de rotuloFonte"
    );
  }
  {
    const misturado = procedenciaDosValores({
      a: {
        estado: ESTADO_PRECO.OK,
        valores: { preco_unitario: "1.00" },
        meta: { fonte: "tempo_real" },
      },
      b: {
        estado: ESTADO_PRECO.OK,
        valores: { preco_unitario: "2.00" },
        meta: { fonte: "cache_cloud" },
      },
    });
    const rotulo = rotuloFonte(misturado);
    assert(
      rotulo?.tempoReal === false,
      "procedência: UMA cópia no conjunto derruba o 'agora' de todos"
    );
    assert(/cópia/i.test(rotulo.texto), "procedência: conjunto misturado é apresentado como cópia");
    assert(
      !/atual|agora|tempo real/i.test(rotulo.texto),
      "procedência: palavra proibida não escapa pelo caminho do conjunto"
    );
  }
  {
    const semMeta = procedenciaDosValores({
      a: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "1.00" }, meta: null },
    });
    assert(
      rotuloFonte(semMeta)?.tempoReal === false,
      "procedência: sem meta, o valor é tratado como cópia (nunca como atual)"
    );
  }
}

/* ------------------------------------------------------------------ *
 * 15. Estoque sem saldo: destaque, nunca bloqueio
 * ------------------------------------------------------------------ *
 * O contrato permite estoque zerado e negativo, e nenhum dos dois impede a venda — quem decide
 * é o ERP. `estoqueSemSaldo` existe só para DESTACAR o número, e por isso ausência tem de
 * devolver `false`: ausência é "—", não "sem estoque".
 */
assert(estoqueSemSaldo("0.000") === true, "estoque: zero não tem saldo");
assert(estoqueSemSaldo("-2.125") === true, "estoque: negativo não tem saldo (e é permitido)");
assert(estoqueSemSaldo(0) === true, "estoque: zero numérico também");
assert(estoqueSemSaldo("3") === false, "estoque: positivo tem saldo");
assert(estoqueSemSaldo("0.001") === false, "estoque: a menor fração positiva ainda é saldo");
for (const ausente of [null, undefined, "", "   ", "abc", {}, NaN]) {
  assert(
    estoqueSemSaldo(ausente) === false,
    `estoque: ausência (${JSON.stringify(ausente)}) NÃO é "sem estoque" — é "—"`
  );
}

/* ------------------------------------------------------------------ *
 * 16. O que o DRAWER e o FORMULÁRIO não podem fazer com o preço
 * ------------------------------------------------------------------ *
 * Olha o fonte porque o que se proíbe é caminho de execução: uma consulta por item dentro de um
 * `useEffect` ou de um laço viraria N chamadas em TEMPO REAL no SQL Server da loja do cliente a
 * cada abertura do drawer — exatamente o custo que consultar-no-toque evita.
 */
{
  const { readFileSync } = await import("node:fs");
  const drawer = readFileSync(
    new URL("../src/conversa/orcamento/OrcamentoDrawer.jsx", import.meta.url),
    "utf8"
  );
  const form = readFileSync(
    new URL("../src/conversa/orcamento/OrcamentoForm.jsx", import.meta.url),
    "utf8"
  );
  const semComentario = (texto) =>
    texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const chamadas = drawer.split("\n").filter((l) => /consultarProdutosOrcamento\(/.test(l));
  assert(
    chamadas.length === 1,
    `drawer: o preço é consultado de UM lugar só — achei ${chamadas.length}`
  );
  assert(
    /codigo_produto_erp: codigo/.test(drawer),
    "drawer: a consulta de preço é POR CÓDIGO (uma só), nunca uma busca por termo"
  );

  const drawerLimpo = semComentario(drawer);
  // O drawer nunca INVOCA a consulta: ela só é entregue ao formulário como prop, e quem a
  // chama é o toque da atendente num candidato. Sem chamada no fonte não há `useEffect`, laço
  // nem retry possível — é a forma mais curta de provar as três proibições de uma vez.
  assert(
    (drawerLimpo.match(/consultarPrecoDoItem\(/g) || []).length === 0,
    "drawer: a consulta de preço não é invocada em lugar nenhum do fonte — só pelo toque"
  );
  assert(
    /onProdutoEscolhido=\{consultarPrecoDoItem\}/.test(drawerLimpo),
    "drawer: ela chega ao formulário como prop, para o clique no candidato acioná-la"
  );
  // O corpo da consulta de preço, isolado: é nele que a proibição vale. (Zerar `erro` e o
  // cache no mesmo efeito de reset é outra coisa, e é correta.)
  {
    const ini = drawerLimpo.indexOf("const consultarPrecoDoItem");
    const corpo = ini >= 0 ? drawerLimpo.slice(ini, drawerLimpo.indexOf("[anotarPreco]", ini)) : "";
    assert(corpo.length > 0, "drawer: a consulta de preço continua existindo e isolável");
    assert(
      !/setErro\(|setAvisoCampo\(|setEtapa\(/.test(corpo),
      "drawer: falha de preço não vira erro, aviso nem troca de tela — não impede o orçamento"
    );
    assert(
      !/setTimeout|retry|tentarDeNovo/.test(corpo),
      "drawer: nenhuma retentativa automática de preço — seria chamada no servidor do cliente"
    );
    assert(
      /precisaConsultarPreco\(precosRef\.current/.test(corpo),
      "drawer: a decisão de gastar uma chamada sai do espelho SÍNCRONO, não de um atualizador de estado"
    );
  }
  assert(
    /setPrecos\(\{\}\)/.test(drawer),
    "drawer: o cache de preço morre ao trocar de conversa e ao limpar o rascunho"
  );
  assert(
    /ESTADO_PRECO\.FALHOU/.test(drawer),
    "drawer: a falha é um estado da linha, não um erro do orçamento"
  );

  const formLimpo = semComentario(form);
  assert(
    !/consultarProdutosOrcamento/.test(form),
    "form: o formulário não fala com a WM — quem consulta é o drawer, de um lugar só"
  );
  assert(
    !/(preco|valor)[A-Za-z_]*\s*[*/+]\s*/.test(formLimpo),
    "form: nenhuma aritmética sobre preço no carrinho — a tela não soma, o ERP calcula"
  );
  assert(
    !/R\$ 0,00|"0,00"/.test(formLimpo),
    "form: nenhum zero monetário literal no carrinho"
  );
  assert(
    /calculado pelo ERP/.test(form),
    "form: o rodapé continua dizendo que o total é do ERP em vez de exibir uma soma própria"
  );
}

/* ------------------------------------------------------------------ *
 * 17. Estoque em três faixas — a cor reforça, o texto informa
 * ------------------------------------------------------------------ *
 * O contrato permite vender com estoque zerado e negativo, e nenhuma faixa daqui bloqueia
 * nada. O que elas fazem é deixar a atendente ver, de relance numa lista de trinta, onde o
 * saldo é apertado. Por isso a informação mora no TEXTO: quem não distingue cor lê o mesmo.
 */
assert(nivelEstoque("120.000") === NIVEL_ESTOQUE.FOLGA, "faixa: saldo alto é folga");
assert(nivelEstoque("5") === NIVEL_ESTOQUE.POUCO, `faixa: ${ESTOQUE_POUCO_ATE} ainda é pouco`);
assert(nivelEstoque("5.001") === NIVEL_ESTOQUE.FOLGA, "faixa: logo acima do limite já é folga");
assert(nivelEstoque("0.001") === NIVEL_ESTOQUE.POUCO, "faixa: a menor fração positiva é pouco, não ausência");
assert(nivelEstoque("0.000") === NIVEL_ESTOQUE.SEM, "faixa: zero é sem saldo");
assert(nivelEstoque("-2.125") === NIVEL_ESTOQUE.SEM, "faixa: negativo é sem saldo (e é permitido)");
for (const ausente of [null, undefined, "", "   ", "abc", {}, NaN, true]) {
  assert(
    nivelEstoque(ausente) === null,
    `faixa: ausência (${JSON.stringify(ausente)}) não tem faixa — não é "sem estoque"`
  );
  assert(textoEstoque(ausente) === "", "faixa: ausência não produz texto nenhum");
  assert(classeEstoque(ausente) === "", "faixa: ausência não produz classe nenhuma");
}
assert(textoEstoque("120.000") === "Estoque 120", "texto: folga mostra o número sem as casas vazias");
assert(textoEstoque("3") === "Estoque 3", "texto: pouco mostra o número");
assert(textoEstoque("0.000") === "Sem estoque", "texto: zero é dito por extenso");
assert(/--folga$/.test(classeEstoque("9")), "classe: folga");
assert(/--pouco$/.test(classeEstoque("2")), "classe: pouco");
assert(/--sem/.test(classeEstoque("0")), "classe: sem saldo");
assert(
  classeEstoque("2") !== classeEstoque("9") && classeEstoque("0") !== classeEstoque("2"),
  "classe: as três faixas são distinguíveis entre si"
);
// A régua antiga continua de pé: quem já lia `estoqueSemSaldo` lê a mesma coisa.
assert(
  estoqueSemSaldo("0.000") === true && estoqueSemSaldo("3") === false,
  "faixa: `estoqueSemSaldo` não mudou de ideia"
);

/* ---- Saldo NEGATIVO não é "sem estoque" ------------------------------------------------ *
 * Medido no catálogo real da Tijolar em 26/10/2026: 8 de 36 produtos resolvidos vinham com saldo
 * negativo (`-908.000`, `-3943.500`) e 13 com zero. Os dois casos saíam pela MESMA frase, "Sem
 * estoque", com o negativo num aparte entre parênteses. Zero é "acabou"; negativo é o inventário
 * da loja errado, e o número não descreve a prateleira — é o caso que pede conferência antes de
 * prometer entrega. As duas leituras não podem voltar a ser a mesma.
 */
assert(estoqueNegativo("-908.000") === true, "negativo: saldo negativo é reconhecido");
assert(estoqueNegativo("0.000") === false, "negativo: zero NÃO é negativo");
assert(estoqueNegativo("3") === false, "negativo: positivo não é negativo");
for (const ausente of [null, undefined, "", "   ", "abc", true]) {
  assert(
    estoqueNegativo(ausente) === false,
    `negativo: ausência (${JSON.stringify(ausente)}) não é negativo — ninguém informou nada`
  );
}
assert(
  textoEstoque("-908.000", "SC") === "Saldo -908 SC",
  "negativo: o texto diz SALDO e traz o número inteiro, sem aparte entre parênteses"
);
assert(
  textoEstoque("-908.000") !== textoEstoque("0.000"),
  "negativo: a frase do negativo é diferente da do zero — era isto que faltava"
);
assert(
  !/sem estoque/i.test(textoEstoque("-2.125")),
  'negativo: "sem estoque" esconderia que o número não descreve a prateleira'
);
assert(
  /-2,125/.test(textoEstoque("-2.125")),
  "negativo: o número continua à vista — ele é informação do ERP sobre o item"
);
assert(
  /--negativo/.test(classeEstoque("-2.125")) && !/--negativo/.test(classeEstoque("0.000")),
  "negativo: a classe distingue negativo de zero (e o texto já distinguia — cor não é sinal único)"
);
assert(
  /--sem/.test(classeEstoque("-2.125")),
  "negativo: continua na faixa `sem` — `nivelEstoque` e `estoqueSemSaldo` não mudaram de ideia"
);
assert(
  estoqueSemSaldo("-2.125") === true,
  "negativo: `estoqueSemSaldo` continua dizendo que negativo não tem saldo"
);
assert(
  TITULO_SALDO_NEGATIVO.length > 40 && !/zaperp/i.test(TITULO_SALDO_NEGATIVO),
  "negativo: a explicação manda conferir na loja — e não acusa o ZapERP de um defeito do ERP"
);

/* ------------------------------------------------------------------ *
 * A IDADE DO SALDO — "352,5 em estoque" de quando?
 * ------------------------------------------------------------------ *
 * `meta.fonte: "tempo_real"` diz que a CONSULTA foi ao vivo, não que o valor é de agora. Medido
 * no ERP real em 26/10/2026, em 36 produtos: a idade de `estoque_sincronizado_em` vinha em dois
 * regimes, 0,2–2,5 h ou 86,6 h (3,6 dias), com mediana de 86,6 h. Quem promete prazo de entrega
 * ao cliente decide em cima desse número, e as duas situações apareciam idênticas na tela.
 */
{
  const AGORA = Date.parse("2026-10-26T12:00:00.000Z");
  const atras = (ms) => new Date(AGORA - ms).toISOString();
  const MIN = 60 * 1000;
  const HORA = 60 * MIN;
  const DIA = 24 * HORA;

  /* ---- Ausência não vira "agora": é o defeito que esta linha existe para corrigir ---- */
  for (const nada of [null, undefined, "", "   ", "abc", 0, {}, "2026-13-45"]) {
    assert(
      idadeLegivel(nada, AGORA) === "",
      `idade: carimbo inutilizável (${JSON.stringify(nada)}) não produz idade nenhuma`
    );
    assert(
      idadeDoSaldo(nada, AGORA) === null,
      `idade: sem carimbo (${JSON.stringify(nada)}) a tela não escreve nada — e NUNCA "agora"`
    );
  }

  /* ---- Linguagem de gente, nas bordas de cada unidade ---- */
  assert(idadeLegivel(atras(0), AGORA) === "agora", "idade: o próprio instante é 'agora'");
  assert(idadeLegivel(atras(30 * 1000), AGORA) === "agora", "idade: meio minuto é 'agora'");
  assert(
    idadeLegivel(atras(-5 * 1000), AGORA) === "agora",
    "idade: carimbo no FUTURO (relógio do servidor adiantado) é 'agora', nunca 'há -1 min'"
  );
  assert(
    idadeLegivel(atras(-6 * HORA), AGORA) === "agora",
    "idade: futuro distante também não produz idade negativa"
  );
  assert(idadeLegivel(atras(90 * 1000), AGORA) === "há 1 min", "idade: 90 s já é um minuto");
  assert(idadeLegivel(atras(12 * MIN), AGORA) === "há 12 min", "idade: minutos, por extenso");
  assert(
    idadeLegivel(atras(59 * MIN + 59 * 1000), AGORA) === "há 59 min",
    "idade: um segundo antes da hora ainda são minutos"
  );
  assert(idadeLegivel(atras(HORA), AGORA) === "há 1 h", "idade: a hora exata vira hora");
  assert(idadeLegivel(atras(3 * HORA), AGORA) === "há 3 h", "idade: horas");
  assert(
    idadeLegivel(atras(DIA - 1000), AGORA) === "há 23 h",
    "idade: um segundo antes do dia ainda são horas"
  );
  assert(idadeLegivel(atras(DIA), AGORA) === "há 1 dia", "idade: o dia exato é SINGULAR");
  assert(idadeLegivel(atras(2 * DIA), AGORA) === "há 2 dias", "idade: dias no plural");
  assert(
    idadeLegivel(atras(86.6 * HORA), AGORA) === "há 3 dias",
    "idade: 86,6 h (a mediana medida) arredonda para BAIXO, como se fala"
  );

  /* ---- Até 24 h é informação; daí em diante é aviso ---- */
  assert(
    idadeDoSaldo(atras(0), AGORA).texto === "Saldo atualizado agora",
    "idade: a frase nomeia o SALDO, que é o número que está ao lado dela"
  );
  assert(
    idadeDoSaldo(atras(3 * HORA), AGORA).aviso === false,
    "idade: saldo de três horas é dito, calado — alarme em tudo é alarme em nada"
  );
  assert(
    idadeDoSaldo(atras(DIA - 1000), AGORA).aviso === false,
    `idade: um segundo antes das ${IDADE_SALDO_AVISO_HORAS} h ainda não é aviso`
  );
  assert(
    idadeDoSaldo(atras(IDADE_SALDO_AVISO_HORAS * HORA), AGORA).aviso === true,
    `idade: ${IDADE_SALDO_AVISO_HORAS} h em ponto já é aviso`
  );
  const velho = idadeDoSaldo(atras(86.6 * HORA), AGORA);
  assert(velho.aviso === true, "idade: a mediana medida (86,6 h) é aviso");
  assert(velho.texto === "Saldo atualizado há 3 dias", "idade: e a frase diz quanto tempo faz");
  assert(
    /entrega/.test(velho.titulo),
    "idade: o aviso diz a CONSEQUÊNCIA (conferir antes de prometer entrega), não só a data"
  );
  assert(
    idadeDoSaldo(atras(3 * HORA), AGORA).titulo === "",
    "idade: saldo fresco não carrega conselho nenhum — não há o que fazer a respeito"
  );

  /* ---- A IDADE ANDA: é por isso que `agora` é parâmetro ---- */
  const carimbo = atras(50 * MIN);
  assert(idadeDoSaldo(carimbo, AGORA).idade === "há 50 min", "idade: lida no instante da consulta");
  assert(
    idadeDoSaldo(carimbo, AGORA + 20 * MIN).idade === "há 1 h",
    "idade: vinte minutos depois, com o drawer aberto, a MESMA resposta já é outra idade"
  );
  assert(
    idadeDoSaldo(carimbo, AGORA + 3 * DIA).aviso === true,
    "idade: o que era fresco vira aviso só pela passagem do tempo — nada é reconsultado"
  );
  // Sem `agora`, o padrão é o relógio real: a chamada não pode exigir o parâmetro para funcionar.
  assert(
    idadeDoSaldo(new Date().toISOString())?.idade === "agora",
    "idade: sem instante de referência, usa o relógio de agora"
  );

  /* ---- Os DOIS carimbos, que não se misturam ---- *
   * `estoque_sincronizado_em` é do SALDO; `sincronizado_em` é do CADASTRO (descrição, preço,
   * grupo). Medido no mesmo produto real (`0000209`): saldo de 86,6 h e cadastro de 92,3 h.
   * Datar o saldo com a data do cadastro seria uma data certa sobre o número errado.
   */
  const carimbos = carimbosDoProduto({
    codigo_produto_erp: "0000209",
    estoque_sincronizado_em: "2026-10-23T00:09:24.272Z",
    sincronizado_em: "2026-10-22T18:26:16.860Z",
    preco_unitario: "18.420",
  });
  assert(
    carimbos.estoque_sincronizado_em === "2026-10-23T00:09:24.272Z",
    "carimbos: o do saldo atravessa"
  );
  assert(
    carimbos.sincronizado_em === "2026-10-22T18:26:16.860Z",
    "carimbos: o do cadastro atravessa, separado — são afirmações diferentes"
  );
  assert(
    carimbos.estoque_sincronizado_em !== carimbos.sincronizado_em,
    "carimbos: no produto real medido eles DIFEREM — confundi-los dataria o número errado"
  );
  assert(
    carimbosDoProduto({ codigo_produto_erp: "1" }) === null,
    "carimbos: produto sem carimbo nenhum devolve null, e a tela não escreve nada"
  );
  assert(
    carimbosDoProduto({ estoque_sincronizado_em: "   " }) === null,
    "carimbos: carimbo em branco é ausência"
  );
  for (const nada of [null, undefined, "x", 7]) {
    assert(carimbosDoProduto(nada) === null, "carimbos: entrada que não é produto devolve null");
  }
  // E eles chegam pela consulta por código, junto com os valores — não numa segunda leitura.
  const comCarimbo = valoresDaRespostaPorCodigo(
    {
      status: "produto",
      produto: {
        codigo_produto_erp: "0000209",
        preco_unitario: "18.420",
        estoque_previsto: "352.500",
        estoque_sincronizado_em: "2026-10-23T00:09:24.272Z",
      },
      meta: { fonte: "tempo_real", tempo_real: true },
    },
    "0000209"
  );
  assert(
    comCarimbo?.carimbos?.estoque_sincronizado_em === "2026-10-23T00:09:24.272Z",
    "carimbos: o 'ver preço' traz a idade junto com o saldo, do mesmo produto"
  );
  assert(
    comCarimbo?.valores?.estoque_previsto === "352.500",
    "carimbos: e o saldo continua chegando como veio"
  );
}

/* ------------------------------------------------------------------ *
 * O DESCONTO DO ERP — só quando existe de verdade
 * ------------------------------------------------------------------ *
 * A prévia traz `valor_total_bruto` e `valor_desconto_unit` por item. Medido ao vivo na MARGRE
 * em 26/10/2026, os dois vêm neutros (`"0.00"`, bruto igual ao total) — então hoje nada aparece
 * na tela. Quando o ERP aplicar desconto (tabela promocional, política por cliente), ele precisa
 * aparecer: sem isso o atendente vê um preço abaixo do cadastro e não consegue explicá-lo.
 *
 * `null` (não informado) e `"0.00"` (informado, e é zero) são coisas diferentes — e nenhuma das
 * duas desenha linha de desconto.
 */
{
  const base = { codigo_produto_erp: "A1", quantidade: "2.000", preco_unitario: "18.42" };

  assert(
    descontoDoItemPrevia({
      ...base,
      valor_total: "36.84",
      valor_total_bruto: "36.84",
      valor_desconto_unit: "0.00",
    }) === null,
    'desconto: "0.00" é a WM dizendo que não há desconto — nada é desenhado'
  );
  assert(
    descontoDoItemPrevia({
      ...base,
      valor_total: "36.84",
      valor_total_bruto: null,
      valor_desconto_unit: null,
    }) === null,
    "desconto: null é ausência de informação — e também não desenha nada"
  );
  assert(
    descontoDoItemPrevia({ ...base, valor_total: "36.84" }) === null,
    "desconto: campo que não veio na resposta não inventa desconto"
  );
  assert(
    descontoDoItemPrevia({ ...base, valor_desconto_unit: "-1.50" }) === null,
    "desconto: valor negativo não é desconto — não se afirma o que não se entende"
  );
  assert(
    descontoDoItemPrevia({ ...base, valor_desconto_unit: "abc" }) === null,
    "desconto: valor fora de formato não vira desconto"
  );
  for (const nada of [null, undefined, "x", 3]) {
    assert(descontoDoItemPrevia(nada) === null, "desconto: entrada que não é item devolve null");
  }

  const com = descontoDoItemPrevia({
    ...base,
    valor_total: "33.84",
    valor_total_bruto: "36.84",
    valor_desconto_unit: "1.50",
  });
  assert(com !== null, "desconto: desconto de verdade aparece");
  assert(
    com.descontoUnit === formatMoedaOrcamento("1.50"),
    "desconto: o valor é o da WM, passado pelo formatador de moeda — nada é calculado"
  );
  assert(
    com.valorBruto === formatMoedaOrcamento("36.84"),
    "desconto: o valor cheio vem junto, para o desconto ser conferível"
  );
  // O bruto só entra quando DIFERE do líquido: dois números iguais, um riscado, pareceria erro.
  const igual = descontoDoItemPrevia({
    ...base,
    valor_total: "36.84",
    valor_total_bruto: "36.84",
    valor_desconto_unit: "1.50",
  });
  assert(
    igual !== null && igual.valorBruto === null,
    "desconto: bruto igual ao total não é mostrado riscado ao lado dele mesmo"
  );
  const semBruto = descontoDoItemPrevia({
    ...base,
    valor_total: "33.84",
    valor_desconto_unit: "1.50",
  });
  assert(
    semBruto !== null && semBruto.valorBruto === null,
    "desconto: sem o bruto, o desconto ainda é dito — ele é o dado que explica o preço"
  );

  /* ---- E a prévia inteira: a linha do desconto nasce no modelo, não no JSX ---- */
  const viewSemDesconto = montarPreviaView(PREVIA_WM);
  assert(
    viewSemDesconto.itens.every((i) => i.desconto === null),
    "desconto: a prévia medida hoje (sem desconto) não ganha linha nenhuma"
  );
  const viewComDesconto = montarPreviaView({
    ...PREVIA_WM,
    itens: [
      {
        codigo_produto_erp: "ABC1234",
        descricao: "Notebook",
        unidade: "UN",
        quantidade: "2.000",
        preco_unitario: "33.038",
        valor_total: "63.076",
        valor_total_bruto: "66.076",
        valor_desconto_unit: "1.50",
      },
    ],
  });
  assert(
    viewComDesconto.itens[0].desconto?.descontoUnit === formatMoedaOrcamento("1.50"),
    "desconto: e aparece no item da prévia quando o ERP o aplica"
  );
  assert(
    viewComDesconto.valorTotal === viewSemDesconto.valorTotal,
    "desconto: mostrar desconto não mexe no total — ele continua sendo o número da WM"
  );
}

/* ------------------------------------------------------------------ *
 * O CÓDIGO DE BARRAS — aparece só quando foi ele que achou o produto
 * ------------------------------------------------------------------ *
 * O campo convida a bipar/colar o código, e medido no ERP real em 26/10 isso resolve direto no
 * produto: `2500209000002` → `0000209`. O card mostrava "PISO (((PROMOÇÃO)))" — uma descrição
 * onde os dígitos bipados não aparecem em lugar nenhum, sem nada ligando as duas coisas.
 */
{
  assert(
    termoCasaNoTexto("2500209000002", "2500209000002") === true,
    "barras: o código bipado casa com o código do produto"
  );
  assert(
    termoCasaNoTexto("2500209000002", "250020") === true,
    "barras: trecho colado também casa — é a mesma régua do destaque"
  );
  assert(
    termoCasaNoTexto("2500209000002", "piso") === false,
    "barras: busca por nome NÃO acende o código de barras — seriam 13 dígitos de ruído por card"
  );
  assert(
    termoCasaNoTexto("", "250") === false && termoCasaNoTexto("2500", "") === false,
    "barras: sem texto ou sem termo não há casamento"
  );
}

/* ------------------------------------------------------------------ *
 * 18. Grupo do produto — etiqueta que só existe quando o dado existe
 * ------------------------------------------------------------------ *
 * Medido no ERP real: `grupo`/`subgrupo` NÃO vêm na lista de candidatos, só na resposta
 * resolvida. Uma etiqueta "sem grupo" em trinta cards seria ruído puro, então a ausência é o
 * nada — e o nada não pode reservar buraco no layout.
 */
assert(rotuloGrupoProduto({ grupo: "PECAS", subgrupo: "FILTROS" }) === "PECAS · FILTROS", "grupo: os dois juntos");
assert(rotuloGrupoProduto({ grupo: "PECAS" }) === "PECAS", "grupo: só o grupo");
assert(rotuloGrupoProduto({ subgrupo: "FILTROS" }) === "FILTROS", "grupo: só o subgrupo");
assert(rotuloGrupoProduto({ grupo: " PECAS ", subgrupo: " " }) === "PECAS", "grupo: aparado, e vazio não entra");
assert(
  rotuloGrupoProduto({ grupo: "FILTROS", subgrupo: "FILTROS" }) === "FILTROS",
  "grupo: subgrupo que repete o grupo não vira 'FILTROS · FILTROS'"
);
for (const nada of [null, undefined, {}, "PECAS", 7, { grupo: "" }, { grupo: 3 }]) {
  assert(rotuloGrupoProduto(nada) === "", `grupo: ${JSON.stringify(nada)} não produz etiqueta`);
}
assert(rotuloGrupoProduto({ grupo: "G".repeat(200) }).length === 60, "grupo: etiqueta gigante é cortada");

assert(classificacaoDoProduto({ grupo: "PECAS", subgrupo: "FILTROS" })?.grupo === "PECAS", "classificação: o grupo é copiado");
assert(classificacaoDoProduto({ grupo: "PECAS" })?.subgrupo === undefined, "classificação: campo ausente não vira vazio");
for (const nada of [null, undefined, {}, { grupo: "   " }, { grupo: 1 }]) {
  assert(classificacaoDoProduto(nada) === null, "classificação: sem nada, não há classificação");
}
// Classificação NÃO é valor: ela não pode entrar junto com preço e estoque no carrinho.
assert(
  extrairValoresDoProduto({ preco_unitario: "1.00", grupo: "PECAS" })?.grupo === undefined,
  "classificação: grupo não viaja como valor — carrinho e criação não têm nada com ele"
);
{
  const resolvido = {
    status: "produto",
    produto: {
      codigo_produto_erp: "4325",
      preco_unitario: "33.038",
      grupo: "PECAS",
      subgrupo: "FILTROS",
    },
    meta: { tempo_real: true },
  };
  const achado = valoresDaRespostaPorCodigo(resolvido, "4325");
  assert(achado?.classificacao?.subgrupo === "FILTROS", "classificação: vem junto da consulta por código");
  assert(achado?.valores?.preco_unitario === "33.038", "classificação: e não atrapalha o preço");
  assert(
    valoresDaRespostaPorCodigo(resolvido, "9999") === null,
    "classificação: resposta de outro código continua sendo recusada inteira"
  );
}

/* ------------------------------------------------------------------ *
 * 19. Produtos mais usados — o atalho que não custa chamada
 * ------------------------------------------------------------------ *
 * Numa loja que vende os mesmos itens todo dia, isto elimina a busca na maioria dos casos. O
 * que ele NÃO pode fazer: guardar dinheiro (preço velho pareceria atual), vazar entre empresas
 * ou usuários (o isolamento deste projeto é app-layer e vale no navegador também), crescer sem
 * limite, ou derrubar o picker quando o storage não responde.
 */
globalThis.localStorage = new StorageFake();
{
  const A = { companyId: 20, userId: 7 };
  const B = { companyId: 21, userId: 7 };
  const C = { companyId: 20, userId: 8 };
  assert(chaveProdutosFrequentes(A) !== chaveProdutosFrequentes(B), "frequentes: empresas diferentes não compartilham chave");
  assert(chaveProdutosFrequentes(A) !== chaveProdutosFrequentes(C), "frequentes: usuários diferentes não compartilham chave");
  assert(
    chaveProdutosFrequentes({ companyId: "20:7", userId: "" }) !== chaveProdutosFrequentes({ companyId: "20", userId: "7" }),
    "frequentes: escopo não pode ser forjado por separador na chave"
  );

  const cimento = {
    codigo_produto_erp: "4325",
    descricao: "CIMENTO CAMPEAO AZUL CP 2 E 32 50KG",
    marca: "",
    unidade: "UN",
    preco_unitario: "33.038",
    estoque_previsto: "120.000",
    grupo: "MATERIAL",
  };
  assert(registrarProdutoUsado({ ...A, produto: cimento }) === true, "frequentes: gravação funciona");
  const lidos = lerProdutosFrequentes(A);
  assert(lidos.length === 1 && lidos[0].codigo === "4325", "frequentes: volta no mesmo escopo");
  assert(lidos[0].descricao === cimento.descricao, "frequentes: a descrição volta para a tela poder mostrar o item");
  assert(lidos[0].unidade === "UN", "frequentes: a unidade volta — '1' em M2 não é '1 peça'");
  assert(lidos[0].usos === 1, "frequentes: o primeiro uso conta um");

  // DINHEIRO NÃO ENTRA. Esta é a asserção que protege a regra inteira.
  const cru = globalThis.localStorage.getItem(chaveProdutosFrequentes(A));
  assert(!/preco|33\.038/.test(cru), "frequentes: preço NUNCA é persistido — valor velho pareceria atual");
  assert(!/estoque|120\.000/.test(cru), "frequentes: estoque também não — ele muda no ERP sem avisar");
  assert(!/grupo|MATERIAL/.test(cru), "frequentes: nem classificação; só o que identifica o produto");
  assert(lidos[0].preco_unitario === undefined, "frequentes: nada de preço volta para a tela");

  assert(lerProdutosFrequentes(B).length === 0, "frequentes: outra EMPRESA não enxerga este atalho");
  assert(lerProdutosFrequentes(C).length === 0, "frequentes: outro USUÁRIO da mesma empresa também não");

  // Mesmo produto de novo vira uso, não linha nova.
  registrarProdutoUsado({ ...A, produto: cimento });
  const depois = lerProdutosFrequentes(A);
  assert(depois.length === 1, "frequentes: o mesmo código não duplica");
  assert(depois[0].usos === 2, "frequentes: o uso é contado");
}

/* ---- Ordem: uso recente E frequência, numa conta só ---- */
{
  globalThis.localStorage = new StorageFake();
  const A = { companyId: 20, userId: 7 };
  const agora = Date.UTC(2026, 9, 23);
  const dia = 24 * 60 * 60 * 1000;

  const velho = { usos: 2, ultimoUso: agora - 60 * dia };
  const novo = { usos: 1, ultimoUso: agora };
  assert(
    pontuacaoFrequencia(novo, agora) > pontuacaoFrequencia(velho, agora),
    "ordem: usado hoje uma vez ganha de duas vezes há duas meias-vidas"
  );
  const muito = { usos: 4, ultimoUso: agora - MEIA_VIDA_DIAS * dia };
  assert(
    pontuacaoFrequencia(muito, agora) > pontuacaoFrequencia(novo, agora),
    "ordem: o que ela usa MUITO não é apagado por um item usado uma vez hoje"
  );
  assert(pontuacaoFrequencia({ usos: 0, ultimoUso: agora }, agora) === 0, "ordem: sem uso, sem pontuação");
  assert(pontuacaoFrequencia(null, agora) === 0, "ordem: entrada inválida pontua zero, não quebra");
  assert(
    pontuacaoFrequencia({ usos: 3 }, agora) === 3,
    "ordem: sem data, a frequência vale sozinha (não some da lista)"
  );

  registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "VELHO" }, agora: agora - 60 * dia });
  registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "VELHO" }, agora: agora - 60 * dia });
  registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "HOJE" }, agora });
  const ordem = lerProdutosFrequentes({ ...A, agora }).map((e) => e.codigo);
  assert(ordem[0] === "HOJE", "ordem: a lista sai ordenada pela conta, não pela ordem de gravação");
  assert(ordem.includes("VELHO"), "ordem: o antigo continua na lista, só mais abaixo");
}

/* ---- Tetos, prazo e lixo: a chave não cresce para sempre ---- */
{
  globalThis.localStorage = new StorageFake();
  const A = { companyId: 20, userId: 7 };
  const agora = Date.UTC(2026, 9, 23);
  for (let i = 0; i < MAX_GUARDADOS + 15; i++) {
    registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: `P${i}` }, agora: agora + i });
  }
  const guardados = JSON.parse(globalThis.localStorage.getItem(chaveProdutosFrequentes(A))).itens;
  assert(guardados.length === MAX_GUARDADOS, `frequentes: o guardado para em ${MAX_GUARDADOS}`);
  assert(
    guardados.some((e) => e.codigo === `P${MAX_GUARDADOS + 14}`),
    "frequentes: ao truncar, o que sobra é o mais recente"
  );
  assert(
    lerProdutosFrequentes({ ...A, agora }).length === MAX_SUGERIDOS,
    `frequentes: a tela recebe no máximo ${MAX_SUGERIDOS}`
  );
  assert(
    lerProdutosFrequentes({ ...A, agora, limite: 3 }).length === 3,
    "frequentes: o teto da tela é respeitado quando pedido menor"
  );

  // Vencido some sozinho na leitura.
  const antigo = agora - FREQUENTES_TTL_MS - 1000;
  globalThis.localStorage.setItem(
    chaveProdutosFrequentes(A),
    JSON.stringify({ v: 1, itens: [{ codigo: "ANTIGO", usos: 9, ultimoUso: antigo }] })
  );
  assert(lerProdutosFrequentes({ ...A, agora }).length === 0, "frequentes: item parado além do prazo não é oferecido");

  // Lixo no storage não derruba nada.
  for (const lixo of ["{", "null", "[]", '{"itens":"nao-e-lista"}', '{"itens":[null,3,{"usos":5}]}']) {
    globalThis.localStorage.setItem(chaveProdutosFrequentes(A), lixo);
    assert(lerProdutosFrequentes({ ...A, agora }).length === 0, `frequentes: lixo (${lixo}) devolve lista vazia`);
  }
  assert(
    registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "" } }) === false,
    "frequentes: produto sem código não entra (ele não existe para a WM)"
  );
  assert(registrarProdutoUsado({ ...A, produto: null }) === false, "frequentes: produto nulo não entra");

  globalThis.localStorage.removeItem(chaveProdutosFrequentes(A));
  registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "X1" }, agora });
  registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "X2" }, agora });
  assert(esquecerProdutoFrequente({ ...A, codigo: "X1", agora }) === true, "frequentes: dá para esquecer um item");
  assert(
    lerProdutosFrequentes({ ...A, agora })
      .map((e) => e.codigo)
      .join() === "X2",
    "frequentes: esquecer tira só o pedido"
  );
}

/* ---- Logout: o atalho some, e só ele ---- */
{
  globalThis.localStorage = new StorageFake();
  registrarProdutoUsado({ companyId: 20, userId: 7, produto: { codigo_produto_erp: "A" } });
  registrarProdutoUsado({ companyId: 21, userId: 9, produto: { codigo_produto_erp: "B" } });
  globalThis.localStorage.setItem("zap_erp_last_email", "miguel@exemplo.com");
  const removidas = limparProdutosFrequentes();
  assert(removidas === 2, "logout: TODAS as chaves do módulo saem, não só a do escopo logado");
  assert(lerProdutosFrequentes({ companyId: 20, userId: 7 }).length === 0, "logout: nada sobra para o próximo login");
  assert(
    globalThis.localStorage.getItem("zap_erp_last_email") === "miguel@exemplo.com",
    "logout: a limpeza não leva junto chave de outro módulo"
  );
}

/* ---- Storage bloqueado (janela privada) não pode derrubar o orçamento ---- */
{
  globalThis.localStorage = new StorageFake({ lancar: true });
  const A = { companyId: 20, userId: 7 };
  assert(lerProdutosFrequentes(A).length === 0, "storage bloqueado: leitura devolve vazio em vez de lançar");
  assert(
    registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "A" } }) === false,
    "storage bloqueado: gravação falha em silêncio"
  );
  assert(esquecerProdutoFrequente({ ...A, codigo: "A" }) === false, "storage bloqueado: esquecer falha em silêncio");
  assert(limparProdutosFrequentes() === 0, "storage bloqueado: a limpeza do logout não lança");

  delete globalThis.localStorage;
  assert(lerProdutosFrequentes(A).length === 0, "sem localStorage nenhum: leitura devolve vazio");
  assert(
    registrarProdutoUsado({ ...A, produto: { codigo_produto_erp: "A" } }) === false,
    "sem localStorage nenhum: gravação devolve falso"
  );
  assert(limparProdutosFrequentes() === 0, "sem localStorage nenhum: limpeza devolve zero");
  globalThis.localStorage = new StorageFake();
}

/* ------------------------------------------------------------------ *
 * 20. "Ver preço", o atalho e o Enter: o que o PICKER não pode fazer
 * ------------------------------------------------------------------ *
 * Olha o fonte porque o que se proíbe é caminho de execução. Uma consulta de preço disparada
 * por efeito, por laço ou por timer viraria N chamadas em TEMPO REAL no SQL Server da loja a
 * cada busca — exatamente o custo que "uma por toque" existe para evitar.
 */
{
  const { readFileSync } = await import("node:fs");
  const picker = readFileSync(new URL("../src/conversa/orcamento/ProdutoPicker.jsx", import.meta.url), "utf8");
  const limpo = picker
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // O corpo do "ver preço", isolado: é nele que as proibições valem.
  const ini = limpo.indexOf("const verPreco");
  const corpo = ini >= 0 ? limpo.slice(ini, limpo.indexOf("[anotarDetalhe]", ini)) : "";
  assert(corpo.length > 0, "ver preço: a consulta por toque existe e é isolável");
  assert(
    /codigo_produto_erp: codigo/.test(corpo),
    "ver preço: consulta POR CÓDIGO — é o único ramo que a WM resolve com preço"
  );
  assert(
    !/setTimeout|setInterval|retry|tentarDeNovo/.test(corpo),
    "ver preço: nenhuma retentativa automática — seria chamada no servidor do cliente"
  );
  assert(
    !/setErro\(|setBuscando\(|setGrupos\(/.test(corpo),
    "ver preço: falhar não vira erro da busca nem mexe na lista — não impede adicionar o produto"
  );
  assert(
    /ESTADO_PRECO\.OK\) return/.test(corpo),
    "ver preço: código já respondido não gasta uma segunda chamada enquanto a busca é a mesma"
  );
  assert(/geracao/.test(corpo), "ver preço: resposta de uma busca anterior não pode pintar card da busca nova");

  // Nada de consulta automática: `verPreco` só é chamada de um `onClick`.
  const chamadasVerPreco = limpo.split("\n").filter((l) => /\bverPreco\(/.test(l) && !/const verPreco/.test(l));
  assert(chamadasVerPreco.length === 1, `ver preço: um único chamador — achei ${chamadasVerPreco.length}`);
  assert(
    /onClick=\{\(e\) => \{[\s\S]{0,240}verPreco\(p\)/.test(limpo),
    "ver preço: o chamador é o toque, e ele para o clique de virar 'adicionei ao carrinho'"
  );
  assert(
    !/useEffect\([\s\S]{0,400}verPreco\(/.test(limpo),
    "ver preço: nunca dentro de um efeito — abrir a busca não pode custar trinta consultas"
  );
  assert(
    !/\.map\([^)]*verPreco|forEach[\s\S]{0,80}verPreco/.test(limpo),
    "ver preço: nunca em laço sobre a lista"
  );


  // Enter: atalho de teclado, não gatilho de busca nem de consulta.
  const iniEnter = limpo.indexOf("const aoTeclarNaBusca");
  const corpoEnter = iniEnter >= 0 ? limpo.slice(iniEnter, limpo.indexOf("[adicionar,", iniEnter)) : "";
  assert(corpoEnter.length > 0, "enter: o atalho existe e é isolável");
  assert(
    /if \(buscando \|\| disabled\) return;/.test(corpoEnter),
    "enter: não dispara com a busca em voo nem com o formulário travado"
  );
  assert(
    /termoConsultadoRef\.current\.startsWith/.test(corpoEnter),
    "enter: só adiciona se os resultados na tela forem DO TERMO digitado — senão seria outro produto"
  );
  assert(
    !/consultarProdutosOrcamento|buscar\(/.test(corpoEnter),
    "enter: não dispara busca — a busca continua sendo do debounce de 800 ms"
  );
  assert(
    /onKeyDown=\{aoTeclarNaBusca\}/.test(limpo),
    "enter: o atalho vive no campo de busca, não num ouvinte global de teclado"
  );
}

/* ------------------------------------------------------------------ *
 * 21. Busca de CLIENTE — o campo que era adivinhação
 * ------------------------------------------------------------------ *
 * A busca de cliente do ERP é por PREFIXO (`dbo.Clientes`, `Latin1_General_CI_AI`). Medido no
 * ERP real da empresa 20: `DINIZ` → nenhum, `SILVA` → nenhum, `MARIA APARECIDA AMADEI` → 3.
 * O campo de texto puro escondia isso até o Calcular.
 *
 * As quatro coisas que esta seção protege, todas com consequência real:
 *   · a troca código → busca quando o texto muda (código órfão = orçamento para OUTRO cliente);
 *   · o 503 da loja fora do ar ≠ lista vazia (confundir é dizer que o cliente saiu do cadastro);
 *   · o documento junto do nome (sem ele, duas "MARIA SILVA" são sorteio);
 *   · o caminho antigo — digitar e calcular sem olhar a lista — intacto.
 */
{
  /* ---- o documento é o desempate, e vem um só ---- */
  assert(
    documentoDoCliente({ cnpj: "12.345.678/0001-99", cpf: "123.456.789-01" }) === "CNPJ 12.345.678/0001-99",
    "cliente: com CNPJ e CPF, o CNPJ manda (pessoa jurídica é quem mais repete nome na base)"
  );
  assert(documentoDoCliente({ cpf: "123.456.789-01" }) === "CPF 123.456.789-01", "cliente: CPF rotulado");
  assert(
    documentoDoCliente({ inscricao_estadual: "ISENTO" }) === "IE ISENTO",
    "cliente: IE entra como veio — valor fiscal como ISENTO é preservado pelo contrato"
  );
  assert(documentoDoCliente({ cpf: "   " }) === "", "cliente: documento só com espaço não é documento");
  assert(documentoDoCliente(null) === "", "cliente: ausência de candidato não vira texto");

  /* ---- os dois ramos do contrato, e a diferença de SENTIDO entre eles ---- */
  {
    const varios = agruparCandidatosCliente({
      status: "multiplos_clientes",
      candidatos: [
        { codigo_cliente_erp: "0000108", nome: "MARIA SILVA", cpf: "111.111.111-11" },
        { codigo_cliente_erp: "0000210", nome: "MARIA SILVA", cpf: "222.222.222-22" },
      ],
      paginacao: { pagina: 1, tamanho_pagina: 30, total: 2, tem_mais: false, tem_anterior: false },
      resolucao_definitiva: false,
    });
    assert(varios.lista.length === 2 && !varios.unico, "cliente: a lista de candidatos vem inteira");
    assert(varios.paginacao?.total === 2, "cliente: a paginação é a da WM, repassada sem conserto");
    assert(
      /documento/i.test(tituloClientesEncontrados(varios)),
      "cliente: com homônimos, a frase nomeia o trabalho — conferir o DOCUMENTO"
    );

    const unico = agruparCandidatosCliente({
      status: "cliente",
      cliente: { codigo_cliente_erp: "0000108", nome: "JOAO DA SILVA" },
      paginacao: null,
      resolucao_definitiva: false,
    });
    assert(unico.unico && unico.lista.length === 1, "cliente: ramo único é um ACHADO, não lista de um");
    assert(unico.paginacao === null, "cliente: o ramo único não tem paginação (o contrato não manda)");
    assert(
      !/documento/i.test(tituloClientesEncontrados(unico)),
      "cliente: com um só, não se pede para conferir documento (o ramo único não traz documentos)"
    );

    // Resposta fora dos dois ramos é VAZIO, nunca uma lista improvisada.
    for (const estranho of [null, undefined, {}, { status: "produto" }, { status: "multiplos_clientes" }]) {
      assert(
        agruparCandidatosCliente(estranho).lista.length === 0,
        `cliente: resposta estranha (${JSON.stringify(estranho)}) não vira lista`
      );
    }
    // Candidato sem código não é escolhível: não entra.
    assert(
      agruparCandidatosCliente({
        status: "multiplos_clientes",
        candidatos: [{ nome: "SEM CODIGO" }, { codigo_cliente_erp: "1", nome: "OK" }],
      }).lista.length === 1,
      "cliente: candidato sem código ERP não entra na lista"
    );
    assert(tituloClientesEncontrados({ lista: [] }) === "", "cliente: sem nada na mão, nada a dizer");
  }

  /* ---- 503 da loja NÃO é lista vazia ---- */
  {
    const offline = traduzirErroBuscaCliente({
      codigo: "WM_SINCRONIZADOR_OFFLINE",
      // A mensagem do envelope fala do CÁLCULO: ela foi escrita para o Calcular.
      mensagem: "O sistema da sua loja está fora do ar, então o orçamento não pôde ser calculado.",
    });
    assert(offline.tipo === "indisponivel", "cliente: 503 da loja é indisponibilidade, não resultado vazio");
    assert(
      !/calculad|gravad/i.test(offline.mensagem),
      "cliente: no campo de busca a frase não pode falar de um cálculo que ninguém pediu"
    );
    assert(
      /não está cadastrado|não quer dizer/i.test(offline.mensagem),
      "cliente: a frase precisa negar a conclusão errada — o cliente não sumiu do cadastro"
    );
    assert(
      /ligado|internet/i.test(RECUPERACAO_CLIENTE_INDISPONIVEL),
      "cliente: a recuperação diz o que fazer, e é na loja que se resolve"
    );
    assert(
      /Calcular/.test(RECUPERACAO_CLIENTE_INDISPONIVEL),
      "cliente: avisa que o Calcular depende do mesmo sistema — senão monta-se a cesta inteira para nada"
    );
    assert(
      /produto/i.test(RECUPERACAO_CLIENTE_INDISPONIVEL),
      "cliente: diz que a busca de produto continua funcionando (a tela fica meio viva)"
    );

    for (const codigo of ["WM_NAO_ENCONTRADO", "WM_CLIENTE_NAO_ENCONTRADO"]) {
      const r = traduzirErroBuscaCliente({ codigo, mensagem: "Nenhum resultado encontrado no ERP." });
      assert(r.tipo === "vazio", `cliente: ${codigo} é VAZIO, não erro — houve resposta, e ela foi "não tem"`);
      assert(r.mensagem === "", "cliente: o vazio não carrega mensagem de erro (quem fala é o estado vazio)");
    }

    const outro = traduzirErroBuscaCliente({ codigo: "WM_INDISPONIVEL", mensagem: "Não foi possível falar com o ERP agora." });
    assert(outro.tipo === "erro", "cliente: falha que não é 503 nem 404 continua sendo erro");
    assert(outro.mensagem === "Não foi possível falar com o ERP agora.", "cliente: erro exibe a mensagem do envelope");
    assert(
      traduzirErroBuscaCliente(null).tipo === "erro",
      "cliente: erro sem forma conhecida não vira vazio (vazio é afirmação sobre o cadastro)"
    );
  }

  /* ---- o estado vazio ensina o prefixo, e é a MESMA frase do Calcular ---- */
  {
    const vazio = mensagemBuscaClienteSemResultado("Diniz");
    assert(/Diniz/.test(vazio), "cliente: o estado vazio cita o que foi digitado");
    assert(/começo do nome/i.test(vazio), "cliente: o estado vazio explica a busca por prefixo");
    assert(/primeiro nome/i.test(vazio), "cliente: oferece a saída mais provável — o primeiro nome");
    assert(/CPF\/CNPJ/.test(vazio), "cliente: oferece a saída que casa por igualdade");
    assert(
      vazio === dicaClienteNaoEncontrado("WM_NAO_ENCONTRADO", "Diniz"),
      "cliente: busca e Calcular dizem a MESMA frase — duas explicações ensinariam duas coisas"
    );
    assert(mensagemBuscaClienteSemResultado("   ") === "", "cliente: sem termo, nada a explicar");
  }

  /* ---- escolher não é confirmar: `resolucao_definitiva: false` tem consequência de tela ---- */
  {
    assert(
      /Calcular/.test(AVISO_CLIENTE_NAO_DEFINITIVO) && /inativo|bloquead/i.test(AVISO_CLIENTE_NAO_DEFINITIVO),
      "cliente: o aviso diz onde a confirmação acontece e o que pode recusar"
    );
    // A frase pode (e deve) usar a palavra "confirmado" — desde que no FUTURO, apontando para o
    // Calcular. O que ela não pode é afirmar que a confirmação já aconteceu, nem carregar selo.
    assert(
      !/✓|✔|\bconfirmado\b(?![^.]*Calcular)/.test(AVISO_CLIENTE_NAO_DEFINITIVO),
      'cliente: a escolha na busca NUNCA é apresentada como "cliente confirmado" (nem com selo)'
    );

    const dica = dicaClienteEscolhidoRecusado("WM_CLIENTE_INVALIDO", "0000108");
    assert(
      /busca mostra o cadastro inteiro/i.test(dica),
      'cliente: o CLIENTE_INVALIDO de quem escolheu na lista explica o porquê — senão "escolha outro" parece defeito'
    );
    assert(/ativo e desbloqueado/i.test(dica), "cliente: a dica diz qual é a regra do orçamento");
    assert(
      dicaClienteEscolhidoRecusado("WM_CLIENTE_INVALIDO", "") === "",
      "cliente: sem código enviado ninguém escolheu de lista — a dica do prefixo é a que vale"
    );
    assert(
      dicaClienteEscolhidoRecusado("WM_NAO_ENCONTRADO", "0000108") === "",
      "cliente: outro erro não vira conselho sobre inativo/bloqueado"
    );
    // As duas dicas nunca se aplicam ao mesmo erro: o drawer escolhe uma com `||`.
    assert(
      !(dicaClienteNaoEncontrado("WM_CLIENTE_INVALIDO", "Maria") &&
        dicaClienteEscolhidoRecusado("WM_CLIENTE_INVALIDO", "0000108")) ||
        dicaClienteNaoEncontrado("WM_CLIENTE_INVALIDO", "Maria") === "",
      "cliente: um erro não produz as duas dicas ao mesmo tempo"
    );
  }

  /* ------------------------------------------------------------------ *
   * O BUG CLÁSSICO DESTE DESENHO: o código órfão
   * ------------------------------------------------------------------ *
   * `preparar` recebe `cliente_codigo_erp` XOR `cliente_busca`, e o código GANHA quando os dois
   * estão no rascunho. Se mexer no texto não apagasse o código, a pessoa escolheria "MARIA
   * APARECIDA", procuraria outro cliente, e o orçamento sairia para a Maria — com outro nome na
   * tela. Em silêncio, para um cliente real.
   *
   * A prova usa `assinaturaDoRascunho`/`assinaturaDoBody`, que codificam a MESMA precedência de
   * `montarBodyPreparar` (`refItem`: código quando existe, senão busca). Se o rascunho depois da
   * digitação ainda resolvesse por código, a assinatura o denunciaria.
   */
  {
    const base = {
      clienteBusca: "MARIA APARECIDA",
      clienteCodigoErp: "",
      clienteNome: "",
      vendedorBusca: "CARLOS",
      itens: [{ codigo_produto_erp: "7001", quantidade: "2" }],
    };
    const corpo = (cliente) => ({
      ...cliente,
      vendedor_busca: "CARLOS",
      itens: [{ codigo_produto_erp: "7001", quantidade: "2" }],
    });

    // 1. Escolheu na lista: o rascunho passa a resolver por CÓDIGO.
    const escolhido = { ...base, ...patchClienteEscolhido({ codigo_cliente_erp: "0000108", nome: "MARIA APARECIDA AMADEI" }) };
    assert(escolhido.clienteCodigoErp === "0000108", "cliente: escolher grava o código canônico");
    assert(
      escolhido.clienteNome === "MARIA APARECIDA AMADEI",
      "cliente: escolher grava o nome canônico do ERP, para a tela mostrar quem foi escolhido"
    );
    assert(
      escolhido.clienteBusca === "MARIA APARECIDA",
      "cliente: o texto digitado fica intacto — é por ele que o 'Trocar' volta à lista sem outra consulta"
    );
    assert(
      assinaturaDoRascunho(escolhido) === assinaturaDoBody(corpo({ cliente_codigo_erp: "0000108" })),
      "cliente: com a escolha feita, o que vai para o preparar é `cliente_codigo_erp`"
    );

    // 2. Mexeu no texto depois de escolher: a escolha anterior deixa de valer.
    const depois = { ...escolhido, ...patchClienteDigitado("MARIO") };
    assert(depois.clienteCodigoErp === "" && depois.clienteNome === "", "cliente: digitar apaga a escolha anterior");
    assert(
      assinaturaDoRascunho(depois) === assinaturaDoBody(corpo({ cliente_busca: "MARIO" })),
      "cliente: depois de digitar, o preparar recebe `cliente_busca` — nunca o código de antes"
    );
    assert(
      assinaturaDoRascunho(depois) !== assinaturaDoBody(corpo({ cliente_codigo_erp: "0000108" })),
      "cliente: NENHUM caminho deixa o código órfão sobreviver à digitação"
    );

    // 3. As duas funções são opostas por construção: nenhuma lê o estado anterior.
    assert(patchClienteEscolhido({ nome: "SEM CODIGO" }) === null, "cliente: candidato sem código não grava nada");
    assert(
      patchClienteEscolhido({ codigo_cliente_erp: "  0000108  ", nome: "  MARIA  " }).clienteCodigoErp === "0000108",
      "cliente: código é aparado — o ERP casa por igualdade"
    );
    assert(
      Object.keys(patchClienteDigitado("x")).sort().join(",") === "clienteBusca,clienteCodigoErp,clienteNome",
      "cliente: digitar escreve exatamente os três campos da identidade do cliente, sempre"
    );

    // 4. O CAMINHO ANTIGO CONTINUA INTEIRO: digitar e calcular sem olhar a lista.
    assert(
      assinaturaDoRascunho(base) === assinaturaDoBody(corpo({ cliente_busca: "MARIA APARECIDA" })),
      "cliente: quem nunca usou a busca continua mandando `cliente_busca` — o laço de ambiguidade é o mesmo"
    );
  }

  /* ---- o timeout da rota nova é o de busca, não o default de 55 s ---- */
  assert(
    resolveOrcamentoTimeoutMs("/api/orcamentos/clientes/consultar") === HTTP_TIMEOUT_ORCAMENTO_BUSCA_MS,
    "cliente: a consulta de cliente usa o perfil de busca (leitura), não o default"
  );

  /* ------------------------------------------------------------------ *
   * O que o CLIENTE PICKER não pode fazer — caminho de execução, olhado no fonte
   * ------------------------------------------------------------------ *
   * Cada busca aqui é uma consulta em TEMPO REAL no SQL Server da loja. Chamada que sai sem
   * gesto humano é dinheiro do cliente queimado (seção 11 do doc 36), e escolha automática põe
   * no orçamento um cliente que ninguém viu.
   */
  {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(new URL("../src/conversa/orcamento/ClientePicker.jsx", import.meta.url), "utf8");
    const codigo = fonte
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");

    const chamadas = codigo.split("\n").filter((l) => /consultarClientesOrcamento\(/.test(l));
    assert(chamadas.length === 1, `cliente picker: a WM é consultada de UM lugar só — achei ${chamadas.length}`);
    assert(/const DEBOUNCE_MS = 800;/.test(fonte), "cliente picker: debounce de 800 ms");
    assert(/const MIN_CARACTERES = 3;/.test(fonte), "cliente picker: piso de 3 caracteres");

    // O campo nasce pré-preenchido com o nome da conversa: abrir o drawer não pode custar uma
    // consulta na loja. A primeira busca espera o toque ou a digitação.
    assert(
      /if \(codigoErp \|\| !pedida\) return undefined;/.test(codigo),
      "cliente picker: sem gesto humano (`pedida`) nenhuma busca sai — o campo nasce preenchido"
    );
    assert(
      /onFocus=\{\(\) => setPedida\(true\)\}/.test(codigo),
      "cliente picker: tocar o campo é o gesto que libera a primeira busca"
    );

    // Nada é escolhido sozinho: `escolher` só é chamado pelo toque no card.
    const escolhas = codigo.split("\n").filter((l) => /onEscolher=\{escolher\}|escolher\(/.test(l));
    assert(escolhas.length > 0, "cliente picker: a escolha existe e passa por um lugar só");
    assert(
      !/useEffect\([\s\S]{0,400}escolher\(/.test(codigo),
      "cliente picker: nunca escolhe dentro de um efeito — nem quando volta um cliente só"
    );
    assert(
      !/lista\[0\]|lista\.length === 1[\s\S]{0,80}escolher/.test(codigo),
      "cliente picker: não auto-seleciona o único candidato (o contrato proíbe)"
    );

    // Com cliente escolhido a lista sai da tela: insistir nela gastaria consulta para pintar o
    // que ninguém vê.
    assert(
      /!codigoErp && \(buscando \|\| buscou/.test(codigo),
      "cliente picker: a região de resultados só existe enquanto não há cliente escolhido"
    );

    // A identidade do cliente é escrita só pelas duas funções opostas do view model.
    const escritas = codigo
      .split("\n")
      .filter((l) => /clienteCodigoErp:/.test(l) && /onPatch|clienteNome/.test(l));
    assert(
      escritas.length === 1,
      `cliente picker: um lugar só escreve código à mão (o "Trocar", que limpa) — achei ${escritas.length}`
    );
    assert(
      /patchClienteDigitado\(valor\)/.test(codigo) && /patchClienteEscolhido\(candidato\)/.test(codigo),
      "cliente picker: digitar e escolher passam pelas funções opostas do view model"
    );
    assert(
      !/clienteBusca:/.test(codigo),
      "cliente picker: o texto do cliente não é gravado à mão — senão um caminho esqueceria de apagar o código"
    );
  }
}

/* ------------------------------------------------------------------ *
 * 12. "R$ 0,01" não é preço, é preço NÃO CADASTRADO no ERP
 * ------------------------------------------------------------------ *
 * Medido no catálogo da Tijolar em 25/10/2026: 5 de 24 produtos amostrados vêm com
 * `preco_unitario: "0.010"` — conferido na prévia oficial, é o que a WM devolve para produto sem
 * preço no Icthus. A tela mostrava "R$ 0,01" e aquilo passava por preço de verdade.
 *
 * O limiar e a razão dele estão em `precoNaoCadastrado`. Aqui provam-se as BORDAS: o que entra,
 * o que não entra, e que a ausência de valor continua sendo outra coisa.
 * ------------------------------------------------------------------ */
assert(PRECO_NAO_CADASTRADO_ATE === 0.01, "limiar: um centavo — mexer aqui exige nova amostragem");

// O valor MEDIDO em produção. Se só este caso sobreviver, ele é o que não pode falhar.
assert(precoNaoCadastrado("0.010") === true, 'preço: "0.010" (medido na Tijolar) não é preço');
for (const dentro of ["0.01", "0.010", "0.0100", "0", "0.0", "0.000", 0, 0.01, "-1.00", "-0.5", -3]) {
  assert(
    precoNaoCadastrado(dentro) === true,
    `preço: ${JSON.stringify(dentro)} é nulo/irrisório — não pode ser apresentado como preço`
  );
}
// Logo acima do limiar já é preço, e marcar produto baratinho como "sem preço" mentiria para o
// outro lado: numa loja de material de construção existe item de poucos centavos.
for (const fora of ["0.011", "0.02", "0.10", "0.50", "1.00", "33.038", "3500", 0.02]) {
  assert(
    precoNaoCadastrado(fora) === false,
    `preço: ${JSON.stringify(fora)} é preço de verdade e não pode ser marcado`
  );
}
// AUSÊNCIA não é "não cadastrado": a tela já a mostra como "—" ou como "ver preço", e chamá-la
// de não cadastrada afirmaria algo sobre o ERP que ninguém consultou.
for (const ausente of [null, undefined, "", "   ", "abc", "R$ 0,01", NaN, {}, [], true, "1.2.3"]) {
  assert(
    precoNaoCadastrado(ausente) === false,
    `preço: ${JSON.stringify(ausente)} é ausência de valor, não "preço não cadastrado"`
  );
}
// A etiqueta não pode conter moeda: dizer "não é preço" e mostrar "R$ 0,01" ao lado reinstala
// exatamente a leitura que a marcação existe para desfazer.
for (const texto of [
  TEXTO_PRECO_NAO_CADASTRADO,
  ETIQUETA_PRECO_NAO_CADASTRADO,
  TITULO_PRECO_NAO_CADASTRADO,
]) {
  assert(!/R\$|0,01|centavo/i.test(texto), `etiqueta: "${texto}" não pode falar em valor`);
  assert(!/gr[áa]tis|de gra[çc]a/i.test(texto), `etiqueta: "${texto}" não pode sugerir "de graça"`);
}
// A curta cabe na coluna de 104px do card (altura reservada de 24px); a longa não, e é por isso
// que são duas. Se alguém trocar uma pela outra, isto quebra.
assert(
  ETIQUETA_PRECO_NAO_CADASTRADO.length < TEXTO_PRECO_NAO_CADASTRADO.length,
  "etiqueta: a do card de busca é a curta — a longa estoura a altura reservada da coluna"
);

/* ---- O valor ENVIADO não muda, nem quando o item está marcado (§8.1) ---- */
{
  // `preco_confirmado` vive no snapshot do servidor e a confirmação vai com corpo VAZIO, então o
  // que o frontend não pode fazer é mexer na string enquanto ela passa por ele.
  const produto = {
    codigo_produto_erp: "4325",
    descricao: "AREIA",
    preco_unitario: "0.010",
    unidade: "UN",
  };
  const valores = extrairValoresDoProduto(produto);
  assert(
    valores.preco_unitario === "0.010",
    "marcado: o cache guarda a string da WM byte a byte — nada de reformatar o que foi marcado"
  );
  assert(
    typeof valores.preco_unitario === "string",
    "marcado: o preço continua STRING; converter para number perderia a serialização da WM"
  );
  const daResposta = valoresDaRespostaPorCodigo({ status: "produto", produto }, "4325");
  assert(
    daResposta.valores.preco_unitario === "0.010",
    "marcado: a leitura da resposta por código também copia o valor sem tocar"
  );
  assert(
    produtoJaTemPreco(produto) === true,
    "marcado: produto com 0.010 JÁ TEM valor — não se gasta outra chamada por causa da marcação"
  );
  assert(
    precisaConsultarPreco({}, produto) === false,
    "marcado: marcar é apresentação; não vira motivo para consultar de novo"
  );
  // A marcação também não pode entrar na identidade do que foi orçado: ela é de tela.
  const rascunho = {
    clienteCodigoErp: "C1",
    vendedorCodigoErp: "V1",
    itens: [{ codigo_produto_erp: "4325", quantidade: "2" }],
  };
  assert(
    !/preco|0\.010/.test(assinaturaDoRascunho(rascunho)),
    "marcado: a assinatura do rascunho não carrega preço — ela identifica o conjunto, não o valor"
  );
}

/* ---- O conjunto: quantos itens, quais nomes, e a frase de cada momento ---- */
assert(
  itensSemPrecoCadastrado(PREVIA_SEM_PRECO).length === 1,
  "conjunto: só o item de 0.010 entra na lista — o de 33.038 tem preço"
);
assert(
  itensSemPrecoCadastrado(PREVIA_SEM_PRECO)[0] === "AREIA MEDIA LAVADA M3",
  "conjunto: o item é identificado pelo nome que o atendente lê na linha"
);
assert(
  itensSemPrecoCadastrado(PREVIA_WM).length === 0,
  "conjunto: preço AUSENTE (null) não é preço não cadastrado — são estados diferentes"
);
for (const nada of [null, undefined, {}, { itens: null }, { itens: [] }, { itens: [null, 7] }]) {
  assert(
    itensSemPrecoCadastrado(nada).length === 0,
    `conjunto: ${JSON.stringify(nada)} não produz lista — nem exceção`
  );
}
// Item sem descrição utilizável tem de ser identificável de todo jeito: "—" não diz qual linha.
{
  const nomes = itensSemPrecoCadastrado({
    itens: [{ codigo_produto_erp: "777", descricao: "   ", preco_unitario: "0.010" }],
  });
  assert(nomes[0] === "cód. 777", "conjunto: item sem descrição entra pelo código, nunca como —");
}
{
  const nomes = itensSemPrecoCadastrado({ itens: [{ preco_unitario: "0" }] });
  assert(
    nomes[0] === "item sem identificação",
    "conjunto: sem descrição e sem código, a frase ainda diz que existe um item assim"
  );
}

{
  const previa = avisoItensSemPreco(PREVIA_SEM_PRECO, { momento: "previa" });
  const envio = avisoItensSemPreco(PREVIA_SEM_PRECO, { momento: "envio" });
  assert(previa?.quantidade === 1 && envio?.quantidade === 1, "aviso: conta os itens marcados");
  assert(
    previa.texto !== envio.texto,
    "aviso: a frase de antes de CRIAR não serve para antes de ENVIAR — a consequência é outra"
  );
  assert(
    /AREIA MEDIA LAVADA M3/.test(previa.texto) && /AREIA MEDIA LAVADA M3/.test(envio.texto),
    "aviso: as duas frases dizem QUAL item conferir"
  );
  // A frase do envio fala do que acontece a seguir: o texto indo para o cliente.
  assert(
    /resumo|enviar/i.test(envio.texto),
    "aviso de envio: tem de falar do resumo que vai para o cliente"
  );
  assert(
    /calcule de novo|cadastrarem/i.test(previa.texto),
    "aviso de prévia: tem de oferecer o caminho de correção antes de criar"
  );
  // Nenhuma das duas repete o valor.
  for (const a of [previa, envio]) {
    assert(!/R\$|0,01|0,02/.test(a.texto), `aviso: a frase não pode conter o valor — "${a.texto}"`);
  }
  assert(
    avisoItensSemPreco(PREVIA_WM) === null,
    "aviso: sem item marcado não há aviso (prévia de preço ausente não é prévia de preço falso)"
  );
  assert(avisoItensSemPreco(null) === null, "aviso: sem prévia, nada a avisar");
}

// Concordância e corte da lista de nomes: a frase precisa ser legível com um item e com dez.
{
  const comN = (n) => ({
    itens: Array.from({ length: n }, (_, i) => ({
      codigo_produto_erp: String(i),
      descricao: `ITEM ${i}`,
      preco_unitario: "0.010",
    })),
  });
  assert(/^Um item deste orçamento está/.test(avisoItensSemPreco(comN(1)).texto), "aviso: singular");
  assert(/^2 itens deste orçamento estão/.test(avisoItensSemPreco(comN(2)).texto), "aviso: plural");
  assert(
    /ITEM 0, ITEM 1 e ITEM 2\b/.test(avisoItensSemPreco(comN(3)).texto),
    "aviso: até três nomes saem inteiros, com 'e' no último"
  );
  const dez = avisoItensSemPreco(comN(10));
  assert(dez.quantidade === 10, "aviso: a contagem é de todos, mesmo com a lista cortada");
  assert(
    /e mais 7/.test(dez.texto) && !/ITEM 9/.test(dez.texto),
    "aviso: lista longa é cortada em 'e mais N' — parede de texto não é lida"
  );
}

/* ---- A prévia marca item por item, e o valor exato continua à vista ---- */
{
  const view = montarPreviaView(PREVIA_SEM_PRECO);
  assert(view.itens[0].precoNaoCadastrado === false, "prévia: item com preço real não é marcado");
  assert(view.itens[1].precoNaoCadastrado === true, "prévia: item de 0.010 é marcado");
  assert(
    view.itens[1].precoExato === "0,010",
    "prévia: o valor exato continua nos detalhes — é o que o ERP vai gravar e o suporte procurar"
  );
  assert(view.avisoSemPreco?.quantidade === 1, "prévia: a view carrega o aviso do conjunto");
  assert(
    montarPreviaView(PREVIA_WM).avisoSemPreco === null,
    "prévia: sem item marcado a view não carrega aviso"
  );
  // A marcação é de exibição: o preço formatado continua sendo calculado do mesmo jeito.
  assert(
    view.itens[1].precoUnitario === formatMoedaOrcamento("0.010"),
    "prévia: a marcação não substitui nem altera o preço formatado no modelo"
  );
}

/* ------------------------------------------------------------------ *
 * 13. "A loja está no ar?" — o aviso antes do trabalho perdido
 * ------------------------------------------------------------------ *
 * `GET /api/orcamentos/erp/status` responde SEMPRE 200, inclusive quando a resposta é "não dá".
 * As portas da WM caem separadamente: com o sincronizador da loja fora do ar, a busca de produto
 * responde 200 em 166 ms enquanto cliente e `preparar` devolvem 503 (medido em 25/10/2026).
 * ------------------------------------------------------------------ */

/* ---- Leitura do envelope: o que vira veredito e o que vira SILÊNCIO ---- */
assert(
  lerStatusErp({ ok: true, erp_alcancavel: true, motivo: null })?.alcancavel === true,
  "status: ERP alcançável é lido como alcançável"
);
for (const motivo of ["sincronizador_offline", "lento", "indisponivel", "nao_configurado"]) {
  const lido = lerStatusErp({ ok: true, erp_alcancavel: false, motivo });
  assert(
    lido?.alcancavel === false && lido.motivo === motivo,
    `status: o motivo "${motivo}" chega intacto à tela`
  );
}
// Motivo novo no backend não pode virar aviso em branco; "não sabemos" é o fallback honesto.
for (const estranho of ["motivo_novo_do_backend", "", "   ", null, 7, undefined]) {
  assert(
    lerStatusErp({ ok: true, erp_alcancavel: false, motivo: estranho })?.motivo ===
      MOTIVO_ERP.INDISPONIVEL,
    `status: motivo ${JSON.stringify(estranho)} cai em "indisponivel", nunca em frase vazia`
  );
}
// Forma inesperada = cale-se. Inventar indisponibilidade a partir de uma resposta que não se
// entende é acusar a loja por um problema que pode ser nosso.
for (const ruim of [
  null,
  undefined,
  "ok",
  7,
  {},
  { ok: false, erp_alcancavel: false, motivo: "lento" },
  { ok: true },
  { ok: true, erp_alcancavel: "false", motivo: "lento" },
  { ok: true, erp_alcancavel: null },
]) {
  assert(
    lerStatusErp(ruim) === null,
    `status: resposta ${JSON.stringify(ruim)} tem de produzir silêncio, não aviso`
  );
}

/* ---- A sonda que FALHA fica calada ---- */
// O drawer trata exceção não mexendo no estado; no nível das funções, o que se prova é que
// nenhum caminho produz aviso sem um veredito, e que `null` nunca desenha nada.
assert(avisoErpIndisponivel(null) === null, "sonda falhou: sem veredito, nenhum aviso");
assert(avisoErpIndisponivel(undefined) === null, "sonda em voo: sem veredito, nenhum aviso");
assert(
  avisoErpIndisponivel(lerStatusErp(null)) === null,
  "sonda falhou: a cadeia inteira (resposta ruim → veredito → aviso) termina em silêncio"
);
assert(
  avisoErpIndisponivel({ alcancavel: true, motivo: null }) === null,
  "ERP de pé: nada a avisar — o aviso não pode existir quando dá para orçar"
);

/* ---- Cada motivo é uma situação diferente e pede frase diferente ---- */
{
  const avisos = {};
  for (const motivo of Object.values(MOTIVO_ERP)) {
    avisos[motivo] = avisoErpIndisponivel({ alcancavel: false, motivo });
    assert(avisos[motivo] !== null, `aviso ERP: ${motivo} tem de produzir aviso`);
  }

  // Quatro frases distintas, e distintas no CONTEÚDO: um texto genérico para todos seria o
  // mesmo que não distinguir as situações.
  const titulos = Object.values(avisos).map((a) => a.titulo);
  assert(new Set(titulos).size === titulos.length, "aviso ERP: cada motivo tem título próprio");
  const explicacoes = Object.values(avisos).map((a) => a.explicacao);
  assert(
    new Set(explicacoes).size === explicacoes.length,
    "aviso ERP: cada motivo explica a sua própria situação"
  );

  // `sincronizador_offline`: a ação é NA LOJA, e o que ainda funciona é a busca de produto.
  const off = avisos[MOTIVO_ERP.SINCRONIZADOR_OFFLINE];
  assert(
    /computador/i.test(off.recuperacao),
    "sincronizador offline: a ação é no computador do ERP da loja — é lá que se resolve"
  );
  assert(
    /busca de produto/i.test(off.explicacao),
    "sincronizador offline: dizer o que AINDA funciona é o conteúdo útil do aviso"
  );
  assert(
    !/suporte/i.test(off.recuperacao),
    "sincronizador offline: mandar procurar o suporte do ZapERP manda a pessoa errada resolver"
  );

  // `lento` é demora, não queda — e a palavra importa: com "fora do ar" ninguém tentaria.
  const lento = avisos[MOTIVO_ERP.LENTO];
  assert(/lento|demor/i.test(lento.titulo + lento.explicacao), "lento: a frase fala de DEMORA");
  assert(
    !/fora do ar|n[ãa]o est[áa] respondendo/i.test(lento.titulo + lento.explicacao),
    "lento: não é queda, e chamar de queda desaconselharia tentar o Calcular"
  );
  assert(
    /calcular/i.test(lento.recuperacao),
    "lento: ainda vale tentar calcular, e a frase diz isso"
  );

  // `indisponivel` é "não sabemos" — então não afirma causa nem manda consertar nada.
  const inde = avisos[MOTIVO_ERP.INDISPONIVEL];
  assert(
    /n[ãa]o sabemos/i.test(inde.explicacao),
    "indisponível: a frase assume que não se sabe o motivo"
  );
  assert(
    !/computador|ligad/i.test(inde.titulo + inde.explicacao + inde.recuperacao),
    "indisponível: sem causa provada, não se manda conferir máquina nenhuma"
  );

  // `nao_configurado`: problema de INSTALAÇÃO. Quem resolve é o suporte, e mandar conferir o
  // computador da loja seria mandar consertar uma máquina que não tem defeito.
  const semConfig = avisos[MOTIVO_ERP.NAO_CONFIGURADO];
  assert(
    /suporte/i.test(semConfig.recuperacao),
    "não configurado: quem resolve é o suporte do ZapERP"
  );
  assert(
    !/computador|m[áa]quina|internet|ligad/i.test(
      semConfig.titulo + semConfig.explicacao + semConfig.recuperacao
    ),
    "não configurado: NENHUMA menção ao computador/internet da loja — não há defeito lá"
  );
  assert(
    semConfig.oferecerVerificar === false,
    "não configurado: resondar não muda nada até alguém configurar — botão que só gira é teatro"
  );
  for (const motivo of [
    MOTIVO_ERP.SINCRONIZADOR_OFFLINE,
    MOTIVO_ERP.LENTO,
    MOTIVO_ERP.INDISPONIVEL,
  ]) {
    assert(
      avisos[motivo].oferecerVerificar === true,
      `${motivo}: a situação pode mudar sozinha, então "verificar de novo" faz sentido`
    );
  }
  // `nao_configurado` é o único que NÃO promete a busca de produto: ela usa o mesmo contato
  // autorizado e também não funciona.
  assert(
    !/busca de produto/i.test(semConfig.explicacao),
    "não configurado: não prometer busca de produto — ela depende do mesmo vínculo que falta"
  );

  // Nenhuma frase pode carregar jargão, código ou status HTTP (regra do drawer inteiro).
  for (const [motivo, a] of Object.entries(avisos)) {
    const tudo = `${a.titulo} ${a.explicacao} ${a.recuperacao}`;
    assert(
      !/503|504|WM_|sincronizador|erp_alcancavel|requestId|comando_id/i.test(tudo),
      `aviso ERP (${motivo}): nada de código, status ou nome técnico na tela — "${tudo}"`
    );
    assert(
      a.titulo.length > 0 && a.explicacao.length > 0 && a.recuperacao.length > 0,
      `aviso ERP (${motivo}): sem campo vazio`
    );
  }
  // Motivo fora do vocabulário ainda produz aviso utilizável (o do "não sabemos").
  assert(
    avisoErpIndisponivel({ alcancavel: false, motivo: "coisa_nova" })?.motivo ===
      MOTIVO_ERP.INDISPONIVEL,
    "aviso ERP: motivo desconhecido cai no 'não sabemos', nunca em aviso vazio"
  );
}

/* ---- Quando reconsultar: só por fato novo, nunca em laço ---- */
for (const codigo of ["WM_SINCRONIZADOR_OFFLINE", "WM_TIMEOUT", "WM_INDISPONIVEL"]) {
  assert(erroSugereErpFora(codigo) === true, `reconsulta: ${codigo} desmente o veredito da tela`);
}
for (const codigo of [
  "WM_CLIENTE_INVALIDO",
  "WM_PRODUTO_NAO_ENCONTRADO",
  "WM_RESULTADO_INCERTO",
  "ORCAMENTO_DADOS_INVALIDOS",
  "",
  null,
  undefined,
]) {
  assert(
    erroSugereErpFora(codigo) === false,
    `reconsulta: ${JSON.stringify(codigo)} não é queda do ERP — resondar seria chamada à toa`
  );
}

/* ---- O timeout da sonda: curto, porque aviso atrasado não avisa ---- */
assert(
  resolveOrcamentoTimeoutMs("/api/orcamentos/erp/status") === HTTP_TIMEOUT_ORCAMENTO_STATUS_MS,
  "sonda: tem perfil de timeout próprio"
);
assert(
  HTTP_TIMEOUT_ORCAMENTO_STATUS_MS < HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS,
  "sonda: nunca espera mais que o confirmar — estourar aqui é silêncio, estourar lá é dúvida caríssima"
);
assert(
  HTTP_TIMEOUT_ORCAMENTO_STATUS_MS >= 15_000,
  "sonda: tem de caber o timeout de leitura do backend, senão o navegador aborta antes da resposta"
);
// A sonda não pode roubar o perfil das outras rotas.
assert(
  resolveOrcamentoTimeoutMs("/api/orcamentos/preparar") === HTTP_TIMEOUT_ORCAMENTO_PREPARAR_MS,
  "sonda: o novo ramo não muda o perfil do preparar"
);
assert(
  resolveOrcamentoTimeoutMs("/api/orcamentos/abc/confirmar") === HTTP_TIMEOUT_ORCAMENTO_CONFIRMAR_MS,
  "sonda: o novo ramo não muda o perfil do confirmar"
);

/* ------------------------------------------------------------------ *
 * Preço negociado por item — a string sai no formato da WM, byte a byte
 * ------------------------------------------------------------------ */
{
  // Vírgula do teclado BR vira ponto; a string sai como vai para a WM.
  assert(normalizarPrecoNegociado("10,00").value === "10.00", 'preço: "10,00" vira "10.00"');
  assert(normalizarPrecoNegociado("18.42").value === "18.42", 'preço: "18.42" passa igual');
  assert(normalizarPrecoNegociado("  7,5 ").value === "7.5", "preço: apara bordas e converte vírgula");
  assert(normalizarPrecoNegociado("1200").value === "1200", "preço: inteiro é válido");
  // Zero, negativo e vazio são barrados LOCALMENTE (a WM recusaria com 400).
  for (const ruim of ["0", "0,00", "0.000", "", "   ", "-5", "-0,01", "abc", "1.2.3", "R$ 10"]) {
    assert(!normalizarPrecoNegociado(ruim).ok, `preço: ${JSON.stringify(ruim)} tem de ser recusado`);
  }
  assert(!normalizarPrecoNegociado(null).ok, "preço: null é recusado");
  assert(!normalizarPrecoNegociado("1".repeat(21)).ok, "preço: longo demais é recusado");
}

/* ------------------------------------------------------------------ *
 * Desconto no total — distribuição proporcional, resíduo na última linha
 * ------------------------------------------------------------------ */
{
  const precos = {
    P1: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "10.00" } },
    P2: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "30.00" } },
  };
  const itens = [
    { codigo_produto_erp: "P1", quantidade: "1" },
    { codigo_produto_erp: "P2", quantidade: "1" },
  ];

  assert(baseOficialDoItem(itens[0], precos) === 10, "base: lê o preço oficial do cache");
  assert(podeDistribuirDesconto(itens, precos) === true, "distribuir: disponível com todos os preços");

  // R$ 8 de desconto sobre total 40 → 2 (P1, 1/4) e 6 (P2, 3/4). Soma do desconto = exata.
  const r = distribuirDescontoFinal({ itens, precos, tipo: "reais", valor: "8" });
  assert(r.ok, "distribuir R$: aceito");
  assert(r.descontoCentavos === 800, "distribuir R$: desconto total em centavos");
  assert(r.precosNegociados[0] === "8.00", "distribuir R$: P1 = 10 − 2 = 8,00");
  assert(r.precosNegociados[1] === "24.00", "distribuir R$: P2 = 30 − 6 = 24,00");
  // Exatidão: (10−8)*1 + (30−24)*1 = 8, igual ao pedido.

  // % equivale ao mesmo quando é 20% de 40 = 8.
  const rp = distribuirDescontoFinal({ itens, precos, tipo: "percent", valor: "20" });
  assert(rp.ok && rp.descontoCentavos === 800, "distribuir %: 20% de 40 = 8");
  assert(rp.precosNegociados[0] === "8.00" && rp.precosNegociados[1] === "24.00", "distribuir %: mesma divisão");

  // Resíduo de arredondamento vai para a última linha e a soma bate exatamente.
  const precos3 = {
    A: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "10.00" } },
    B: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "10.00" } },
    C: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "10.00" } },
  };
  const itens3 = [
    { codigo_produto_erp: "A", quantidade: "1" },
    { codigo_produto_erp: "B", quantidade: "1" },
    { codigo_produto_erp: "C", quantidade: "1" },
  ];
  const r3 = distribuirDescontoFinal({ itens: itens3, precos: precos3, tipo: "reais", valor: "1" });
  assert(r3.ok, "distribuir resíduo: R$ 1 entre 3 iguais é aceito");
  const somaDesc = r3.precosNegociados.reduce((acc, pn) => acc + (1000 - Math.round(Number(pn) * 100)), 0);
  assert(somaDesc === 100, "distribuir resíduo: a soma dos descontos é exatamente R$ 1,00 (100c)");

  // Guardas: zero/negativo, desconto que zera o orçamento, desconto que zera uma linha.
  assert(!distribuirDescontoFinal({ itens, precos, tipo: "reais", valor: "0" }).ok, "distribuir: 0 é barrado");
  assert(!distribuirDescontoFinal({ itens, precos, tipo: "reais", valor: "-5" }).ok, "distribuir: negativo é barrado");
  assert(!distribuirDescontoFinal({ itens, precos, tipo: "reais", valor: "40" }).ok, "distribuir: zerar o total é barrado");
  assert(!distribuirDescontoFinal({ itens, precos, tipo: "percent", valor: "100" }).ok, "distribuir: 100% é barrado");
  // Desconto que zera UMA linha: 39,99 sobre 40 deixa P1 (que vale 10) negativo → barrado.
  assert(!distribuirDescontoFinal({ itens, precos, tipo: "reais", valor: "39,99" }).ok, "distribuir: zerar uma linha é barrado");

  // Item sem preço no cache trava a distribuição (não há base honesta).
  const itensSemPreco = [...itens, { codigo_produto_erp: "P3", quantidade: "1" }];
  assert(podeDistribuirDesconto(itensSemPreco, precos) === false, "distribuir: item sem preço desabilita");
  assert(!distribuirDescontoFinal({ itens: itensSemPreco, precos, tipo: "reais", valor: "5" }).ok, "distribuir: item sem preço é recusado");

  // Preço "não cadastrado" (irrisório) não serve de base.
  const precosIrrisorio = { P1: { estado: ESTADO_PRECO.OK, valores: { preco_unitario: "0.010" } } };
  assert(baseOficialDoItem({ codigo_produto_erp: "P1" }, precosIrrisorio) === null, "base: preço irrisório não é base");
}

/* ------------------------------------------------------------------ *
 * Assinatura: mexer no preço negociado DEPOIS do cálculo desatualiza a prévia
 * ------------------------------------------------------------------ */
{
  const base = {
    clienteCodigoErp: "C1",
    vendedorCodigoErp: "V1",
    itens: [{ codigo_produto_erp: "P1", quantidade: "2" }],
  };
  const comPreco = {
    ...base,
    itens: [{ codigo_produto_erp: "P1", quantidade: "2", preco_negociado: "10.00" }],
  };
  assert(
    assinaturaDoRascunho(base) !== assinaturaDoRascunho(comPreco),
    "assinatura: negociar um preço muda a assinatura do rascunho"
  );
  // O corpo enviado carrega o mesmo campo, então a assinatura do corpo bate com a do rascunho.
  const body = { cliente_codigo_erp: "C1", vendedor_codigo_erp: "V1", itens: [{ codigo_produto_erp: "P1", quantidade: "2", preco_negociado: "10.00" }] };
  assert(
    assinaturaDoBody(body) === assinaturaDoRascunho(comPreco),
    "assinatura: corpo e rascunho coincidem com o preço negociado"
  );
  assert(
    assinaturaDoBody({ cliente_codigo_erp: "C1", vendedor_codigo_erp: "V1", itens: [{ codigo_produto_erp: "P1", quantidade: "2" }] }) !==
      assinaturaDoBody(body),
    "assinatura: corpo sem × com preço negociado diferem"
  );
}

if (falhas.length) {
  for (const f of falhas) console.error(`FALHOU: ${f}`);
  console.error(`FALHA — ${falhas.length} asserções do orçamento WM`);
  process.exitCode = 1;
} else {
  console.log(`OK — orçamento WM (frontend) passou (${passed} asserções).`);
}
