/**
 * Guardas do frontend do orçamento WM (doc 36, Sessão 5).
 *
 * Cobre o que quebraria em silêncio e com consequência real:
 *   1. o formatador de moeda PRÓPRIO — "—" para valor inválido, nunca "R$ 0,00" (lacuna 3);
 *   2. a quantidade que sai para o backend — `trim()` obrigatório e zero recusado;
 *   3. o timeout por URL — `confirmar` acima do teto do backend (lacuna 2);
 *   4. o rascunho em `sessionStorage` — escopo por empresa+usuário, prazo, varredura e a
 *      lista branca que impede preço/id de operação de voltar do storage.
 *
 * Executar: node scripts/test-orcamento-frontend.mjs
 */

import {
  formatMoedaOrcamento,
  formatQuantidadeOrcamento,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  SEM_VALOR,
} from "../src/conversa/orcamento/orcamentoFormat.js";

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

if (falhas.length) {
  for (const f of falhas) console.error(`FALHOU: ${f}`);
  console.error(`FALHA — ${falhas.length} asserções do orçamento WM`);
  process.exitCode = 1;
} else {
  console.log(`OK — orçamento WM (frontend) passou (${passed} asserções).`);
}
