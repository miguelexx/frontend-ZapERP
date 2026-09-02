import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom", configFile: false, logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});
try {
  const h = await vite.ssrLoadModule("/src/chats/chatListQueryHelpers.js");
  const { computeChatsFiltrados } = await vite.ssrLoadModule("/src/chats/chatListFilters.js");
  const { useChatStore } = await vite.ssrLoadModule("/src/chats/chatsStore.js");
  const user = { id: 9, role: "admin", company_id: 1 };
  const row = (id, status, extra = {}) => ({ id, atendente_id: 1, departamento_id: 10,
    contato_nome: `Contato ${id}`, status_atendimento: status, status_atendimento_real: status, ...extra });
  const mine = row(11, "em_atendimento");
  const closed = row(12, "fechada");
  const opened = row(13, "aberta");
  const absent = row(14, "fechada", { finalizacao_motivo: "ausencia_cliente" });
  const waiting = row(15, "em_atendimento", { aguardando_cliente_desde: "2026-09-02T12:00:00Z" });
  const other = row(16, "em_atendimento", { atendente_id: 2 });
  const group = row(17, "em_atendimento", { is_group: true });
  const rows = [mine, closed, opened, absent, waiting, other, group];
  const base = {
    user, tab: "finalizadas", statusFilter: "todos", tagFilter: "todas",
    departamentoFilter: "todos", atendenteFilter: "todos", debouncedSearch: "",
    adminAtendenteFilterId: 1, onlyFinalizadasAusencia: false, aguardandoClienteOnly: false,
    pagamentosPendentesOnly: false, emAtrasoOnly: false, isFinanceiroUser: false,
    isSupervisorOrAdminFn: () => true, pendentesFuncionarioIds: [], mineOnly: false,
    order: "recentes", chats: rows, minhaFilaList: [], pendentesFuncionarioSet: new Set(),
  };
  const ids = (items) => items.map(c => c.id).sort((a, b) => a - b);
  const tabs = ["minha_fila", "todas", "hoje", "abertas", "em_atendimento", "finalizadas",
    "aguardando_atendente", "aguardando_funcionario", "pagamentos_pendentes", "em_atraso",
    "campanhas", "mensagens_disparadas"];
  for (const tab of tabs) {
    const view = { ...base, tab };
    const query = h.buildChatListFetchParams(view).params;
    assert.equal(query.atendente_id, 1, tab);
    for (const key of ["status_atendimento", "minha_fila", "hoje", "campanhas", "conversa_ids"]) {
      assert.equal(query[key], undefined, `${tab}: funcionário substitui ${key}`);
    }
    assert.deepEqual(ids(computeChatsFiltrados(view)), [11, 12, 13, 14, 15], `pintura ${tab}`);
    for (const item of rows) {
      const expected = item.atendente_id === 1 && !item.is_group;
      assert.equal(h.shouldInsertChatRowInActiveList(item, view), expected, `insert ${tab}/${item.id}`);
      assert.equal(h.shouldRemoveChatFromViewerList(item, view), !expected, `drop ${tab}/${item.id}`);
    }
    assert.equal(h.shouldHideOptimisticClosedFromTab(tab, { patch: closed }, view), false);
    assert.deepEqual(ids(h.mergeActiveTabBackgroundRows([mine, closed, other], [opened], "recentes", view)),
      [11, 12, 13], `resync preserva o recorte do funcionário em ${tab}`);
  }

  for (const refinement of [
    { tab: "finalizadas_auto", expected: [14], param: "finalizacao_motivo" },
    { onlyFinalizadasAusencia: true, expected: [14], param: "finalizacao_motivo" },
    { tab: "aguardando_cliente", expected: [15], param: "aguardando_cliente" },
    { aguardandoClienteOnly: true, expected: [15], param: "aguardando_cliente" },
  ]) {
    const view = { ...base, ...refinement };
    assert.ok(h.buildChatListFetchParams(view).params[refinement.param]);
    assert.deepEqual(ids(computeChatsFiltrados(view)), refinement.expected);
    assert.deepEqual(ids(rows.filter(item => h.shouldInsertChatRowInActiveList(item, view))), refinement.expected);
    assert.deepEqual(ids(rows.filter(item => !h.shouldRemoveChatFromViewerList(item, view))), refinement.expected);

    const search = { ...view, debouncedSearch: "Contato", searchActive: true, searchDebounced: true };
    assert.equal(h.buildChatListFetchParams(search).params[refinement.param], undefined);
    assert.deepEqual(ids(computeChatsFiltrados(search)), [11, 12, 13, 14, 15]);
    assert.equal(h.shouldInsertChatRowInActiveList(mine, search), true);
  }

  const filteredDepartment = { ...base, departamentoFilter: "20" };
  assert.deepEqual(computeChatsFiltrados(filteredDepartment), []);
  assert.equal(h.shouldInsertChatRowInActiveList(mine, filteredDepartment), false);
  assert.equal(h.shouldRemoveChatFromViewerList(mine, filteredDepartment), true);
  assert.equal(h.shouldInsertChatRowInActiveList(mine, { ...base,
    hiddenClosed: { 11: { expiresAt: Date.now() + 60_000 } } }), false, "preserva tombstone de GET antigo");

  const normal = { ...base, adminAtendenteFilterId: null };
  assert.equal(h.buildChatListFetchParams(normal).params.status_atendimento, "fechada");
  assert.equal(h.shouldInsertChatRowInActiveList(mine, normal), false);
  assert.equal(h.shouldRemoveChatFromViewerList(mine, normal), true);
  assert.deepEqual(ids(computeChatsFiltrados(normal)), [12, 14]);

  useChatStore.getState().setChatListView({ ...base, onlyFinalizadasAusencia: true, aguardandoClienteOnly: true });
  const published = h.buildActiveChatListViewFromStore(useChatStore.getState(), user);
  assert.equal(published.onlyFinalizadasAusencia, true);
  assert.equal(published.aguardandoClienteOnly, true);
  useChatStore.getState().setChatListView({ ...base, onlyFinalizadasAusencia: false, aguardandoClienteOnly: false });
  const cleared = h.buildActiveChatListViewFromStore(useChatStore.getState(), user);
  assert.equal(cleared.onlyFinalizadasAusencia, false);
  assert.equal(cleared.aguardandoClienteOnly, false);
  console.log("OK — filtro por funcionário: HTTP, insert/drop, pintura, resync e refinamentos alinhados.");
} finally {
  await vite.close();
}
