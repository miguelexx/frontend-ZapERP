// Auditoria isolada: usa o codigo real com HTTP e armazenamento simulados.
// Executar na raiz: node docs/audits/reproduzir-atendimento-2026-09-02.mjs
// Saida 1 indica que os cenarios de corretude ainda apresentam falhas.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
const user = { id: 1, role: 'admin', company_id: 1, departamento_ids: [1] };
localStorage.setItem('zap_erp_auth', JSON.stringify({ user }));
const vite = await createServer({
  appType: 'custom', configFile: false, logLevel: 'silent',
  root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { middlewareMode: true },
});
let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK: ${name}`); }
  catch (error) { failures++; console.log(`FALHA: ${name}\n${error.message}`); }
}
try {
  const helpers = await vite.ssrLoadModule('/src/chats/chatListQueryHelpers.js');
  const { resolveMinhaFilaPaintRows } = await vite.ssrLoadModule('/src/chats/chatListFilters.js');
  const { useChatStore } = await vite.ssrLoadModule('/src/chats/chatsStore.js');
  const { default: api } = await vite.ssrLoadModule('/src/api/http.js');
  // Nenhum acesso HTTP real, inclusive em timers disparados pelos stores.
  api.get = async () => ({ data: [] });
  const mine = { id: 11, atendente_id: 1, status_atendimento: 'em_atendimento', unread_count: 0 };
  const other = { id: 22, atendente_id: 2, status_atendimento: 'em_atendimento', unread_count: 0 };
  const params = { tab: 'finalizadas', statusFilter: 'todos', tagFilter: 'todas',
    departamentoFilter: 'todos', atendenteFilter: 'todos', debouncedSearch: '',
    adminAtendenteFilterId: 1, user, isSupervisorOrAdminFn: () => true };

  await check('nao lidas conhecidas sobrevivem a troca de aba', () => {
    useChatStore.getState().limpar();
    useChatStore.getState().setChats([{ ...mine, unread_count: 2 }]);
    useChatStore.getState().setChats([{ ...other, status_atendimento: 'fechada' }]);
    assert.equal(useChatStore.getState().unreadTotal, 2);
  });
  await check('GET completo da Minha fila remove extras antigos', () => {
    const result = helpers.mergeActiveTabBackgroundRows([mine, other], [mine], 'recentes', {
      tab: 'minha_fila', user, incomingIsComplete: true,
    });
    assert.deepEqual(result.map(c => c.id), [11]);
  });
  await check('chip Aguardando cliente nao duplica Em atendimento', () => {
    assert.deepEqual(helpers.chatRowChipCountKeys({ ...mine,
      aguardando_cliente_desde: '2026-09-02T12:00:00Z' }), ['aguardando_cliente']);
  });
  await check('filtro por funcionario em Finalizadas aceita o mesmo recorte do GET', () => {
    const query = helpers.buildChatListFetchParams(params);
    assert.equal(query.params.status_atendimento, undefined);
    assert.equal(query.params.atendente_id, 1);
    assert.equal(helpers.shouldInsertChatRowInActiveList(mine, {
      tab: 'finalizadas', adminAtendenteFilterId: 1, user,
    }), true, 'GET aceita a row; socket rejeita por status da aba');
  });
  await check('limpar busca restaura imediatamente a regra da aba', () => {
    assert.equal(helpers.shouldInsertChatRowInActiveList(mine, {
      tab: 'finalizadas', searchActive: false, searchDebounced: true, user,
    }), false, 'o debounce anterior ainda permite inserir conversa aberta em Finalizadas');
  });
  await check('Minha fila vazia no store nao restaura snapshot antigo', () => {
    assert.deepEqual(resolveMinhaFilaPaintRows([mine], []), []);
  });
  await check('Minha fila com IDs completamente renovados usa o store atual', () => {
    const replacement = { ...mine, id: 33 };
    assert.deepEqual(resolveMinhaFilaPaintRows([mine], [replacement]).map(c => c.id), [33]);
  });
  await check('snapshot HTTP atrasado nao faz perder nao lidas no evento seguinte', () => {
    useChatStore.getState().limpar();
    useChatStore.getState().incUnreadComBadge(11, 3);
    useChatStore.getState().addChat({ ...mine, unread_count: 1 });
    assert.equal(useChatStore.getState().unreadTotal, 3);
    useChatStore.getState().incUnreadComBadge(11, 1);
    assert.equal(useChatStore.getState().unreadTotal, 4, 'o mapa tinha 3 mas o incremento usa a row com 1');
  });
  await check('busca na aba Minha fila nao acrescenta minha_fila ao GET global', async () => {
    const { fetchMinhaFilaChatsCompleto } = await vite.ssrLoadModule('/src/chats/chatService.js');
    const query = helpers.buildChatListFetchParams({ ...params, tab: 'minha_fila',
      adminAtendenteFilterId: null, debouncedSearch: 'Maria' });
    let sent;
    api.get = async (url) => { sent = new URL(url, 'http://audit.local').searchParams; return { data: [], headers: {} }; };
    // Esta e a funcao escolhida pelo ramo minhaFilaTab de load em chatList.jsx.
    await fetchMinhaFilaChatsCompleto(query.params);
    assert.equal(sent.get('palavra'), 'Maria');
    assert.equal(sent.get('minha_fila'), null, 'a funcao de busca completa restringe novamente a busca global');
  });
  await check('reconcile de video revoga a URL blob substituida', async () => {
    const { mergeMessageIntoListForTest } = await vite.ssrLoadModule('/src/conversa/conversaOutboundMediaMerge.js');
    const original = URL.revokeObjectURL;
    const revoked = [];
    URL.revokeObjectURL = url => revoked.push(url);
    try {
      const temp = { tempId: 'audit-video', client_temp_id: 'audit-video', conversa_id: 1,
        direcao: 'out', tipo: 'video', url: 'blob:audit-video', _optimisticBlobUrl: 'blob:audit-video',
        criado_em: '2026-09-02T12:00:00Z', status: 'pending', status_mensagem: 'pending' };
      const real = { id: 100, client_temp_id: 'audit-video', conversa_id: 1, direcao: 'out',
        tipo: 'video', url: '/uploads/audit-video.mp4', criado_em: temp.criado_em,
        status: 'sent', status_mensagem: 'sent' };
      const merged = mergeMessageIntoListForTest([temp], 1, real);
      assert.equal(merged.length, 1);
      assert.equal(merged[0]._optimisticBlobUrl, undefined);
      assert.deepEqual(revoked, ['blob:audit-video']);
    } finally { URL.revokeObjectURL = original; }
  });
  await check('refresh antigo nao sobrescreve conversa reaberta apos A-B-A', async () => {
    const { useConversaStore } = await vite.ssrLoadModule('/src/conversa/conversaStore.js');
    const { useAuthStore } = await vite.ssrLoadModule('/src/auth/authStore.js');
    useAuthStore.setState({ user });
    const requests = [];
    api.get = (url, config) => new Promise(resolve => requests.push({ url, config, resolve }));
    const payload = (id, status) => ({ data: { conversa: { id, atendente_id: 1,
      status_atendimento: status, status_atendimento_real: status }, mensagens: [], tags: [] } });
    useConversaStore.setState({ selectedId: 1, conversa: { id: 1, atendente_id: 1 }, mensagens: [], loading: false });
    const stale = useConversaStore.getState().refresh({ silent: true });
    const requestOld = requests.shift();
    const openB = useConversaStore.getState().carregarConversa(2);
    const requestB = requests.shift();
    assert.equal(requestB?.url, '/chats/2');
    requestB.resolve(payload(2, 'em_atendimento'));
    await openB;
    const openA = useConversaStore.getState().carregarConversa(1);
    const requestA = requests.shift();
    assert.equal(requestA?.url, '/chats/1');
    requestA.resolve(payload(1, 'em_atendimento'));
    await openA;
    assert.equal(useConversaStore.getState().conversa.status_atendimento, 'em_atendimento');
    requestOld.resolve(payload(1, 'aberta'));
    await stale;
    const actual = useConversaStore.getState().conversa.status_atendimento;
    useConversaStore.getState().setSelectedId(null);
    api.get = async () => ({ data: [] });
    assert.equal(actual, 'em_atendimento', 'refresh antigo restaurou status aberta depois do novo carregamento');
  });
} finally {
  await vite.close();
}
console.log(`\n${failures} cenario(s) com falha de corretude.`);
process.exitCode = failures ? 1 : 0;
