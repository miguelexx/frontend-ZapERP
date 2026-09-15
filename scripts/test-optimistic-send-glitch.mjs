/**
 * Regressão: bolha otimista não nasce no meio da thread nem com o nome do contato.
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-optimistic-send-glitch.mjs
 */
import {
  resolveOptimisticCriadoEm,
  pickOptimisticUsuarioNome,
} from "../src/conversa/conversaOptimisticMessage.js";
import { sortMensagensChronological } from "../src/conversa/conversaOutboundMediaMerge.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const CONV = 77;

// 1) Nome do JWT igual ao título do chat → usa o nome já exibido nas bolhas outbound.
assert.equal = (a, b, msg) => {
  if (a !== b) throw new Error(msg || `esperado ${JSON.stringify(b)}, obteve ${JSON.stringify(a)}`);
};

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Miguel",
    contactNome: "Mensagem Teste ZapERP",
  }),
  "Miguel",
  "auth distinto do contato deve vencer"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Miguel",
    contactNome: "João da Silva",
    lastOutgoingNomes: ["Miguel Silva"],
  }),
  "Miguel",
  "JWT atual continua vencendo um nome antigo já persistido na thread"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Mensagem Teste ZapERP",
    contactNome: "Mensagem Teste ZapERP",
    lastOutgoingNomes: ["Miguel", "Mensagem Teste ZapERP"],
  }),
  "Miguel",
  "não pintar o nome do contato como atendente na bolha otimista"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "",
    contactNome: "Mensagem Teste ZapERP",
    lastOutgoingNomes: ["Miguel"],
  }),
  "Miguel",
  "sem nome no JWT, herda o último outbound da thread"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Mensagem Teste ZapERP",
    contactNome: "João da Silva",
    lastOutgoingNomes: ["Miguel"],
    excludedNomes: ["Mensagem Teste ZapERP"],
  }),
  "Miguel",
  "JWT/instância antiga não pode vencer o nome já confirmado na thread"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Mensagem Teste ZapERP",
    contactNome: "João da Silva",
    lastOutgoingNomes: ["Mensagem Teste ZapERP", "Miguel"],
    excludedNomes: ["Mensagem Teste ZapERP"],
  }),
  "Miguel",
  "pushname fromMe do aparelho entra em excluded e não pinta a bolha"
);

assert.equal(
  pickOptimisticUsuarioNome({
    authNome: "Mensagem Teste ZapERP",
    contactNome: "João da Silva",
    lastOutgoingNomes: [],
    excludedNomes: ["Mensagem Teste ZapERP"],
  }),
  "",
  "sem nome confirmado na thread, não pintar o nome antigo da instância"
);

// 2) Relógio local atrasado: âncora depois da última mensagem da thread.
const existing = [
  { texto: "Ok", criado_em: "2026-09-14T20:04:00.100Z" },
  { texto: "Calma", criado_em: "2026-09-14T20:04:00.200Z" },
  { texto: "Oi", criado_em: "2026-09-14T20:04:00.800Z" },
];
const clientNow = Date.parse("2026-09-14T20:04:00.250Z");
const bumped = resolveOptimisticCriadoEm(clientNow, existing);
assert(
  Date.parse(bumped) > Date.parse("2026-09-14T20:04:00.800Z"),
  `âncora otimista deve passar de Oi: ${bumped}`
);

const ordered = sortMensagensChronological([
  { id: 1, conversa_id: CONV, direcao: "out", tipo: "texto", texto: "Ok", criado_em: existing[0].criado_em },
  { id: 2, conversa_id: CONV, direcao: "out", tipo: "texto", texto: "Calma", criado_em: existing[1].criado_em },
  { id: 3, conversa_id: CONV, direcao: "out", tipo: "texto", texto: "Oi", criado_em: existing[2].criado_em },
  {
    tempId: "temp-i",
    client_temp_id: "temp-i",
    conversa_id: CONV,
    direcao: "out",
    tipo: "texto",
    texto: "I",
    status: "pending",
    status_mensagem: "pending",
    criado_em: bumped,
    _stableInsertSeq: 10000070,
  },
]);
assert(
  ordered.map((m) => m.texto).join("|") === "Ok|Calma|Oi|I",
  `com âncora bumpada a ordem deve ser Ok|Calma|Oi|I, obteve ${ordered.map((m) => m.texto).join("|")}`
);

console.log("OK - bolha otimista (ordem + nome do atendente) passou.");
