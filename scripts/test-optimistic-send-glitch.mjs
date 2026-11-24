/**
 * Regressão: bolha otimista não nasce no meio da thread nem com o nome do contato.
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-optimistic-send-glitch.mjs
 */
import {
  resolveOptimisticCriadoEm,
  pickOptimisticUsuarioNome,
  reconcileOptimisticChatListPreview,
  shouldMoveSearchedConversationToMinhaFila,
  isConversaJaVinculadaAoUsuario,
  moverParaMinhaFilaSeEnvioVeioDaBusca,
  requestMinhaFilaAposEnvioDaBusca,
  shouldAutoAssumirOnOutgoingSend,
  buildOutgoingStatusOptimisticPatch,
} from "../src/conversa/conversaOptimisticMessage.js";
import { useConversaStore } from "../src/conversa/conversaStore.js";
import { useAuthStore } from "../src/auth/authStore.js";
import { sortMensagensChronological } from "../src/conversa/conversaOutboundMediaMerge.js";
import {
  estimatedServerNowMs,
  getServerClockSkewMs,
  observeServerTimestamp,
  resetServerClockSkew,
} from "../src/conversa/serverClockSkew.js";
import { pickListaUltimaMensagem } from "../src/chats/chatListRowAtendimento.js";
import { useChatStore } from "../src/chats/chatsStore.js";

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

// 3) HTTP reconcilia também o card, ligando tempId aos IDs usados pelos ACKs do socket.
const optimisticPreview = {
  tempId: "temp-card",
  client_temp_id: "temp-card",
  conversa_id: CONV,
  direcao: "out",
  texto: "Boa noite",
  status: "pending",
  status_mensagem: "pending",
  criado_em: bumped,
};
const reconciledPreview = reconcileOptimisticChatListPreview(
  { id: CONV, ultima_mensagem: optimisticPreview },
  "temp-card",
  {
    id: 900,
    conversa_id: CONV,
    whatsapp_id: "wa-900",
    status: "sent",
    status_mensagem: "sent",
  }
);
assert.equal(reconciledPreview?.id, 900, "card deve receber o id persistido");
assert.equal(reconciledPreview?.whatsapp_id, "wa-900", "card deve receber whatsapp_id para ACK realtime");
assert.equal(reconciledPreview?.client_temp_id, "temp-card", "reconciliação deve preservar client_temp_id");
assert(
  reconcileOptimisticChatListPreview(
    { id: CONV, ultima_mensagem: { ...optimisticPreview, tempId: "temp-mais-novo" } },
    "temp-card",
    { id: 901, conversa_id: CONV }
  ) == null,
  "resposta atrasada não pode sobrescrever mensagem mais nova no card"
);

// 4) Em empate de horário, o preview canônico atualizado pelo socket vence o array legado.
const delivered = { ...reconciledPreview, status: "delivered", status_mensagem: "delivered" };
const picked = pickListaUltimaMensagem({
  ultima_mensagem: delivered,
  ultima_mensagem_preview: delivered,
  mensagens: [{ ...reconciledPreview, status: "sent", status_mensagem: "sent" }],
});
assert.equal(picked?.status_mensagem, "delivered", "card não pode regredir ✓✓ para ✓ em empate de timestamp");

// 5) Busca global: só sai da pesquisa quando o envio coloca a conversa na Minha fila.
const user = { id: 7, perfil: "atendente" };
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "fechada", mensagens_bloqueadas: false },
    user,
    { searchActive: true }
  ),
  "conversa encerrada encontrada pela busca deve ir para Minha fila após reabrir/enviar"
);
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "aberta", atendente_id: null },
    user,
    { searchActive: true }
  ),
  "conversa aberta sem atendente deve ir para Minha fila após o primeiro envio"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "em_atendimento", atendente_id: 99 },
    { id: 7, perfil: "admin" },
    { searchActive: true }
  ),
  "admin enviando numa conversa de outro atendente não deve ser redirecionado"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "fechada", mensagens_bloqueadas: false },
    user,
    { searchActive: false }
  ),
  "envio fora da busca não deve trocar o filtro atual"
);

// 5b) Busca → envio (24/11/2026): conversa que JÁ é minha também sai da busca para a Minha fila.
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "em_atendimento", atendente_id: 7 },
    user,
    { searchActive: true }
  ),
  "conversa em atendimento comigo deve ir para Minha fila após o envio"
);
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "aguardando_cliente", atendente_id: "7" },
    user,
    { searchActive: true }
  ),
  "aguardando cliente comigo (id string) deve ir para Minha fila"
);
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "em_atendimento", atendente_id: 99, participante_ativo: true },
    user,
    { searchActive: true }
  ),
  "co-atendente ativo deve ir para Minha fila"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "aberta", atendente_id: 99 },
    user,
    { searchActive: true }
  ),
  "aberta de outro atendente não entra na Minha fila"
);
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, tipo: "grupo", is_group: true, fixada: true },
    user,
    { searchActive: true, isGroup: true }
  ),
  "grupo fixado por mim está na Minha fila"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, tipo: "grupo", is_group: true, fixada: false },
    user,
    { searchActive: true, isGroup: true }
  ),
  "grupo não fixado não entra na Minha fila"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "fechada", mensagens_bloqueadas: false },
    user,
    { searchActive: true, allowReopen: false }
  ),
  "envio que não reabre deixa a encerrada fora da Minha fila"
);
assert(
  !shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "aberta", atendente_id: null },
    { ...user, atendimento_modo_simples: true },
    { searchActive: true }
  ),
  "modo simples não tem Minha fila"
);
assert(
  !isConversaJaVinculadaAoUsuario({ status_atendimento: "aberta", atendente_id: null }, user),
  "aberta livre ainda não é minha (depende do envio)"
);
assert(
  !isConversaJaVinculadaAoUsuario(
    { status_atendimento: "em_atendimento", atendente_id: 7, aguardando_resposta_campanha: true },
    user
  ),
  "aguardando resposta de campanha fica fora da Minha fila"
);

// 5b-2) "Mensagem disparada" sem responsável é assumida pelo envio (backend) — o otimista
//       e a busca → Minha fila precisam enxergar isso.
assert(
  shouldAutoAssumirOnOutgoingSend({ status_atendimento: "mensagem_disparada", atendente_id: null }, user),
  "mensagem_disparada sem responsável é auto-assumida no envio"
);
assert(
  shouldMoveSearchedConversationToMinhaFila(
    { id: CONV, status_atendimento: "mensagem_disparada", atendente_id: null },
    user,
    { searchActive: true }
  ),
  "mensagem_disparada encontrada na busca vai para a Minha fila após o envio"
);
assert(
  !shouldAutoAssumirOnOutgoingSend({ status_atendimento: "pagamento_pendente", atendente_id: 7 }, user),
  "pagamento pendente não é rebaixado pelo envio"
);

// 5e) Etiqueta: o envio já nasce "Aguardando cliente" (sem passar por "Em atendimento").
{
  const NOW = Date.parse("2026-11-24T15:00:00.000Z");
  const livre = buildOutgoingStatusOptimisticPatch(
    { id: CONV, status_atendimento: "aberta", atendente_id: null },
    user,
    { nowMs: NOW }
  );
  assert(livre?.status_atendimento === "em_atendimento", "livre vira em_atendimento");
  assert(String(livre?.atendente_id) === "7", "livre é assumida por mim");
  assert(livre?.aguardando_cliente_desde === new Date(NOW).toISOString(), "livre já nasce aguardando cliente");

  const minha = buildOutgoingStatusOptimisticPatch(
    { id: CONV, status_atendimento: "em_atendimento", atendente_id: 7, aguardando_cliente_desde: null },
    user,
    { nowMs: NOW }
  );
  assert(minha?.aguardando_cliente_desde, "envio em conversa minha marca aguardando cliente na hora");
  assert(!("atendente_id" in minha), "não reatribui conversa já minha");

  const simples = buildOutgoingStatusOptimisticPatch(
    { id: CONV, status_atendimento: "aberta", atendente_id: null },
    { ...user, atendimento_modo_simples: true },
    { nowMs: NOW }
  );
  assert(simples && !("aguardando_cliente_desde" in simples), "modo simples não usa aguardando_cliente_desde");

  for (const st of ["aguardando_cliente", "pagamento_pendente", "em_atraso", "fechada"]) {
    assert(
      buildOutgoingStatusOptimisticPatch({ id: CONV, status_atendimento: st, atendente_id: 7 }, user) === null,
      `${st} não muda de status no envio`
    );
  }
  assert(
    buildOutgoingStatusOptimisticPatch({ id: CONV, tipo: "grupo", is_group: true, status_atendimento: "aberta" }, user) === null,
    "grupo não tem status de atendimento"
  );

  const campanha = buildOutgoingStatusOptimisticPatch(
    { id: CONV, status_atendimento: "aberta", atendente_id: null, aguardando_resposta_campanha: true },
    user
  );
  assert(campanha?.aguardando_resposta_campanha === false, "assumir encerra a espera de campanha");
}

// 5c) O pedido só vale para a conversa que continua aberta e leva o reset de escopo.
useConversaStore.setState({ selectedId: 555, conversa: null });
useChatStore.setState({ chatListTabRequestNonce: 0, chatListTabRequestResetScope: false });
assert(!requestMinhaFilaAposEnvioDaBusca(CONV), "resposta atrasada de outra conversa não troca a lista");
assert(useChatStore.getState().chatListTabRequestNonce === 0, "nenhum pedido emitido para conversa fechada");
useConversaStore.setState({ selectedId: CONV });
assert(requestMinhaFilaAposEnvioDaBusca(CONV), "conversa aberta emite o pedido");
assert(useChatStore.getState().chatListTabRequestResetScope === true, "pedido leva resetScope");
assert(useChatStore.getState().chatListTabRequestClearSearch === true, "pedido limpa a busca");

// 5d) Envios sem bolha otimista (contato/localização/enquete/catálogo/Pix) avaliam o estado atual.
useAuthStore.setState({ user });
useChatStore.setState({
  chats: [{ id: CONV, status_atendimento: "em_atendimento", atendente_id: 7 }],
  chatListSearchActive: true,
  chatListSearchDebounced: true,
  chatListTabRequestNonce: 0,
});
assert(moverParaMinhaFilaSeEnvioVeioDaBusca(CONV), "contato enviado a conversa minha vinda da busca troca a lista");
useChatStore.setState({
  chats: [{ id: CONV, status_atendimento: "em_atendimento", atendente_id: 99 }],
  chatListSearchActive: true,
  chatListSearchDebounced: true,
  chatListTabRequestNonce: 0,
});
assert(!moverParaMinhaFilaSeEnvioVeioDaBusca(CONV), "conversa de outro atendente fica na busca");
useChatStore.setState({ chatListSearchActive: false, chatListSearchDebounced: false });
assert(!moverParaMinhaFilaSeEnvioVeioDaBusca(CONV), "sem busca ativa nada muda");
useConversaStore.setState({ selectedId: null });
useChatStore.setState({ chats: [] });

// 6) O pedido publica a visão de destino no mesmo tick; o hook React apenas espelha na UI.
useChatStore.setState({
  chatListActiveTab: "todas",
  chatListSearchActive: true,
  chatListSearchDebounced: true,
});
useChatStore.getState().requestChatListTab("minha_fila", { clearSearch: true });
assert(useChatStore.getState().chatListActiveTab === "minha_fila", "aba publicada imediatamente");
assert(useChatStore.getState().chatListSearchActive === false, "busca imediata deve ser desativada");
assert(useChatStore.getState().chatListSearchDebounced === false, "busca debounced deve ser desativada");

// 7) Rajada fora de ordem por relógios dessincronizados (auditoria 10/10/2026).
//    Medido em produção: o backend grava `criado_em` com o relógio DELE, ~3s adiantado.
//    As 4 primeiras reconciliam e pulam para o horário do servidor; a 5ª, ainda otimista
//    com horário do navegador, ficava ANTES de todas (7C-5 aparecia em 1º por ~10s).
const T = Date.parse("2026-10-10T05:17:00.000Z");
const ADIANTAMENTO = 3000;

const persistida = (n) => ({
  id: 1000 + n,
  direcao: "out",
  conteudo: `7C-${n}`,
  criado_em: new Date(T + ADIANTAMENTO + n).toISOString(),
  _stableInsertSeq: n,
});
const otimista = (n, criadoEmMs) => ({
  tempId: `tmp-${n}`,
  direcao: "out",
  conteudo: `7C-${n}`,
  criado_em: new Date(criadoEmMs).toISOString(),
  _stableInsertSeq: n,
});
const rotulos = (lista) => sortMensagensChronological(lista).map((m) => m.conteudo).join(",");

// 7a) Sem compensação (comportamento antigo): a 5ª nasce com o relógio do navegador e sobe.
resetServerClockSkew();
const semCorrecao = [persistida(1), persistida(2), persistida(3), persistida(4), otimista(5, T + 5)];
assert.equal(
  rotulos(semCorrecao),
  "7C-5,7C-1,7C-2,7C-3,7C-4",
  "cenário da auditoria deve mesmo embaralhar sem compensação — senão este teste não prova nada"
);

// 7b) Com a dessincronia observada, a bolha nasce no relógio do servidor e fica no fim.
resetServerClockSkew();
observeServerTimestamp(new Date(T + ADIANTAMENTO).toISOString(), T);
assert.equal(getServerClockSkewMs(), ADIANTAMENTO, "offset deve refletir o adiantamento observado");

const nascidaCorrigida = resolveOptimisticCriadoEm(
  estimatedServerNowMs(T + 5),
  [persistida(1), persistida(2), persistida(3), persistida(4)]
);
const comCorrecao = [persistida(1), persistida(2), persistida(3), persistida(4), {
  ...otimista(5, 0),
  criado_em: nascidaCorrigida,
}];
assert.equal(rotulos(comCorrecao), "7C-1,7C-2,7C-3,7C-4,7C-5", "rajada deve sair em ordem");

// 7c) Sem amostra alguma o comportamento é idêntico ao anterior (degradação segura).
resetServerClockSkew();
assert.equal(getServerClockSkewMs(), 0, "sem amostras o offset deve ser zero");
assert.equal(estimatedServerNowMs(T), T, "sem amostras a âncora não pode ser deslocada");

// 7d) Amostra absurda (mensagem antiga / data inválida) não pode virar offset.
resetServerClockSkew();
observeServerTimestamp(new Date(T - 6 * 60 * 60 * 1000).toISOString(), T);
observeServerTimestamp("nao-e-data", T);
assert.equal(getServerClockSkewMs(), 0, "amostra fora do limite deve ser descartada");

// 7e) Mediana descarta o outlier de uma requisição lenta isolada.
resetServerClockSkew();
[3000, 3100, 60000, 2900, 3050].forEach((d) =>
  observeServerTimestamp(new Date(T + d).toISOString(), T)
);
const offset = getServerClockSkewMs();
assert(offset >= 2900 && offset <= 3100, `mediana deve ignorar o outlier, obteve ${offset}`);
resetServerClockSkew();

console.log("OK - bolha otimista, sincronização do card e relógio do servidor passaram.");
