import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const {
    buildChatListFetchParams,
    chatRowIsStaleForTab,
    shouldHideOptimisticClosedFromTab,
    shouldInsertChatRowInActiveList,
    mergeEmAtendimentoBackgroundRows,
    mergeActiveTabBackgroundRows,
  } = await vite.ssrLoadModule("/src/chats/chatListQueryHelpers.js");
  const { computeChatsFiltrados } = await vite.ssrLoadModule("/src/chats/chatListFilters.js");
  const { mergeChatRowListaAtividade } = await vite.ssrLoadModule(
    "/src/chats/chatListRowAtendimento.js"
  );

  const base = {
    tab: "minha_fila",
    statusFilter: "todos",
    tagFilter: "todas",
    departamentoFilter: "todos",
    atendenteFilter: "todos",
    dataInicio: "",
    dataFim: "",
    debouncedSearch: "",
    adminAtendenteFilterId: null,
    onlyFinalizadasAusencia: false,
    aguardandoClienteOnly: false,
    pagamentosPendentesOnly: false,
    emAtrasoOnly: false,
    tempoParadoFilter: "",
    conversaIdsPendenciaQuery: null,
    separarMensagensDisparadasLigado: false,
    isFinanceiroUser: false,
    isMobileLayout: false,
    user: { id: 1 },
    pendentesFuncionarioIds: [],
    isSupervisorOrAdminFn: () => false,
  };

  const fila = buildChatListFetchParams(base);
  assert.equal(fila.params.minha_fila, "1");
  assert.equal(fila.params.palavra, undefined);
  assert.equal(fila.searchBypassesTabFilters, false);
  assert.equal(fila.params.limit, 80);

  const busca = buildChatListFetchParams({ ...base, debouncedSearch: "5511999" });
  assert.equal(busca.searchBypassesTabFilters, true);
  assert.equal(busca.params.palavra, "5511999");
  assert.equal(busca.params.incluir_todos_clientes, "1");
  assert.equal(busca.params.minha_fila, undefined);
  assert.equal(busca.params.status_atendimento, undefined);

  const mobile = buildChatListFetchParams({ ...base, isMobileLayout: true });
  assert.equal(mobile.params.limit, 40);

  const closed = {
    id: 10,
    status_atendimento: "fechada",
    status_atendimento_real: "fechada",
    atendente_id: 1,
    ultima_atividade: "2026-09-01T12:00:00.000Z",
  };
  const openMine = {
    id: 11,
    status_atendimento: "em_atendimento",
    status_atendimento_real: "em_atendimento",
    atendente_id: 1,
    ultima_atividade: "2026-09-01T12:01:00.000Z",
  };

  assert.equal(chatRowIsStaleForTab(closed, "minha_fila"), true);
  assert.equal(chatRowIsStaleForTab(closed, "em_atendimento"), true);
  assert.equal(chatRowIsStaleForTab(closed, "abertas"), true);
  assert.equal(chatRowIsStaleForTab(closed, "finalizadas"), false);
  assert.equal(chatRowIsStaleForTab(closed, "todas"), false);
  assert.equal(chatRowIsStaleForTab(openMine, "minha_fila"), false);
  assert.equal(chatRowIsStaleForTab(openMine, "finalizadas"), true);

  assert.equal(
    shouldHideOptimisticClosedFromTab("em_atendimento", { patch: closed }),
    true
  );
  assert.equal(
    shouldHideOptimisticClosedFromTab("em_atendimento", {
      type: "encerrar_conversa",
      patch: closed,
    }),
    true
  );
  assert.equal(
    shouldHideOptimisticClosedFromTab("todas", { patch: closed }),
    false
  );
  assert.equal(
    shouldHideOptimisticClosedFromTab("em_atendimento", {
      type: "encerrar_conversa_revert",
      patch: closed,
    }),
    false
  );

  const user = { id: 1 };
  const otherAttendant = {
    id: 13,
    status_atendimento: "em_atendimento",
    status_atendimento_real: "em_atendimento",
    atendente_id: 2,
    ultima_atividade: "2026-09-01T12:03:00.000Z",
  };
  const aguardandoCliente = {
    id: 14,
    status_atendimento: "aguardando_cliente",
    status_atendimento_real: "aguardando_cliente",
    atendente_id: 1,
    ultima_atividade: "2026-09-01T12:04:00.000Z",
  };

  assert.equal(chatRowIsStaleForTab(aguardandoCliente, "em_atendimento"), true);
  assert.equal(
    shouldInsertChatRowInActiveList(aguardandoCliente, { tab: "em_atendimento", user }),
    false,
    "aguardando_cliente nao entra no GET de Em atendimento"
  );
  assert.equal(
    shouldInsertChatRowInActiveList(otherAttendant, { tab: "em_atendimento", user }),
    false,
    "conversa de outro atendente nao entra em Em atendimento"
  );
  assert.equal(
    shouldInsertChatRowInActiveList(closed, { tab: "em_atendimento", user }),
    false
  );
  assert.equal(
    shouldInsertChatRowInActiveList(openMine, { tab: "minha_fila", user }),
    true
  );
  assert.equal(
    shouldInsertChatRowInActiveList(closed, { tab: "minha_fila", user }),
    false
  );
  const inboundMine = {
    ...openMine,
    id: 15,
    ultima_mensagem: { direcao: "in", criado_em: "2026-09-01T12:05:00.000Z" },
  };
  assert.equal(
    shouldInsertChatRowInActiveList(inboundMine, {
      tab: "aguardando_funcionario",
      user,
    }),
    false,
    "sem set de pendentes, nao inserir por lastDir"
  );
  assert.equal(
    shouldInsertChatRowInActiveList(openMine, {
      tab: "aguardando_funcionario",
      user,
      pendentesFuncionarioSet: new Set(["11"]),
    }),
    true
  );

  const keepAguardandoFora = mergeActiveTabBackgroundRows(
    [openMine, aguardandoCliente],
    [openMine],
    "recentes",
    { tab: "em_atendimento", user }
  );
  assert.deepEqual(
    keepAguardandoFora.map((c) => c.id),
    [11],
    "resync de Em atendimento nao deve preservar aguardando_cliente"
  );
  const filterBase = {
    chats: [closed, openMine],
    minhaFilaList: [closed, openMine],
    debouncedSearch: "",
    statusFilter: "todos",
    tagFilter: "todas",
    departamentoFilter: "todos",
    atendenteFilter: "todos",
    mineOnly: false,
    order: "recentes",
    user,
    adminAtendenteFilterId: null,
    onlyFinalizadasAusencia: false,
    aguardandoClienteOnly: false,
    pagamentosPendentesOnly: false,
    emAtrasoOnly: false,
    pendentesFuncionarioSet: null,
    conversaIdsPendenciaAtiva: null,
  };

  const filaFiltrada = computeChatsFiltrados({ ...filterBase, tab: "minha_fila" });
  assert.deepEqual(
    filaFiltrada.map((c) => c.id),
    [11],
    "conversa finalizada nao pode permanecer em Minha fila"
  );

  const emAtendimentoFiltrada = computeChatsFiltrados({
    ...filterBase,
    tab: "em_atendimento",
    minhaFilaList: null,
  });
  assert.deepEqual(
    emAtendimentoFiltrada.map((c) => c.id),
    [11],
    "conversa finalizada nao pode permanecer em Em atendimento"
  );

  const emAtendimentoSemAguardando = computeChatsFiltrados({
    ...filterBase,
    chats: [openMine, aguardandoCliente],
    tab: "em_atendimento",
    minhaFilaList: null,
  });
  assert.deepEqual(
    emAtendimentoSemAguardando.map((c) => c.id),
    [11],
    "aguardando_cliente nao pode pintar no chip Em atendimento"
  );

  const finalizadasFiltrada = computeChatsFiltrados({
    ...filterBase,
    tab: "finalizadas",
    minhaFilaList: null,
  });
  assert.deepEqual(
    finalizadasFiltrada.map((c) => c.id),
    [10],
    "conversa finalizada deve aparecer em Finalizadas"
  );

  const mergedAtividade = mergeChatRowListaAtividade(
    { ...openMine, status_atendimento: "em_atendimento" },
    { ...closed, ui_status_optimistic_at: Date.now() }
  );
  assert.equal(
    mergedAtividade.status_atendimento,
    "fechada",
    "GET stale nao pode reabrir status otimista mais recente"
  );

  const preservedGhost = mergeEmAtendimentoBackgroundRows(
    [closed, openMine],
    [openMine],
    "recentes",
    { user }
  );
  assert.equal(
    preservedGhost.some((c) => String(c.id) === "10"),
    false,
    "merge de Em atendimento nao pode preservar conversa fechada do cache"
  );

  const hiddenIds = new Set(["11"]);
  const hiddenMerge = mergeEmAtendimentoBackgroundRows(
    [openMine],
    [],
    "recentes",
    { user, hiddenIds }
  );
  assert.equal(hiddenMerge.length, 0, "tombstone deve impedir preserve no merge");

  const aberta = {
    id: 12,
    status_atendimento: "aberta",
    status_atendimento_real: "aberta",
    atendente_id: null,
    ultima_atividade: "2026-09-01T12:02:00.000Z",
  };
  assert.equal(chatRowIsStaleForTab(aberta, "em_atendimento"), true);
  assert.equal(
    shouldInsertChatRowInActiveList(aberta, { tab: "em_atendimento", user }),
    false,
    "nova_mensagem nao pode inserir conversa aberta no filtro Em atendimento"
  );
  assert.equal(
    shouldInsertChatRowInActiveList(openMine, { tab: "em_atendimento", user }),
    true
  );

  const emAtendimentoComFantasma = computeChatsFiltrados({
    ...filterBase,
    chats: [openMine, aberta],
    tab: "em_atendimento",
    minhaFilaList: null,
  });
  assert.deepEqual(
    emAtendimentoComFantasma.map((c) => c.id),
    [11],
    "conversa aberta nao pode pintar em Em atendimento"
  );

  const keepLive = mergeActiveTabBackgroundRows(
    [openMine, aberta],
    [],
    "recentes",
    { tab: "em_atendimento", user }
  );
  assert.deepEqual(
    keepLive.map((c) => c.id),
    [11],
    "resync background deve manter quem ainda pertence e descartar fantasma"
  );

  console.log("chat list fetch params: ok");
  console.log("chat list tab membership: ok");
} finally {
  await vite.close();
}
