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
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  sugestaoDeBuscaCliente,
  SEM_VALOR,
} from "../src/conversa/orcamento/orcamentoFormat.js";

import {
  rotuloFonte,
  textoBloqueio,
  textoBloqueado,
  precoExatoTexto,
  montarPreviaView,
  montarResultadoView,
  montarResumoOrcamento,
  assinaturaDoRascunho,
  assinaturaDoBody,
} from "../src/conversa/orcamento/orcamentoViewModel.js";

import {
  resolveOrcamentoTimeoutMs,
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
  assert(item1.quantidade === "2,000", 'prévia: quantidade preserva as casas da WM ("2.000")');
  assert(item1.precoUnitario === formatMoedaOrcamento("33.038"), "prévia: preço unitário é o da WM");
  assert(item1.precoExato === "33,038", "prévia: a 3ª casa do preço aparece exata nos detalhes");
  assert(item1.valorTotal === formatMoedaOrcamento("66.076"), "prévia: valor do item é o da WM");
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
          "export const Componentes = { Preview, Resultado };",
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
      define: { "process.env.NODE_ENV": '"production"' },
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
    assert(htmlPrevia.includes("2,000"), "render prévia: imprime a quantidade com as casas da WM");
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

if (falhas.length) {
  for (const f of falhas) console.error(`FALHOU: ${f}`);
  console.error(`FALHA — ${falhas.length} asserções do orçamento WM`);
  process.exitCode = 1;
} else {
  console.log(`OK — orçamento WM (frontend) passou (${passed} asserções).`);
}
