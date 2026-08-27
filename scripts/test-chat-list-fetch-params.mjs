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
  const { buildChatListFetchParams } = await vite.ssrLoadModule(
    "/src/chats/chatListQueryHelpers.js"
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

  console.log("chat list fetch params: ok");
} finally {
  await vite.close();
}
