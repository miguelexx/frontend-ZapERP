import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const vite = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent',
  root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
const activeSyncs = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const until = async (condition) => {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise((r) => setTimeout(r, 2)); }
  assert.fail('Condição não ocorreu');
};
try {
  const { useChatStore } = await vite.ssrLoadModule('/src/chats/chatsStore.js');
  const { resolveMinhaFilaPaintRows, computeChatsFiltrados } = await vite.ssrLoadModule('/src/chats/chatListFilters.js');
  const { createUnreadSnapshotSync } = await vite.ssrLoadModule('/src/chats/unreadSnapshotSync.js');
  const cache = await vite.ssrLoadModule('/src/chats/chatListSidebarCache.js');
  const store = () => useChatStore.getState();
  const row = (id, unread_count = 0) => ({ id, contato_nome: `Contato ${id}`, atendente_id: 1,
    status_atendimento: 'em_atendimento', unread_count });
  store().limpar();
  for (let i = 0; i < 3; i++) store().incUnreadComBadge(11);
  store().addChat(row(11, 1));
  assert.equal(store().chats[0].unread_count, 3, 'card recebe o valor canônico, mesmo com GET atrasado');
  store().incUnreadComBadge(11);
  assert.equal(store().unreadById[11], 4);
  assert.equal(store().chats[0].unread_count, 4);
  store().setChats([row(11, 1)]);
  store().updateChat({ id: 11, unread_count: 1 });
  assert.equal(store().unreadTotal, 4, 'refetch e patch genérico não reduzem unread');
  store().clearUnread(11);
  store().addChat(row(11, 9));
  assert.equal(store().unreadById[11], 0, 'leitura não é desfeita por GET atrasado');
  assert.equal(store().chats[0].unread_count, 0);

  store().applyUnreadSnapshot({ 11: 2, 33: 5 }, store().unreadRevision);
  assert.equal(store().unreadTotal, 7, 'snapshot inclui conversas fora da aba');
  store().setChats([row(44, 99)]);
  assert.equal(store().chats[0].unread_count, 0, 'row ausente do snapshot não inventa contagem');
  assert.equal(store().unreadTotal, 7);
  store().applyUnreadSnapshot({ 11: 1 }, store().unreadRevision);
  assert.equal(store().unreadTotal, 1, 'snapshot remove excluídos/sem acesso e reflete leitura em outro dispositivo');
  const beforeRead = store().unreadRevision;
  store().clearUnread(11);
  assert.equal(store().applyUnreadSnapshot({ 11: 5, 77: 6 }, beforeRead), false);
  assert.equal(store().unreadById[11], 0, 'snapshot preserva leitura posterior ao GET');
  assert.equal(store().unreadById[77], 6, 'leitura concorrente não bloqueia outras conversas');

  const old = [row(11)];
  cache.persistChatListRowsForFilterToSession('empresa:usuario', 'minha_fila', old);
  cache.persistChatListRowsForFilterToSession('empresa:usuario', 'minha_fila', []);
  assert.deepEqual(cache.hydrateChatListRowsForFilterFromSession('empresa:usuario', 'minha_fila'), [], 'cache vazio substitui resultado anterior');
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('empresa:usuario', 'outra_consulta'), null, 'consulta sem carga é distinta de vazia');
  store().setChats(old);
  store().removeChat(11);
  assert.deepEqual(resolveMinhaFilaPaintRows(old, store().chats), [], 'remoção do último card não usa snapshot');
  store().setChats([row(33), row(44)]);
  assert.deepEqual(resolveMinhaFilaPaintRows(old, store().chats).map((r) => r.id), [33, 44], 'rajada substitui todos os IDs');
  const filtered = computeChatsFiltrados({ chats: store().chats, minhaFilaList: old, tab: 'minha_fila',
    user: { id: 1, role: 'admin' }, statusFilter: 'todos', tagFilter: 'todas', departamentoFilter: 'todos',
    atendenteFilter: 'todos', order: 'recentes', debouncedSearch: '', pendentesFuncionarioSet: new Set() });
  assert.deepEqual(filtered.map((r) => r.id).sort(), [33, 44]);

  const requests = [];
  const sync = createUnreadSnapshotSync({ getStore: store, delayMs: 2, retryMs: 2,
    fetchSnapshot: ({ signal }) => { const pending = deferred(); requests.push({ ...pending, signal }); return pending.promise; } });
  activeSyncs.push(sync);
  // Mesmo evento repetido não soma; uma única consulta absoluta serve à rajada.
  for (let i = 0; i < 20; i++) sync.request();
  await until(() => requests.length === 1);
  requests[0].resolve({ unread_by_id: { 33: 4 } });
  await until(() => store().unreadTotal === 4);
  sync.request({ immediate: true });
  await until(() => requests.length === 2);
  sync.request();
  requests[1].resolve({ unread_by_id: { 33: 1 } });
  await until(() => requests.length === 3);
  assert.equal(store().unreadTotal, 1, 'snapshot serializado aplica e agenda o evento que chegou durante o GET');
  requests[2].resolve({ unread_by_id: { 33: 5 } });
  await until(() => store().unreadTotal === 5);
  sync.request();
  await until(() => requests.length === 4);
  store().clearUnread(33);
  requests[3].resolve({ unread_by_id: { 33: 5 } });
  await until(() => requests.length === 5);
  assert.equal(store().unreadTotal, 0, 'snapshot atrasado não desfaz a leitura');
  requests[4].reject(new Error('rede'));
  await until(() => requests.length === 6);
  requests[5].resolve({ unread_by_id: { 44: 2 } });
  await until(() => store().unreadTotal === 2);
  sync.request({ immediate: true }); // reconexão: lê o estado completo, não replay de incrementos
  await until(() => requests.length === 7);
  requests[6].resolve({ unread_by_id: { 55: 8 } });
  await until(() => store().unreadTotal === 8);
  assert.equal(store().unreadById[44], undefined);
  sync.request();
  await until(() => requests.length === 8);
  sync.stop();
  store().limpar();
  requests[7].resolve({ unread_by_id: { 55: 99 } });
  await new Promise((r) => setTimeout(r, 8));
  assert.equal(requests[7].signal.aborted, true);
  assert.equal(store().unreadTotal, 0, 'resposta de sessão encerrada é ignorada');
  console.log('OK — contagem canônica, snapshots, rajadas, leitura, reconexão e Minha fila.');
} finally {
  activeSyncs.forEach((sync) => sync.stop());
  await vite.close();
}
