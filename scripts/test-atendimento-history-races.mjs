import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const vite = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
try {
  const { useConversaStore: store } = await vite.ssrLoadModule('/src/conversa/conversaStore.js');
  const { default: api } = await vite.ssrLoadModule('/src/api/http.js');
  const requests = [];
  api.get = (url, config) => new Promise((resolve, reject) => requests.push({ url, config, resolve, reject }));
  const seed = (id = 1) => {
    store.getState().limpar();
    store.setState({ selectedId: id, conversa: { id }, mensagens: [{ id: 100, conversa_id: id, texto: 'Atual', criado_em: '2026-09-08T12:00:00Z' }], cursor: '2026-09-08T11:00:00Z', cursorId: 90, hasMore: true });
  };
  const payload = (id, cursor = null) => ({ data: { conversa: { id }, mensagens: [{ id: 5, conversa_id: id, texto: 'Antiga', criado_em: '2026-09-08T10:00:00Z' }], next_cursor: cursor, next_cursor_id: cursor ? 5 : null } });
  let passed = 0;
  for (const action of ['loadMore', 'loadAllMessages']) {
    for (const fail of [false, true]) {
      seed();
      const old = store.getState()[action](); const stale = requests.shift();
      seed(2);
      const latest = store.getState().loadMore(); const current = requests.shift();
      assert.equal(stale.config.signal.aborted, true);
      if (fail) stale.reject(new Error('Resposta antiga')); else stale.resolve(payload(1));
      await old;
      assert.equal(store.getState().loadingMore, true, 'A não encerra loading de B');
      assert.deepEqual(store.getState().mensagens.map(m => m.id), [100]);
      current.resolve(payload(2)); await latest;
      assert.equal(store.getState().loadingMore, false);
      passed++;
    }
    seed(); const old = store.getState()[action](); const stale = requests.shift();
    seed(2); seed(1);
    stale.resolve(payload(1)); await old;
    assert.deepEqual(store.getState().mensagens.map(m => m.id), [100], 'A→B→A não aceita histórico da geração anterior');
    passed++;
  }
  for (const finished of [false, true]) {
    seed();
    store.setState({ cursor: finished ? null : '2026-09-08T09:00:00Z', cursorId: finished ? null : 1, hasMore: !finished });
    const refresh = store.getState().refresh({ silent: true });
    requests.shift().resolve(payload(1, '2026-09-08T10:00:00Z')); await refresh;
    assert.equal(store.getState().cursor, finished ? null : '2026-09-08T09:00:00Z');
    assert.equal(store.getState().hasMore, !finished);
    passed++;
  }
  store.getState().limpar();
  console.log(`OK — ${passed} cenários de concorrência/paginação do histórico.`);
} finally { await vite.close(); }
